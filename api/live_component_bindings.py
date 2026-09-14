"""The explicit app contracts used by Canvas's live component picker.

Two tiers are registered here. **Service** apps have a local backend, so their
components can be driven; each is spelled out below with the operations it
actually backs. **Mounted** apps are the rest of the catalogued Base44
surfaces: compiled bundles this shell serves and can frame, with no process
behind them. They are registered from the catalogue rather than listed by hand,
so vendoring a surface is all it takes to make it browsable.

Both tiers carry their Base44 app id, which is how the reusable components
exported from an app are found in the vault.
"""
from services.base44_index import load as base44_apps
from services.live_components import LiveApplication, Operation, expose_component, register_application

SERVICES = {
    'vocabulary': ('Vocabulary', 'vocabulary_service_url', 'lyrics-shader-lab', '/health', ('service', 'phase-vocabulary')),
    'canvas': ('Canvas', 'canvas_backend_base_url', 'canvas', '/health', ('ok', True)),
    'stillshot': ('StillShot', 'stillshot_api_base_url', 'stillshot', '/api/stats', None),
    'vertexflow': ('VertexFlow', 'sketchfab_api_base_url', 'vertexflow', '/health', None),
}

_EXPORTS = {app.plugin.id: app for app in base44_apps()}

# Mounted first, then the service tier over the top: an app in both keeps its
# backend and its export identity, and neither list has to know about the other.
for export in base44_apps():
    if export.plugin.id in SERVICES:
        continue
    register_application(LiveApplication(
        id=export.plugin.id, name=export.plugin.name, bundle=export.plugin.index_name,
        base44_repo=export.repo, base44_app_id=export.app_id, base44_name=export.app_name))
    expose_component(
        app=export.plugin.id, key='app', name=export.plugin.name,
        surface=f'{export.plugin.route}?surface={export.plugin.surface}',
        description=export.plugin.blurb or f'The {export.app_name} surface, mounted live.',
        operations={})

for app_id, (name, setting, bundle, health, identity) in SERVICES.items():
    export = _EXPORTS.get(app_id)
    register_application(LiveApplication(
        id=app_id, name=name, bundle=bundle, setting=setting, health=health,
        health_identity=identity,
        base44_repo=export.repo if export else '',
        base44_app_id=export.app_id if export else '',
        base44_name=export.app_name if export else ''))

VOCABULARY_OPERATIONS = {
    'overview': Operation('GET', '/v1/overview'),
    'list': Operation('GET', '/v1/words', ('q', 'status', 'limit', 'offset')),
    'get': Operation('GET', '/v1/words/{id}'),
    'save': Operation('POST', '/v1/words'),
    'edit': Operation('PUT', '/v1/words/{id}'),
    'due': Operation('GET', '/v1/due', ('mode', 'limit')),
    'review': Operation('POST', '/v1/reviews'),
    'usage': Operation('POST', '/v1/usages'),
    'lookup': Operation('POST', '/v1/lookup'),
    'export': Operation('GET', '/v1/export'),
}

vocabulary_workspace = expose_component(
    app='vocabulary',
    key='study',
    name='Vocabulary recall',
    surface='/vocabulary?surface=vocabulary&standalone=1',
    description='Your live review queue, word capture, and conversation practice.',
    operations=VOCABULARY_OPERATIONS,
)
vocabulary_library = expose_component(
    app='vocabulary',
    key='library',
    name='Word library',
    surface='/vocabulary?surface=vocabulary&standalone=1&view=library',
    description='Search and edit the same words saved by Lyric Shader Lab.',
    operations=VOCABULARY_OPERATIONS,
)
canvas_editor = expose_component(
    app='canvas',
    key='editor',
    name='Canvas editor',
    surface='/canvas-full?surface=app&base=/canvas-full',
    description='The local Canvas app, with its real documents and signed-in session.',
    operations={
        'documents': Operation('GET', '/api/documents'),
        'create': Operation('POST', '/api/documents'),
        'edit': Operation('PATCH', '/api/documents/{id}'),
    },
)
stillshot_board = expose_component(
    app='stillshot',
    key='board',
    name='Photo board',
    surface='/stillshot?surface=board',
    description='Browse and search the running StillShot photo index.',
    operations={
        'stats': Operation('GET', '/api/stats'),
        'search': Operation('GET', '/api/search', ('q', 'limit')),
        'photos': Operation('GET', '/api/photos', ('per_page', 'sort', 'page')),
    },
)
vertexflow_viewport = expose_component(
    app='vertexflow',
    key='viewport',
    name='Model viewport',
    surface='/vertexflow?surface=viewport',
    description='Inspect real models from the running local 3D index.',
    operations={
        'scan': Operation('POST', '/scan', body_defaults=(('target', 'sketchfab_models_root'),)),
    },
)
