from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI

import api.live_components as routes
import services.base44_index as base44_index
import services.live_components as registry


@pytest.fixture
def live_registry(tmp_path, monkeypatch):
    app = registry.LiveApplication(id='example', name='Example', bundle='example', setting='example_url',
                                   health='/health', health_identity=('ready', True),
                                   base44_repo='base44-repo-example', base44_app_id='6a00example',
                                   base44_name='Example (Copy)')
    component = registry.LiveComponent('example', 'list', 'Example list', '/example?surface=list', 'Real items', {
        'items': registry.Operation('GET', '/items', ('q',)),
        'save': registry.Operation('POST', '/items/{id}'),
    })
    monkeypatch.setattr(registry, 'APPLICATIONS', {'example': app})
    monkeypatch.setattr(registry, 'COMPONENTS', {'example:list': component})
    monkeypatch.setattr(registry, '_PROXIES', {})
    monkeypatch.setattr(routes, 'APPLICATIONS', registry.APPLICATIONS)
    monkeypatch.setattr(routes, 'COMPONENTS', registry.COMPONENTS)
    monkeypatch.setattr(routes, 'STATIC_DIR', tmp_path)
    settings = SimpleNamespace(example_url='http://127.0.0.1:12345', vercel=False)
    monkeypatch.setattr(routes, 'get_settings', lambda: settings)
    (tmp_path / 'example').mkdir()
    (tmp_path / 'example/index.html').write_text('<html>Compiled bundle</html>')
    return settings, tmp_path, app


@pytest.mark.asyncio
async def test_a_backend_going_down_costs_the_app_its_operations_not_its_place(live_registry):
    """A dead API hides what it would have driven. The bundle still frames."""
    settings, root, app = live_registry
    ready = [True]

    def handler(request):
        return httpx.Response(200, json={'ready': ready[0]})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        registry._PROXIES[(app.id, settings.example_url)] = registry.LiveAppProxy(app.id, settings.example_url, client)

        (row,) = await registry.active_applications(settings, root, fresh=True)
        assert (row['tier'], row['service'], row['component_count']) == ('service', 'live', 1)

        ready[0] = False
        (row,) = await registry.active_applications(settings, root, fresh=True)
        assert (row['tier'], row['service'], row['component_count']) == ('mounted', 'offline', 0)

        # Without the bundle there is nothing to frame, so it does leave.
        ready[0] = True
        (root / 'example/index.html').rename(root / 'example/missing.html')
        assert await registry.active_applications(settings, root, fresh=True) == []


@pytest.mark.asyncio
async def test_a_mounted_bundle_is_live_without_any_service_to_probe(live_registry, monkeypatch):
    settings, root, _ = live_registry
    mounted = registry.LiveApplication(id='mounted', name='Mounted', bundle='mounted',
                                       base44_repo='base44-repo-mounted', base44_app_id='6a00mounted')
    monkeypatch.setitem(registry.APPLICATIONS, 'mounted', mounted)
    (root / 'mounted').mkdir()
    (root / 'mounted/index.html').write_text('<html>Compiled bundle</html>')

    rows = {row['id']: row for row in await registry.active_applications(settings, root, fresh=True)}
    assert (rows['mounted']['tier'], rows['mounted']['service']) == ('mounted', 'none')
    assert rows['mounted']['base44_app_id'] == '6a00mounted'
    # There is no base URL to build a proxy from, and asking for one is a bug.
    with pytest.raises(ValueError, match='no local service'):
        registry.app_proxy('mounted', settings)


def test_sibling_exports_of_one_app_do_not_share_a_component_list():
    """Two copies of an app carry one name and two ids; the id is the key."""
    projects = ['base44-repo-orbitjobs-69edf69d--apps', 'base44-repo-orbitjobs-69fbf067',
                'base44-repo-canvas', 'base44-repo-canvas--github', 'base44-repo-canvas-extra']
    assert base44_index.buckets_for('base44-repo-orbitjobs-69edf69d', projects) == [
        'base44-repo-orbitjobs-69edf69d--apps']
    assert base44_index.buckets_for('base44-repo-orbitjobs-69fbf067', projects) == [
        'base44-repo-orbitjobs-69fbf067']
    # Every ingest of one export counts; a different repo sharing a prefix does not.
    assert base44_index.buckets_for('base44-repo-canvas', projects) == [
        'base44-repo-canvas', 'base44-repo-canvas--github']


@pytest.mark.asyncio
async def test_one_proxy_per_app_and_duplicate_registration_rejected(live_registry):
    settings, _, _ = live_registry
    first = registry.app_proxy('example', settings)
    assert registry.app_proxy('example', settings) is first
    with pytest.raises(ValueError, match='Duplicate'):
        registry.expose_component(app='example', key='list', name='Duplicate', surface='/example', description='', operations={})
    await registry.close_proxies()


