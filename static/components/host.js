/* This mounts a compiled app surface. All data and actions stay on that app's
   existing singleton server proxy; no source-file preview sandbox is involved. */
const [, , app, key] = location.pathname.split('/');
const frame = document.getElementById('component');
const status = document.getElementById('status');
const message = document.getElementById('message');
const retry = document.getElementById('retry');
let plugin;
let resolving = false;

/* Canvas sizes a component card from a height the framed page reports, and
   falls back to a preview-shaped 280px -- which crops a mounted app view. A
   whole app surface has no content height to measure; it fills what it is
   given. So it asks for a viewport-shaped card instead. Re-sent on every
   successful resolve, so a card rebuilt from stored HTML is sized again. */
const SIZE_CHANNEL = 'cv-embed-size';
const APP_VIEWPORT = 560;

function reportSize() {
  parent.postMessage({ source: SIZE_CHANNEL, id: `${app}:${key}`, height: APP_VIEWPORT }, location.origin);
}

async function resolve() {
  if (resolving) return;
  resolving = true;
  try {
    const response = await fetch(`/api/components/${encodeURIComponent(app)}/${encodeURIComponent(key)}`, { cache: 'no-store' });
    const component = await response.json();
    if (!response.ok) throw new Error(component.detail || 'This app is unavailable.');
    if (!frame.getAttribute('src')) {
      const url = new URL(component.surface_url, location.origin);
      if (url.origin !== location.origin) throw new Error('This component has no local bundle.');
      url.searchParams.set('live-component', `${app}:${key}`);
      frame.title = component.name;
      plugin = Base44AppPlugin.create({
        id: `live-${app}-${key}`, surface: url.searchParams.get('surface') || key,
        frame, frameFloats: 0, uniformKeys: [], frame_() { return null; },
        scene() { return { status: 'ready', app: { id: app, name: component.app },
          shell: { reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches },
          chrome: { background: '#111a16', opacity: 1 }, wallpaper: null }; },
        intents: {
          async invoke(payload) {
            const result = await fetch(`/api/components/${app}/${key}/invoke`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
            });
            const data = await result.json();
            if (!result.ok) throw new Error(data.detail || 'The live app rejected this action.');
            return data;
          },
        },
      });
      frame.src = url.href;
    }
    status.hidden = true; frame.hidden = false;
    reportSize();
  } catch (error) {
    message.textContent = error.message;
    retry.hidden = false; status.hidden = false; frame.hidden = true;
  } finally { resolving = false; }
}
retry.addEventListener('click', resolve);
resolve();
const heartbeat = setInterval(() => { if (!document.hidden) resolve(); }, 15000);
window.addEventListener('pagehide', () => { clearInterval(heartbeat); plugin?.destroy(); }, { once: true });
