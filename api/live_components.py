import re
from pathlib import Path
from typing import Literal
from urllib.parse import quote, urlsplit

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field

from config import get_settings
from services.base44_index import buckets_for
from services.component_vault_service import ComponentVaultError, get_component_vault
from services.live_components import (
    APPLICATIONS, COMPONENTS, active_applications, app_proxy, component_result,
)

router = APIRouter(tags=['live-components'])
STATIC_DIR = Path(__file__).resolve().parents[1] / 'static'


def local_settings():
    settings = get_settings()
    if settings.vercel:
        raise HTTPException(503, 'Live components are available in the local app.')
    return settings


@router.get('/api/components/apps')
async def apps():
    rows = await active_applications(local_settings(), STATIC_DIR, fresh=True)
    return JSONResponse({'apps': rows, 'source': 'live-apps'}, headers={'Cache-Control': 'no-store'})


async def _reusable(active, app: str, q: str, limit: int):
    """The vault components exported from one running app.

    Scoped to a single app on purpose. The vault holds 780-odd distinct
    components across every export ever ingested, and handing that back
    unscoped is the undifferentiated index this picker replaced. An app has to
    be named, it has to be running, and it has to carry a Base44 app id.
    """
    chosen = next((row for row in active if row['id'] == app), None)
    if chosen is None:
        raise HTTPException(404, 'That app is not running.')
    if not chosen.get('base44_app_id'):
        return [], '', 0
    # The vault is a developer-machine service, so an unreachable one is an
    # ordinary 503 rather than a 500, matching /api/components/vault-search.
    try:
        catalog = await get_component_vault(local_settings()).catalog_projects()
        buckets = buckets_for(chosen['base44_repo'], catalog)
        if not buckets:
            return [], '', 0
        payload = await get_component_vault(local_settings()).for_projects(buckets, q, limit)
    except ComponentVaultError as exc:
        raise HTTPException(503, str(exc)) from exc
    rows = [{**row, 'kind': 'reusable', 'status': row.get('status') or 'unknown',
             'app_id': chosen['id'], 'app': chosen['name'], 'origin': 'vault',
             'surface_url': '', 'base44_app_id': chosen['base44_app_id']}
            for row in payload['results']]
    return rows, payload['preview_origin'], payload['total_matches']


@router.get('/api/components/search')
async def search(q: str = Query(default='', max_length=200), app: str = '',
                 kind: Literal['app', 'component', 'reusable'] = 'component',
                 limit: int = Query(default=60, ge=1, le=200)):
    active = await active_applications(local_settings(), STATIC_DIR, fresh=True)
    allowed = {row['id'] for row in active}
    needle = q.strip().casefold()
    preview_origin = ''
    if kind == 'reusable':
        # The vault filters and ranks its own results; re-filtering here on the
        # same words would drop matches it found in source that these fields
        # never carry.
        results, preview_origin, matches = await _reusable(active, app, q.strip(), limit)
        return JSONResponse({'results': results, 'total': len(results), 'total_matches': matches,
                             'apps': active, 'source': 'vault-reusable', 'preview_origin': preview_origin},
                            headers={'Cache-Control': 'no-store'})
    if kind == 'app':
        results = [{**row, 'kind': 'app', 'app_id': row['id'], 'app': row['name'],
                    'description': _app_blurb(row)} for row in active]
    else:
        offline = {row['id'] for row in active if row.get('service') == 'offline'}
        results = [component_result(c) for c in COMPONENTS.values()
                   if c.app in allowed and (not app or c.app == app)
                   and not (c.operations and c.app in offline)]
    results = [row for row in results
               if needle in ' '.join(str(row.get(k, '')) for k in
                                     ('name', 'export_name', 'app', 'description', 'id')).casefold()]
    results.sort(key=lambda row: (row['name'].casefold() != needle, row['name'].casefold()))
    return JSONResponse({'results': results[:limit], 'total': len(results), 'total_matches': len(results),
                         'apps': active, 'source': 'live-apps'}, headers={'Cache-Control': 'no-store'})