@pytest.mark.asyncio
async def test_search_and_invocation_use_live_contracts(live_registry):
    settings, _, app = live_registry
    calls = []

    def handler(request):
        calls.append(request)
        if request.url.path == '/health':
            return httpx.Response(200, json={'ready': True})
        return httpx.Response(201, json={'id': 'actual-result', 'saved': True})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as upstream:
        registry._PROXIES[(app.id, settings.example_url)] = registry.LiveAppProxy(app.id, settings.example_url, upstream)
        api = FastAPI()
        api.include_router(routes.router)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(api), base_url='http://local.test') as client:
            apps = (await client.get('/api/components/search?kind=app')).json()
            assert apps['results'][0]['kind'] == 'app'
            components = (await client.get('/api/components/search?app=example')).json()
            assert [r['id'] for r in components['results']] == ['example:list']
            result = await client.post('/api/components/example/list/invoke', json={
                'operation': 'save', 'params': {'id': '123'}, 'body': {'name': 'Changed'},
            })
            assert result.status_code == 201
            assert result.json() == {'id': 'actual-result', 'saved': True}
            assert calls[-1].url.path == '/items/123'
            assert calls[-1].content == b'{"name":"Changed"}'
            for payload in [
                {'operation': 'delete-everything'},
                {'operation': 'save', 'params': {'id': '../../private'}},
                {'operation': 'items', 'params': {'url': 'https://external.test'}},
            ]:
                assert (await client.post('/api/components/example/list/invoke', json=payload)).status_code in (400, 422)
            assert (await client.post('/api/components/example/list/invoke', json={'operation': 'items'}, headers={'origin': 'https://external.test'})).status_code == 403


def test_registered_embeds_use_local_bundles_and_restrict_ancestors(client):
    response = client.get('/components/vocabulary/library')
    assert response.status_code == 200
    assert '/static/components/host.js' in response.text
    assert 'frame-ancestors' in response.headers['content-security-policy']
    assert client.get('/components/unknown/fake').status_code == 404
    response = client.get('/vocabulary?live-component=vocabulary:library')
    assert response.status_code == 200
    assert 'x-frame-options' not in response.headers
    assert client.get('/?live-component=vocabulary:library').headers['x-frame-options'] == 'DENY'


@pytest.mark.asyncio
async def test_the_reusable_store_is_scoped_to_one_running_export(live_registry, monkeypatch):
    """The vault holds every export ever ingested; a store is one app's slice."""
    settings, _, app = live_registry
    asked = []

    class FakeVault:
        async def catalog_projects(self):
            return ['base44-repo-example--apps', 'base44-repo-example', 'base44-repo-other']

        async def for_projects(self, projects, query, limit):
            asked.append((tuple(projects), query))
            return {'query': query, 'total_matches': 40, 'preview_origin': 'http://127.0.0.1:4174',
                    'results': [{'id': 'base44-repo-example::Card-jsx', 'name': 'Card',
                                 'rel_path': 'components/Card.jsx', 'status': 'pass',
                                 'preview_url': 'http://127.0.0.1:4174/?id=x&embed=1&theme=dark'}]}

    monkeypatch.setattr(routes, 'get_component_vault', lambda settings: FakeVault())

    def handler(request):
        return httpx.Response(200, json={'ready': True})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as upstream:
        registry._PROXIES[(app.id, settings.example_url)] = registry.LiveAppProxy(app.id, settings.example_url, upstream)
        api = FastAPI()
        api.include_router(routes.router)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(api), base_url='http://local.test') as client:
            body = (await client.get('/api/components/search?kind=reusable&app=example&q=card')).json()

            assert body['source'] == 'vault-reusable'
            assert [r['name'] for r in body['results']] == ['Card']
            assert body['results'][0]['kind'] == 'reusable'
            # How many the app has, not how many this page showed.
            assert body['total_matches'] == 40
            # Only the buckets that belong to this export were asked for.
            assert asked == [(('base44-repo-example', 'base44-repo-example--apps'), 'card')]

            # An app that is not running has no store to browse.
            assert (await client.get('/api/components/search?kind=reusable&app=ghost')).status_code == 404


@pytest.mark.asyncio
async def test_an_app_is_found_by_either_of_its_names(live_registry):
    """Base44 and the catalogue disagree on some names; both have to match."""
    settings, _, app = live_registry

    def handler(request):
        return httpx.Response(200, json={'ready': True})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as upstream:
        registry._PROXIES[(app.id, settings.example_url)] = registry.LiveAppProxy(app.id, settings.example_url, upstream)
        api = FastAPI()
        api.include_router(routes.router)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(api), base_url='http://local.test') as client:
            for query in ('Example', 'Example (Copy)'):
                body = (await client.get(f'/api/components/search?kind=app&q={query}')).json()
                assert [r['id'] for r in body['results']] == ['example'], query
