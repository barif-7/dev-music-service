const assert = require('node:assert/strict');
const { PlaylistSet, PlaylistAdvanceRule } = require('../static/gallery/playlist.js');
const { RecommendationClient } = require('../static/gallery/recommendations.js');

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

async function testFocusSessionPlayback(){
  const playlist = new PlaylistSet();
  let plays = 0;
  const player = {hasSource:false, current:null, play:async()=>{ plays++; }};
  const client = new RecommendationClient({playlist, player, playTrack:async track=>{
    player.current = track;
    player.hasSource = true;
  }});
  assert.equal(await client.launchSession({tracks}, 5), true);
  assert.equal(playlist.label, 'Focus session · 5 min');
  assert.deepEqual(playlist.snapshot().items.map(track=>track.title), ['One', 'Two', 'Three']);
  assert.equal(player.current.playlistKey, playlist.currentKey);
  assert.equal(plays, 1, 'session launch confirms media playback before the timer starts');

  client.playTrack = async()=>{ player.hasSource = false; };
  await assert.rejects(client.launchSession({tracks}, 5), /first song could not play/,
    'a resolved search failure must not count as successful session playback');

  client.playTrack = async()=>{
    player.hasSource = true;
    player.current = {playlistKey:'different-song'};
  };
  await assert.rejects(client.launchSession({tracks}, 5), /Playback changed/,
    'a manual track change during resolution must not start the session timer');

  client.playTrack = async track=>{ player.current = track; player.hasSource = true; };
  player.play = async()=>{ throw new Error('Playback was blocked'); };
  await assert.rejects(client.launchSession({tracks}, 5), /Playback was blocked/,
    'media play rejection must reach the timer rather than silently counting down');
}

testFocusSessionPlayback().then(()=>console.log('playlist tests: ok')).catch(error=>{
  console.error(error);
  process.exitCode = 1;
});
