const assert = require('node:assert/strict');
const { PlaylistSet, PlaylistAdvanceRule } = require('../static/gallery/playlist.js');

class MemoryStorage {
  constructor(){ this.values = new Map(); }
  getItem(key){ return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value){ this.values.set(key, String(value)); }
}

const tracks = [
  { provider:'spotify', provider_track_id:'one', title:'One', artist:'Artist' },
  { provider:'spotify', provider_track_id:'two', title:'Two', artist:'Artist' },
  { provider:'spotify', provider_track_id:'three', title:'Three', artist:'Artist' },
];

{
  const playlist = new PlaylistSet();
  const snapshot = playlist.replace([...tracks, { ...tracks[1], album:'Updated' }], { currentIndex:1, label:'Test set' });
  assert.equal(snapshot.size, 3, 'ordered set de-duplicates stable provider ids');
  assert.equal(snapshot.current.title, 'Two');
  assert.equal(snapshot.current.album, 'Updated');
  assert.equal(snapshot.next.title, 'Three');
  assert.equal(playlist.advance(1).title, 'Three');
  assert.equal(playlist.advance(1), null, 'the queue does not wrap by default');
  assert.equal(playlist.advance(-1).title, 'Two');
}

{
  const playlist = new PlaylistSet({ maxSize:2 });
  playlist.replace(tracks, { currentIndex:0 });
  assert.equal(playlist.size, 2, 'large provider pages are bounded at the model edge');
  playlist.upsert({ ...tracks[0], album:'Fresh metadata' }, { select:true });
  assert.equal(playlist.current.album, 'Fresh metadata');
  playlist.move(playlist.currentKey, 1);
  assert.equal(playlist.currentIndex, 1);
  playlist.clear({ keepCurrent:true });
  assert.equal(playlist.size, 1);
  assert.equal(playlist.current.title, 'One');
}

{
  const storage = new MemoryStorage();
  const playlist = new PlaylistSet({ storage, storageKey:'queue' });
  playlist.replace(tracks, { currentIndex:1, label:'Persistent set', source:'test' });
  const restored = new PlaylistSet({ storage, storageKey:'queue' });
  assert.equal(restored.size, 3);
  assert.equal(restored.current.title, 'Two');
  assert.equal(restored.label, 'Persistent set');
}

{
  const playlist = new PlaylistSet();
  playlist.replace(tracks, { currentIndex:0 });
  const advanced = [];
  const rule = new PlaylistAdvanceRule({ playlist, onAdvance:track=>advanced.push(track.title) });
  assert.equal(rule.handle('source-loaded', {}), false);
  assert.equal(rule.handle('ended', {}), true);
  assert.deepEqual(advanced, ['Two']);
  playlist.select(2);
  assert.equal(rule.handle('ended', {}), false, 'loop rules may handle the end of the set');
}

console.log('playlist tests: ok');
