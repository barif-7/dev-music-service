"""Explicit component decorators over real local app APIs.

No JSX scanning, synthetic props, model-generated handlers, or arbitrary URLs.
One pooled proxy per application is shared by all embeds and API adapters.
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import quote, urlsplit

import httpx


@dataclass(frozen=True)
class Operation:
    method: str
    path: str
    query: tuple[str, ...] = ()
    body_defaults: tuple[tuple[str, str], ...] = ()


@dataclass(frozen=True)
class LiveApplication:
    """A local app the picker can browse.

    Two tiers. A *mounted* app is a compiled bundle this shell serves and can
    frame; that is all most of the Base44 surfaces are, and there is no process
    behind them to probe. A *service* app additionally has a local backend, so
    its components can be driven rather than only shown -- `setting` names the
    config attribute holding its base URL, and it is the presence of that
    setting that separates the tiers.

    `base44_repo` and `base44_app_id` are the app's identity in the Base44
    export index, which is how its reusable components are found in the vault.
    The app id is the join key rather than the name: sibling copies of one app
    share a name and must not share a component list.
    """
    id: str
    name: str
    bundle: str
    setting: str | None = None
    health: str | None = None
    health_identity: tuple[str, object] | None = None
    base44_repo: str = ''
    base44_app_id: str = ''
    # What Base44 calls the app, which is not always what the catalogue calls
    # it -- "Lyric Shader Lab" against "Lyrics Shader Lab". Searching either
    # spelling has to find the app, so both are matched on.
    base44_name: str = ''

    @property
    def tier(self) -> str:
        return 'service' if self.setting else 'mounted'


@dataclass(frozen=True)
class LiveComponent:
    app: str
    key: str
    name: str
    surface: str
    description: str
    operations: dict[str, Operation] = field(default_factory=dict)


class LiveAppProxy:
    def __init__(self, app_id: str, base_url: str, client=None):
        self.app_id = app_id
        self.base_url = base_url.rstrip('/')
        parsed = urlsplit(base_url)
        if parsed.scheme not in {'http', 'https'} or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError('A configured local app URL is required')
        self.client = client or httpx.AsyncClient(
            trust_env=False,
            follow_redirects=False,
            timeout=15,
            limits=httpx.Limits(max_connections=12, max_keepalive_connections=4),
        )
        self._health = None
        self._health_time = 0
        self._probe_lock = asyncio.Lock()

    async def request(self, method, path, **kwargs):
        # All callers resolve paths from server-owned operation definitions.
        return await self.client.request(method, f'{self.base_url}/{path.lstrip("/")}', **kwargs)

    async def active(self, app: LiveApplication, fresh=False):
        async with self._probe_lock:
            if not fresh and self._health is not None and time.monotonic() - self._health_time < 3:
                return self._health
            try:
                response = await self.request('GET', app.health, timeout=2)
                data = response.json()
                ok = response.status_code == 200 and isinstance(data, dict)
                if app.health_identity:
                    key, expected = app.health_identity
                    ok = ok and data.get(key) == expected
            except (httpx.HTTPError, ValueError):
                ok = False
            self._health, self._health_time = ok, time.monotonic()
            return ok


APPLICATIONS: dict[str, LiveApplication] = {}
COMPONENTS: dict[str, LiveComponent] = {}
_PROXIES: dict[tuple[str, str], LiveAppProxy] = {}


def register_application(application: LiveApplication):
    APPLICATIONS[application.id] = application


def expose_component(*, app, key, name, surface, description, operations):
    """Decorate an API adapter with the UI and operations it actually backs."""
    if not surface.startswith('/') or surface.startswith('//'):
        raise ValueError('Component views must use a bundled same-origin path')
    component = LiveComponent(app, key, name, surface, description, operations)
    identity = f'{app}:{key}'
    if identity in COMPONENTS:
        raise ValueError(f'Duplicate live component: {identity}')
    COMPONENTS[identity] = component

    def decorate(handler):
        handler.__live_components__ = [*getattr(handler, '__live_components__', []), component]
        return handler
    return decorate


def app_proxy(app_id, settings):
    application = APPLICATIONS[app_id]
    if not application.setting:
        raise ValueError(f'{application.name} is a mounted bundle with no local service')
    base_url = str(getattr(settings, application.setting)).rstrip('/')
    key = app_id, base_url
    proxy = _PROXIES.get(key)
    if proxy is None or proxy.client.is_closed:
        proxy = _PROXIES[key] = LiveAppProxy(app_id, base_url)
    return proxy


async def close_proxies():
    for proxy in _PROXIES.values():
        await proxy.client.aclose()
    _PROXIES.clear()


async def active_applications(settings, static_dir: Path, fresh=False):
    """Every app that is actually available right now, by its own standard.

    A mounted app is live when the shell can serve its bundle; a service app
    also has to have its backend answering, because a component that forwards
    to a dead API is worse than one that is absent.
    """
    async def check(app):
        if not (static_dir / app.bundle / 'index.html').is_file():
            return None
        service = 'none'
        if app.setting:
            service = 'live' if await app_proxy(app.id, settings).active(app, fresh) else 'offline'
        # A backend going down costs the app its drivable components, not its
        # place in the picker: the bundle still frames, and the components it
        # exported are still worth browsing. Only what needs the API is hidden.
        drivable = service != 'offline'
        return {'id': app.id, 'name': app.name, 'export_name': app.base44_name, 'status': 'live',
                'tier': app.tier if drivable else 'mounted', 'service': service,
                'bundle': f'/static/{app.bundle}/index.html',
                'base44_app_id': app.base44_app_id, 'base44_repo': app.base44_repo,
                'component_count': sum(c.app == app.id and (drivable or not c.operations)
                                       for c in COMPONENTS.values())}
    return [row for row in await asyncio.gather(*(check(app) for app in APPLICATIONS.values())) if row]


def component_result(component):
    app = APPLICATIONS[component.app]
    return {'id': f'{component.app}:{component.key}', 'name': component.name,
            'app': app.name, 'app_id': app.id, 'project': app.id, 'kind': 'component',
            'status': 'live', 'category': 'live-app', 'description': component.description,
            'rel_path': component.surface, 'surface_url': component.surface,
            'preview_url': f'/components/{quote(app.id)}/{quote(component.key)}',
            'operations': list(component.operations)}
