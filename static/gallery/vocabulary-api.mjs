/* Shared by the Phase host and the full React app. Persistence lives in the
   vocabulary service; browser storage is read only for the one-time migration. */
const fields = ['word', 'source_language', 'definition_language', 'meaning', 'translation',
  'example', 'personal_sentence', 'collocations', 'register_label', 'context', 'source_title',
  'source_artist', 'source_url', 'source_time', 'provenance', 'model'];

export function wordInput(entry) {
  return Object.fromEntries(fields.filter(key => entry[key] !== undefined).map(key => [key, entry[key]]));
}

async function api(path, method = 'GET', body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), path === 'lookup' ? 105000 : 20000);
  try {
    const response = await fetch(`/api/vocabulary/${path}`, {
      method, signal: controller.signal, cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = typeof data?.detail === 'string' ? data.detail : data?.detail?.[0]?.msg;
      throw new Error(detail || `Vocabulary request failed (${response.status})`);
    }
    return data;
  } finally { clearTimeout(timer); }
}

export function legacyWords(raw) {
  return raw.filter(item => typeof item?.word === 'string' && item.word.trim()).map(item => ({
    word: item.word.trim().slice(0, 120),
    source_language: (item.sourceLanguage || item.source_language || 'en').slice(0, 35),
    definition_language: (item.targetLanguage || item.locale || item.definition_language || 'en').slice(0, 35),
    meaning: String(item.meaning || '').slice(0, 3000),
    translation: String(item.translation || '').slice(0, 500),
    context: String(item.context || item.original || '').slice(0, 3000),
    source_title: String(item.track?.title || '').slice(0, 300),
    source_artist: String(item.track?.artist || '').slice(0, 300),
    provenance: 'legacy',
  }));
}

let migration;
async function migrate() {
  if (!migration) migration = (async () => {
    let imported = 0;
    for (const key of ['phaseField.lyricVocabulary', 'lyric-shader-reader:vocab']) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))))
        .map(byte => byte.toString(16).padStart(2, '0')).join('');
      const marker = `vocabulary-service:imported:${key}`;
      if (localStorage.getItem(marker) === fingerprint) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error(`Saved words in ${key} could not be read. The original data is unchanged.`);
      const entries = legacyWords(parsed);
      for (let start = 0; start < entries.length; start += 200) {
        const result = await api('import', 'POST', { entries: entries.slice(start, start + 200) });
        imported += result.imported;
      }
      localStorage.setItem(marker, fingerprint);
    }
    return { imported };
  })().catch(error => { migration = null; throw error; });
  return migration;
}

async function performRequest(operation, payload = {}) {
  switch (operation) {
    case 'init': {
      const [health, overview] = await Promise.all([api('health'), api('overview')]);
      let migrationResult;
      try { migrationResult = await migrate(); }
      catch (error) { migrationResult = { warning: error.message }; }
      return { health, overview: migrationResult.imported ? await api('overview') : overview, migration: migrationResult };
    }
    case 'overview': return api('overview');
    case 'list': return api(`words?${new URLSearchParams(payload)}`);
    case 'get': return api(`words/${encodeURIComponent(payload.id)}`);
    case 'save': return api('words', 'POST', wordInput(payload));
    case 'edit': return api(`words/${encodeURIComponent(payload.id)}`, 'PUT', {
      ...wordInput(payload), revision: payload.revision, archived: Boolean(payload.archived),
    });
    case 'lookup': return api('lookup', 'POST', {
      word: payload.word, source_language: payload.source_language,
      definition_language: payload.definition_language, context: payload.context || '',
    });
    case 'due': return api(`due?${new URLSearchParams(payload)}`);
    case 'review': return api('reviews', 'POST', payload);
    case 'usage': return api('usages', 'POST', payload);
    case 'export': return api('export');
    default: throw new Error(`Unknown vocabulary action: ${operation}`);
  }
}

const changes = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('phase-vocabulary') : null;
export async function vocabularyRequest(operation, payload = {}) {
  const result = await performRequest(operation, payload);
  if (['save', 'edit', 'review', 'usage'].includes(operation)) changes?.postMessage({ changed: true });
  return result;
}