def _app_blurb(row):
    """What an app row says about itself in the picker.

    A mounted bundle and a service-backed app are both browsable, and saying
    which is which is the difference between a component you can drive and one
    you can only look at.
    """
    live = row['component_count']
    if row.get('service') == 'live':
        return f"{live} live component{'' if live == 1 else 's'} · backed by a local service"
    if row.get('service') == 'offline':
        return f"{live} view{'' if live == 1 else 's'} · its service is offline"
    return f"{live} view{'' if live == 1 else 's'} · mounted bundle"


async def require_component(app_id, key):
    """The component, and the proxy that backs it if it has one.

    A mounted app is available as soon as its bundle is on disk -- there is no
    service to probe, and none of its components declare an operation, so the
    proxy is None and every caller that needs one fails on the operation
    lookup before it would have been used.
    """
    component = COMPONENTS.get(f'{app_id}:{key}')
    if not component:
        raise HTTPException(404, 'This live component is not registered.')
    settings = local_settings()
    app = APPLICATIONS[app_id]
    if not (STATIC_DIR / app.bundle / 'index.html').is_file():
        raise HTTPException(503, f'{app.name} is not built. Vendor its surface and reopen this component.')
    if not app.setting:
        return component, None
    if not await app_proxy(app_id, settings).active(app, fresh=True):
        raise HTTPException(503, f'{app.name} is offline. Start its local service and reopen this component.')
    return component, app_proxy(app_id, settings)


@router.get('/api/components/{app_id}/{key}')
async def resolve(app_id: str, key: str):
    component, _ = await require_component(app_id, key)
    return JSONResponse(component_result(component), headers={'Cache-Control': 'no-store'})


class Invocation(BaseModel):
    model_config = ConfigDict(extra='forbid')
    operation: str = Field(min_length=1, max_length=60)
    params: dict = Field(default_factory=dict, max_length=20)
    body: dict | None = None


@router.post('/api/components/{app_id}/{key}/invoke')
async def invoke(app_id: str, key: str, invocation: Invocation, request: Request):
    origin = request.headers.get('origin')
    if origin and urlsplit(origin).netloc != request.headers.get('host'):
        raise HTTPException(403, 'Component actions must come from this app')
    component, proxy = await require_component(app_id, key)
    action = component.operations.get(invocation.operation)
    if action is None:
        raise HTTPException(400, 'This component does not expose that operation.')
    path = action.path
    path_keys = re.findall(r'\{(\w+)\}', path)
    if set(invocation.params) - set(action.query) - set(path_keys):
        raise HTTPException(422, 'Unknown component operation parameter')
    for field in path_keys:
        value = str(invocation.params.get(field, ''))
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,120}', value):
            raise HTTPException(422, f'Invalid {field}')
        path = path.replace('{' + field + '}', quote(value, safe=''))
    params = {k: v for k, v in invocation.params.items() if k in action.query}
    if any(not isinstance(v, (str, int, float, bool)) or len(str(v)) > 2000 for v in params.values()):
        raise HTTPException(422, 'Invalid query parameter')
    headers = {}
    body = invocation.body
    if action.body_defaults:
        body = dict(body or {})
        settings = local_settings()
        for field, setting in action.body_defaults:
            body.setdefault(field, str(Path(getattr(settings, setting)).expanduser()))
    # Only the Canvas app needs its user's bearer token, and it stays attached
    # to that application's proxy; a pooled client never stores user headers.
    if app_id == 'canvas' and request.headers.get('authorization'):
        headers['Authorization'] = request.headers['authorization']
    try:
        result = await proxy.request(action.method, path, params=params, json=body,
                                     headers=headers, timeout=100 if invocation.operation == 'lookup' else 15)
    except httpx.HTTPError as exc:
        raise HTTPException(503, 'The live app could not complete this action.') from exc
    return Response(result.content, status_code=result.status_code, media_type=result.headers.get('content-type', 'application/json'),
                    headers={'Cache-Control': 'no-store'})


@router.get('/components/{app_id}/{key}')
async def embed(app_id: str, key: str):
    # The wrapper resolves availability itself so an offline app has a useful
    # retry state rather than an unstyled JSON error embedded in a note.
    if f'{app_id}:{key}' not in COMPONENTS:
        raise HTTPException(404, 'Unknown live component')
    return FileResponse(STATIC_DIR / 'components/host.html', headers={
        'X-Frame-Options': 'SAMEORIGIN', 'Cache-Control': 'no-store',
    })
