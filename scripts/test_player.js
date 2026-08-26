const assert = require('node:assert/strict');
const {
  AudioPlayer,
  LoopTrackRule,
  PlaybackRule,
  PlaybackRuleSet,
  PlayerControls,
} = require('../static/gallery/player.js');

class FakeMedia {
  constructor() {
    this.src = '';
    this.currentTime = 0;
    this.duration = 120;
    this.paused = true;
    this.ended = false;
    this.loop = true;
    this.listeners = new Map();
    this.playCount = 0;
  }

  addEventListener(event, handler) {
    this.listeners.set(event, handler);
  }

  emit(event) {
    this.listeners.get(event)?.();
  }

  play() {
    this.paused = false;
    this.ended = false;
    this.playCount += 1;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }
}

class FakeElement {
  constructor() {
    this.listeners = new Map();
    this.dataset = {};
    this.style = {};
    this.classList = { add(){}, remove(){} };
    this.textContent = '';
    this.innerHTML = '';
  }

  addEventListener(event, handler) {
    this.listeners.set(event, handler);
  }

  click(clientX = 0) {
    this.listeners.get('click')?.({ clientX });
  }

  getBoundingClientRect() {
    return { left:10, width:100 };
  }
}

{
  const media = new FakeMedia();
  const player = new AudioPlayer(media);
  player.loadSource('/stream');
  media.currentTime = 30;
  assert.equal(player.updateProgress(), 0.25);
  player.seekToRatio(0.5);
  assert.equal(media.currentTime, 60);
  assert.equal(media.loop, false, 'native looping stays disabled so rules own policy');
}

{
  const media = new FakeMedia();
  const player = new AudioPlayer(media, {
    rules: [new LoopTrackRule({ enabled:true })],
  });
  player.loadSource('/stream');
  media.currentTime = 120;
  media.paused = true;
  media.ended = true;
  media.emit('ended');
  assert.equal(media.currentTime, 0);
  assert.equal(media.playCount, 1);
}

{
  const media = new FakeMedia();
  const player = new AudioPlayer(media, {
    rules: [new LoopTrackRule({ enabled:false })],
  });
  player.loadSource('/stream');
  media.currentTime = 120;
  media.emit('ended');
  assert.equal(media.currentTime, 120);
  assert.equal(media.playCount, 0);
}

{
  const events = [];
  class RecordingRule extends PlaybackRule {
    handle(event) {
      events.push(event);
      return false;
    }
  }
  const media = new FakeMedia();
  const rules = new PlaybackRuleSet([new RecordingRule()]);
  const player = new AudioPlayer(media, { rules });
  player.loadSource('/stream');
  media.emit('ended');
  assert.deepEqual(events, ['source-loaded', 'ended']);
}

assert.equal(PlayerControls.formatTime(65), '1:05');

{
  const media = new FakeMedia();
  const player = new AudioPlayer(media);
  player.loadSource('/stream');
  const playButton = new FakeElement();
  const scrubber = new FakeElement();
  const fill = new FakeElement();
  const time = new FakeElement();
  const playIcon = new FakeElement();
  const controls = new PlayerControls({
    player,
    playButton,
    playIcon,
    scrubber,
    fill,
    time,
  }).bind();

  playButton.click();
  assert.equal(media.playCount, 1);
  scrubber.click(60);
  assert.equal(media.currentTime, 60);
  controls.update();
  assert.equal(fill.style.width, '50.0%');
  assert.equal(time.textContent, '1:00');
}

console.log('player tests: ok');
