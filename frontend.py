INDEX_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dev Music Service</title>
  <style>
    :root {
      --bg1: #09111c;
      --bg2: #14283b;
      --bg3: #0a5c46;
      --card: rgba(8, 16, 28, 0.76);
      --card-2: rgba(255, 255, 255, 0.08);
      --text: #f3f7fb;
      --muted: #a8b5c4;
      --accent: #2de59d;
      --warn: #ffd166;
      --border: rgba(255, 255, 255, 0.12);
      --shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(45, 229, 157, 0.15), transparent 24%),
        radial-gradient(circle at top right, rgba(255, 209, 102, 0.18), transparent 20%),
        linear-gradient(140deg, var(--bg1), var(--bg2) 58%, var(--bg3));
      overflow-x: hidden;
    }

    .wrap {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0 40px;
    }

    .hero {
      display: grid;
      gap: 18px;
      align-items: end;
      grid-template-columns: 1.6fr 1fr;
      margin-bottom: 20px;
    }

    .title {
      padding: 22px 0 6px;
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.06);
      border-radius: 999px;
      color: var(--muted);
      font-size: 13px;
      backdrop-filter: blur(12px);
    }

    h1 {
      margin: 14px 0 10px;
      font-size: clamp(38px, 7vw, 70px);
      line-height: 0.95;
      letter-spacing: -0.05em;
    }

    .subtitle {
      max-width: 760px;
      margin: 0;
      color: var(--muted);
      font-size: 16px;
      line-height: 1.6;
    }

    .side {
      justify-self: end;
      width: min(100%, 360px);
      padding: 18px;
      border: 1px solid var(--border);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.05));
      border-radius: 28px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
    }

    .metric {
      display: grid;
      gap: 4px;
      margin-bottom: 16px;
    }

    .metric small { color: var(--muted); }
    .metric strong { font-size: 20px; }

    .bars {
      display: flex;
      gap: 6px;
      align-items: end;
      height: 78px;
      margin-top: 12px;
    }

    .bars span {
      width: 100%;
      border-radius: 999px 999px 4px 4px;
      background: linear-gradient(180deg, #aaf9c7, var(--accent));
      opacity: 0.9;
      animation: bounce 1.5s ease-in-out infinite;
    }

    .bars span:nth-child(2) { animation-delay: 0.12s; height: 68%; }
    .bars span:nth-child(3) { animation-delay: 0.2s; height: 86%; }
    .bars span:nth-child(4) { animation-delay: 0.28s; height: 52%; }
    .bars span:nth-child(5) { animation-delay: 0.34s; height: 92%; }
    .bars span:nth-child(6) { animation-delay: 0.4s; height: 64%; }

    @keyframes bounce {
      0%, 100% { transform: scaleY(0.65); }
      50% { transform: scaleY(1); }
    }

    .panel {
      display: grid;
      gap: 18px;
      padding: 22px;
      border: 1px solid var(--border);
      background: var(--card);
      border-radius: 28px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
    }

    .search-wrap {
      position: relative;
      display: grid;
      gap: 12px;
    }

    .search-row {
      display: grid;
      grid-template-columns: 1fr auto auto auto;
      gap: 10px;
    }

    input {
      width: 100%;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.08);
      color: var(--text);
      border-radius: 18px;
      padding: 16px 18px;
      font-size: 16px;
      outline: none;
      transition: 0.2s ease;
    }

    input:focus {
      border-color: rgba(45, 229, 157, 0.75);
      box-shadow: 0 0 0 4px rgba(45, 229, 157, 0.12);
    }

    button {
      border: 0;
      border-radius: 18px;
      padding: 0 18px;
      min-height: 52px;
      color: white;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease;
      white-space: nowrap;
    }

    button:hover { transform: translateY(-1px); }
    button:active { transform: translateY(0); }

    .primary {
      background: linear-gradient(135deg, #1bbd7a, var(--accent));
      box-shadow: 0 18px 40px rgba(45, 229, 157, 0.2);
    }

    .ghost {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--border);
    }

    .suggestions {
      position: absolute;
      inset: calc(100% + 8px) 0 auto 0;
      display: none;
      max-height: 290px;
      overflow: auto;
      border-radius: 20px;
      background: rgba(10, 14, 28, 0.96);
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
      z-index: 5;
    }

    .suggestions.visible { display: block; }

    .suggestion {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      cursor: pointer;
    }

    .suggestion:hover, .suggestion.active { background: rgba(45, 229, 157, 0.12); }
    .suggestion strong { font-size: 15px; }
    .suggestion small { color: var(--muted); }

    .grid {
      display: grid;
      grid-template-columns: 1.25fr 0.75fr;
      gap: 18px;
    }

    .card {
      padding: 20px;
      border-radius: 24px;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.05);
    }

    .now-playing {
      display: grid;
      gap: 14px;
    }

    .player-head {
      display: grid;
      grid-template-columns: 112px 1fr;
      gap: 16px;
      align-items: center;
    }

    .cover {
      width: 72px;
      height: 72px;
      flex: 0 0 72px;
      display: grid;
      place-items: center;
      border-radius: 18px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background:
        linear-gradient(135deg, rgba(45, 229, 157, 0.34), rgba(255, 209, 102, 0.22)),
        radial-gradient(circle at 30% 15%, rgba(255, 255, 255, 0.28), transparent 38%),
        rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.88);
      font-weight: 900;
      letter-spacing: -0.08em;
      text-transform: uppercase;
    }

    .cover img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .cover.large {
      width: 112px;
      height: 112px;
      border-radius: 26px;
      font-size: 34px;
      box-shadow: 0 22px 50px rgba(0, 0, 0, 0.26);
    }

    .cover.small {
      width: 48px;
      height: 48px;
      border-radius: 14px;
      font-size: 16px;
    }

    .cover-meta {
      color: var(--muted);
      font-size: 12px;
      margin-top: 8px;
    }

    .status-line {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      color: var(--muted);
      font-size: 14px;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(45, 229, 157, 0.14);
      color: #b8f8d5;
      border: 1px solid rgba(45, 229, 157, 0.28);
    }

    .track-title {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.03em;
      margin: 0;
    }

    .track-meta {
      color: var(--muted);
      margin: 0;
      line-height: 1.6;
    }

    .progress {
      height: 10px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.09);
      overflow: hidden;
    }

    .progress > div {
      width: 0%;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #1bbd7a, #aaf9c7);
    }

    .time-row {
      display: flex;
      justify-content: space-between;
      color: var(--muted);
      font-size: 12px;
      margin-top: -6px;
    }

    .equalizer {
      position: relative;
      height: 96px;
      padding: 18px;
      display: flex;
      align-items: end;
      gap: 8px;
      border-radius: 24px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03)),
        radial-gradient(circle at 18% 0%, rgba(45, 229, 157, 0.22), transparent 38%),
        radial-gradient(circle at 82% 100%, rgba(255, 209, 102, 0.18), transparent 34%);
    }

    .equalizer::before {
      content: "";
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
      background-size: 100% 18px, 34px 100%;
      mask-image: linear-gradient(180deg, transparent, black 18%, black 82%, transparent);
      pointer-events: none;
    }

    .eq-bar {
      position: relative;
      z-index: 1;
      flex: 1;
      min-width: 7px;
      height: calc(var(--level) * 1%);
      border-radius: 999px 999px 5px 5px;
      background: linear-gradient(180deg, #eaffbf 0%, #5df3b1 46%, #0fb778 100%);
      box-shadow: 0 0 18px rgba(45, 229, 157, 0.24);
      opacity: 0.55;
      transform-origin: bottom;
      transition: height 0.35s ease, opacity 0.25s ease, filter 0.25s ease;
      animation: eqPulse var(--speed) ease-in-out infinite;
      animation-delay: var(--delay);
      animation-play-state: paused;
    }

    .equalizer.playing .eq-bar {
      opacity: 0.95;
      filter: saturate(1.18);
      animation-play-state: running;
    }

    .equalizer.paused .eq-bar {
      height: 18%;
      opacity: 0.42;
    }

    @keyframes eqPulse {
      0%, 100% { transform: scaleY(0.45); }
      34% { transform: scaleY(1); }
      62% { transform: scaleY(0.68); }
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .list {
      display: grid;
      gap: 10px;
    }

    .result {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 14px 16px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid transparent;
    }

    .result:hover { border-color: rgba(45, 229, 157, 0.25); }
    .result.selected {
      border-color: rgba(45, 229, 157, 0.62);
      background: rgba(45, 229, 157, 0.1);
      box-shadow: inset 4px 0 0 rgba(45, 229, 157, 0.72);
    }
    .result .info { min-width: 0; }
    .result .info strong { display: block; margin-bottom: 3px; }
    .result .info small { color: var(--muted); }

    .muted { color: var(--muted); }

    .footer {
      padding: 18px 4px 0;
      color: rgba(255, 255, 255, 0.62);
      font-size: 13px;
    }

    @media (max-width: 960px) {
      .hero, .grid, .search-row { grid-template-columns: 1fr; }
      .player-head { grid-template-columns: 1fr; }
      .side { justify-self: stretch; width: 100%; }
    }

    @media (prefers-reduced-motion: reduce) {
      .bars span, .eq-bar {
        animation: none;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <div class="title">
        <div class="eyebrow">Dev Music Service · MusicBrainz matches</div>
        <h1>Find a song. Play the best match.</h1>
        <p class="subtitle">Search by song or artist, choose a trusted metadata match, and play the top resolved stream in the browser.</p>
      </div>
      <aside class="side">
        <div class="metric">
          <small>Now serving</small>
          <strong>Search · Stream · Browser audio</strong>
        </div>
        <div class="metric">
          <small>Playback status</small>
          <strong id="sideStatus">Idle</strong>
        </div>
        <div class="bars" aria-hidden="true">
          <span style="height:45%"></span>
          <span style="height:68%"></span>
          <span style="height:82%"></span>
          <span style="height:56%"></span>
          <span style="height:90%"></span>
          <span style="height:64%"></span>
        </div>
      </aside>
    </section>

    <section class="panel">
      <div class="search-wrap">
        <div class="search-row">
          <input id="searchInput" placeholder="Search a song, artist, or mood..." autocomplete="off" />
          <button class="primary" id="playBtn">Play top match</button>
          <button class="ghost" id="toggleBtn">Pause</button>
        </div>
        <div class="suggestions" id="suggestions"></div>
      </div>

      <div class="grid">
        <div class="card now-playing">
          <div class="status-line">
            <span class="pill" id="statusPill">Ready</span>
            <span id="message">Type to search.</span>
          </div>
          <div class="player-head">
            <div class="cover large" id="trackCover">DM</div>
            <div>
              <h2 class="track-title" id="trackTitle">Nothing playing yet</h2>
              <p class="track-meta" id="trackMeta">Search for a track, pick a result, then play it in the browser.</p>
              <div class="cover-meta" id="coverMeta">Cover art will prefer MusicBrainz.</div>
            </div>
          </div>
          <div class="equalizer paused" id="equalizer" aria-hidden="true">
            <span class="eq-bar" style="--level: 42; --speed: 1.1s; --delay: -0.1s"></span>
            <span class="eq-bar" style="--level: 68; --speed: 1.35s; --delay: -0.45s"></span>
            <span class="eq-bar" style="--level: 36; --speed: 0.95s; --delay: -0.2s"></span>
            <span class="eq-bar" style="--level: 88; --speed: 1.55s; --delay: -0.75s"></span>
            <span class="eq-bar" style="--level: 54; --speed: 1.15s; --delay: -0.35s"></span>
            <span class="eq-bar" style="--level: 74; --speed: 1.45s; --delay: -0.6s"></span>
            <span class="eq-bar" style="--level: 48; --speed: 1s; --delay: -0.15s"></span>
            <span class="eq-bar" style="--level: 92; --speed: 1.7s; --delay: -0.85s"></span>
            <span class="eq-bar" style="--level: 62; --speed: 1.25s; --delay: -0.5s"></span>
            <span class="eq-bar" style="--level: 38; --speed: 1.05s; --delay: -0.25s"></span>
            <span class="eq-bar" style="--level: 78; --speed: 1.5s; --delay: -0.7s"></span>
            <span class="eq-bar" style="--level: 50; --speed: 1.2s; --delay: -0.4s"></span>
          </div>
          <div class="progress" aria-hidden="true"><div></div></div>
          <div class="time-row"><span id="elapsedTime">0:00</span><span id="durationTime">0:00</span></div>
          <div class="actions">
            <button class="primary" id="playTop">Play selected song</button>
            <button class="ghost" id="copyBtn">Copy current query</button>
            <button class="ghost" id="sendLocalBtn">Send to local player</button>
          </div>
        </div>

        <div class="card">
          <div class="status-line" style="margin-bottom:12px;">
            <strong>Song matches</strong>
            <span class="muted" id="resultCount">0 matches</span>
          </div>
          <div class="list" id="results"></div>
        </div>
      </div>

      <div class="footer">Suggestions come from MusicBrainz. Playback resolves the top matching stream.</div>
    </section>
  </div>

  <script>
    const input = document.getElementById('searchInput');
    const suggestions = document.getElementById('suggestions');
    const results = document.getElementById('results');
    const resultCount = document.getElementById('resultCount');
    const trackTitle = document.getElementById('trackTitle');
    const trackMeta = document.getElementById('trackMeta');
    const trackCover = document.getElementById('trackCover');
    const coverMeta = document.getElementById('coverMeta');
    const statusPill = document.getElementById('statusPill');
    const sideStatus = document.getElementById('sideStatus');
    const message = document.getElementById('message');
    const playBtn = document.getElementById('playBtn');
    const toggleBtn = document.getElementById('toggleBtn');
    const playTop = document.getElementById('playTop');
    const copyBtn = document.getElementById('copyBtn');
    const sendLocalBtn = document.getElementById('sendLocalBtn');
    const progressFill = document.querySelector('.progress > div');
    const elapsedTime = document.getElementById('elapsedTime');
    const durationTime = document.getElementById('durationTime');
    const equalizer = document.getElementById('equalizer');

    let timer = null;
    let currentResults = [];
    let activeIndex = -1;
    let currentQuery = '';
    let currentTrack = null;
    let isResolvingPlayback = false;
    const audio = new Audio();
    audio.preload = 'none';

    const fmtDuration = (secs) => {
      const total = Number(secs || 0);
      const mins = Math.floor(total / 60);
      const remainder = String(total % 60).padStart(2, '0');
      return total ? `${mins}:${remainder}` : 'live';
    };

    const albumMeta = (item) => {
      const parts = [];
      if (item.artist) parts.push(item.artist);
      if (item.album) parts.push(item.album);
      if (item.release_year) parts.push(item.release_year);
      return parts.join(' · ') || 'Album metadata unavailable';
    };

    const mergeMetadata = (playable, suggestion) => ({
      ...playable,
      title: suggestion?.title || playable.title,
      album: suggestion?.album || playable.album,
      artist: suggestion?.artist || playable.artist,
      thumbnail: suggestion?.thumbnail || playable.thumbnail,
      artwork_source: suggestion?.artwork_source || playable.artwork_source || (playable.thumbnail ? 'youtube' : null),
      artwork_confidence: suggestion?.artwork_confidence || playable.artwork_confidence || (playable.thumbnail ? 'video' : null),
      release_year: suggestion?.release_year || playable.release_year,
      duration: suggestion?.duration || playable.duration,
      confidence: suggestion?.confidence || playable.confidence || 0,
      source: suggestion?.source || playable.source || 'youtube',
    });

    const setStatus = (label, tone = 'idle') => {
      statusPill.textContent = label;
      sideStatus.textContent = label;
      if (tone === 'good') {
        statusPill.style.background = 'rgba(45, 229, 157, 0.14)';
      } else if (tone === 'warn') {
        statusPill.style.background = 'rgba(255, 209, 102, 0.16)';
      } else {
        statusPill.style.background = 'rgba(255, 255, 255, 0.08)';
      }
    };

    const setPlaybackBusy = (busy) => {
      isResolvingPlayback = busy;
      playBtn.disabled = busy;
      playTop.disabled = busy;
      toggleBtn.disabled = busy || !audio.src;
      if (busy) {
        playBtn.textContent = 'Loading...';
        playTop.textContent = 'Loading...';
      } else {
        playBtn.textContent = 'Play top match';
        playTop.textContent = currentResults[activeIndex] ? 'Play selected song' : 'Play top match';
      }
    };

    const refreshPlayLabels = () => {
      if (!isResolvingPlayback) {
        playBtn.textContent = 'Play top match';
        playTop.textContent = currentResults[activeIndex] ? 'Play selected song' : 'Play top match';
      }
    };

    const syncToggleLabel = () => {
      toggleBtn.textContent = audio.paused ? 'Resume' : 'Pause';
      toggleBtn.disabled = isResolvingPlayback || !audio.src;
    };

    const setEqualizerState = (state) => {
      equalizer.classList.toggle('playing', state === 'playing');
      equalizer.classList.toggle('paused', state !== 'playing');
    };

    const coverInitials = (item = {}) => {
      const source = item.artist || item.title || 'Dev Music';
      return source.split(/\\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'DM';
    };

    const coverLabel = (item = {}) => {
      if (item.artwork_source === 'cover_art_archive') {
        return `MusicBrainz ${item.artwork_confidence || 'release'} art`;
      }
      if (item.artwork_source === 'youtube') {
        return 'YouTube video thumbnail fallback';
      }
      return 'Generated cover fallback';
    };

    const escapeAttr = (value = '') => String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const coverMarkup = (item = {}, size = 'small') => {
      const initials = coverInitials(item);
      if (!item.thumbnail) {
        return `<div class="cover ${size}" title="Generated cover fallback">${initials}</div>`;
      }
      return `
        <div class="cover ${size}" title="${escapeAttr(coverLabel(item))}">
          <img src="${escapeAttr(item.thumbnail)}" alt="${escapeAttr(item.title || 'Cover art')} cover" referrerpolicy="no-referrer" onerror="this.remove(); this.parentElement.textContent='${escapeAttr(initials)}'; this.parentElement.title='Generated cover fallback';" />
        </div>
      `;
    };

    const setCover = (item = {}) => {
      trackCover.innerHTML = '';
      trackCover.title = coverLabel(item);
      if (!item.thumbnail) {
        trackCover.textContent = coverInitials(item);
      } else {
        const img = document.createElement('img');
        img.src = item.thumbnail;
        img.alt = `${item.title || 'Track'} cover`;
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => {
          img.remove();
          trackCover.textContent = coverInitials(item);
          trackCover.title = 'Generated cover fallback';
          coverMeta.textContent = 'Generated cover fallback.';
        });
        trackCover.appendChild(img);
      }
      coverMeta.textContent = `${coverLabel(item)}.`;
    };

    const setTrack = (title, meta) => {
      trackTitle.textContent = title || 'Nothing playing yet';
      trackMeta.textContent = meta || 'Search for a track, pick a result, then play it in the browser.';
    };

    const syncProgress = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        progressFill.style.width = '0%';
        elapsedTime.textContent = fmtDuration(Math.floor(audio.currentTime || 0));
        durationTime.textContent = currentTrack?.duration ? fmtDuration(currentTrack.duration) : '0:00';
        return;
      }

      const pct = Math.max(0, Math.min(100, (audio.currentTime / audio.duration) * 100));
      progressFill.style.width = `${pct}%`;
      elapsedTime.textContent = fmtDuration(Math.floor(audio.currentTime || 0));
      durationTime.textContent = fmtDuration(Math.floor(audio.duration || currentTrack?.duration || 0));
    };

    const renderSuggestions = () => {
      suggestions.innerHTML = '';
      if (!currentResults.length) {
        suggestions.classList.remove('visible');
        return;
      }

      currentResults.slice(0, 6).forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'suggestion' + (idx === activeIndex ? ' active' : '');
        row.innerHTML = `${coverMarkup(item)}<div><strong>${item.title}</strong><br><small>${albumMeta(item)} · ${fmtDuration(item.duration)}</small></div><small>MusicBrainz match</small>`;
        row.addEventListener('mousedown', (event) => {
          event.preventDefault();
          input.value = item.query || item.title;
          currentQuery = item.query || item.title;
          playQuery(item.query || item.title, item);
          suggestions.classList.remove('visible');
        });
        suggestions.appendChild(row);
      });

      suggestions.classList.add('visible');
    };

    const renderResults = () => {
      results.innerHTML = '';
      resultCount.textContent = `${currentResults.length} match${currentResults.length === 1 ? '' : 'es'}`;
      currentResults.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'result' + (idx === activeIndex ? ' selected' : '');
        row.innerHTML = `
          ${coverMarkup(item)}
          <div class="info">
            <strong>${item.title}</strong>
            <small>${albumMeta(item)} · ${fmtDuration(item.duration)}</small>
          </div>
          <button class="ghost">Play</button>
        `;
        row.addEventListener('click', () => {
          activeIndex = idx;
          input.value = item.query || item.title;
          renderSuggestions();
          renderResults();
        });
        row.querySelector('button').addEventListener('click', (event) => {
          event.stopPropagation();
          activeIndex = idx;
          playQuery(item.query || item.title, item);
        });
        results.appendChild(row);
      });
      refreshPlayLabels();
    };

    const resolvePlayableItem = async (query, suggestion = null) => {
      if (suggestion?.webpage_url && suggestion?.stream_url) {
        return suggestion;
      }

      const searchQuery = suggestion?.query || query;
      const response = await fetch(`/api/search?query=${encodeURIComponent(searchQuery)}&limit=1`);
      if (!response.ok) {
        throw new Error(`Playback lookup failed with ${response.status}`);
      }

      const candidates = await response.json();
      if (!candidates.length) {
        throw new Error('No playable result found.');
      }

      return mergeMetadata(candidates[0], suggestion);
    };

    const startPlayback = async (item) => {
      currentTrack = item;
      setStatus('Playing', 'good');
      setEqualizerState('playing');
      message.textContent = 'Loading audio...';
      setTrack(item.title, `${albumMeta(item)} · Duration ${fmtDuration(item.duration)}`);
      setCover(item);
      audio.src = item.stream_url;
      audio.currentTime = 0;
      await audio.play();
      message.textContent = 'Playing in the browser.';
      syncProgress();
      syncToggleLabel();
    };

    const search = async (query) => {
      currentQuery = query;
      if (!query || query.length < 2) {
        currentResults = [];
        activeIndex = -1;
        renderSuggestions();
        renderResults();
        setPlaybackBusy(false);
        return;
      }

      setStatus('Searching...', 'warn');
      message.textContent = 'Finding songs...';
      const response = await fetch(`/api/autocomplete?query=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error(`Autocomplete failed with ${response.status}`);
      }

      currentResults = await response.json();
      activeIndex = -1;
      setStatus('Ready');
      if (currentResults.length && activeIndex < 0) {
        activeIndex = 0;
      }
      renderSuggestions();
      renderResults();
      message.textContent = currentResults.length ? 'Choose a song to play.' : 'No matches found.';
    };

    const playQuery = async (query, item = null) => {
      if (!query) {
        return;
      }

      if (isResolvingPlayback) {
        return;
      }

      if (!item) {
        if (!currentResults.length || currentQuery !== query) {
          await search(query);
        }
        item = currentResults[activeIndex] || currentResults[0];
      }

      try {
        setPlaybackBusy(true);
        setStatus('Loading...', 'warn');
        setEqualizerState('paused');
        message.textContent = 'Resolving the top stream...';
        const playableItem = await resolvePlayableItem(query, item);
        const playbackParams = new URLSearchParams({
          url: playableItem.webpage_url,
          title: playableItem.title,
          duration: String(playableItem.duration || 0),
        });
        if (playableItem.album) playbackParams.set('album', playableItem.album);
        if (playableItem.artist) playbackParams.set('artist', playableItem.artist);
        if (playableItem.thumbnail) playbackParams.set('thumbnail', playableItem.thumbnail);
        if (playableItem.artwork_source) playbackParams.set('artwork_source', playableItem.artwork_source);
        if (playableItem.artwork_confidence) playbackParams.set('artwork_confidence', playableItem.artwork_confidence);
        if (playableItem.release_year) playbackParams.set('release_year', String(playableItem.release_year));
        await fetch(`/api/browser/playback?${playbackParams.toString()}`);
        await startPlayback(playableItem);
      } catch (error) {
        setStatus('Error', 'warn');
        message.textContent = error.message || 'Playback failed.';
      } finally {
        setPlaybackBusy(false);
        syncToggleLabel();
      }
    };

    const togglePlayback = async () => {
      if (!audio.src) {
        message.textContent = 'No browser track is buffered yet.';
        return;
      }

      if (audio.paused) {
        setStatus('Playing', 'good');
        setEqualizerState('playing');
        await audio.play();
        message.textContent = 'Playback resumed in the browser.';
      } else {
        audio.pause();
        setStatus('Paused', 'warn');
        setEqualizerState('paused');
        message.textContent = 'Browser playback paused.';
      }
      syncToggleLabel();
    };

    const sendToLocalPlayer = async () => {
      const query = input.value.trim() || currentTrack?.title;
      if (!query) {
        message.textContent = 'Enter a query before sending to the local player.';
        return;
      }

      const response = await fetch(`/api/integrations/openclaw/play?query=${encodeURIComponent(query)}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || `Local playback failed with ${response.status}`);
      }

      const data = await response.json();
      setStatus('Local Output', 'warn');
      message.textContent = `Sent to local player (PID ${data.pid}).`;
    };

    const applyRuntimeMode = async () => {
      try {
        const response = await fetch('/health');
        if (!response.ok) return;
        const health = await response.json();
        if (health.local_integration === 'disabled-on-vercel') {
          sendLocalBtn.hidden = true;
        }
      } catch (_error) {
        sendLocalBtn.hidden = true;
      }
    };

    input.addEventListener('input', (event) => {
      const query = event.target.value.trim();
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          await search(query);
        } catch (error) {
          setStatus('Error', 'warn');
          message.textContent = error.message || 'Search failed.';
        }
      }, 650);
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (currentResults[activeIndex]) {
          const item = currentResults[activeIndex];
          input.value = item.query || item.title;
          playQuery(item.query || item.title, item);
        } else {
          playQuery(input.value.trim());
        }
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        activeIndex = Math.min(activeIndex + 1, Math.max(currentResults.length - 1, 0));
        renderSuggestions();
        renderResults();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        renderSuggestions();
        renderResults();
      } else if (event.key === 'Escape') {
        suggestions.classList.remove('visible');
      }
    });

    playBtn.addEventListener('click', () => {
      const item = currentResults[activeIndex] || currentResults[0];
      playQuery(item?.query || input.value.trim(), item);
    });
    playTop.addEventListener('click', () => {
      const item = currentResults[activeIndex] || currentResults[0];
      playQuery(item?.query || input.value.trim(), item);
    });
    toggleBtn.addEventListener('click', togglePlayback);
    copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(input.value.trim());
      message.textContent = 'Copied query to clipboard.';
    });
    sendLocalBtn.addEventListener('click', async () => {
      try {
        await sendToLocalPlayer();
      } catch (error) {
        setStatus('Error', 'warn');
        message.textContent = error.message || 'Local playback failed.';
      }
    });

    audio.addEventListener('timeupdate', syncProgress);
    audio.addEventListener('ended', () => {
      setStatus('Ready');
      message.textContent = 'Track finished.';
      progressFill.style.width = '100%';
      setEqualizerState('paused');
      syncToggleLabel();
    });
    audio.addEventListener('pause', () => {
      if (audio.currentTime > 0 && audio.currentTime < audio.duration) {
        setStatus('Paused', 'warn');
      }
      setEqualizerState('paused');
      syncToggleLabel();
    });
    audio.addEventListener('play', () => {
      setStatus('Playing', 'good');
      setEqualizerState('playing');
      syncToggleLabel();
    });
    audio.addEventListener('loadedmetadata', syncProgress);

    document.addEventListener('click', (event) => {
      if (!suggestions.contains(event.target) && event.target !== input) {
        suggestions.classList.remove('visible');
      }
    });

    setStatus('Ready');
    setTrack('Nothing playing yet', 'Search for a track, pick a result, then play it in the browser.');
    setCover({ title: 'Dev Music', artist: 'Dev Music' });
    syncProgress();
    syncToggleLabel();
    setEqualizerState('paused');
    applyRuntimeMode();
  </script>
</body>
</html>
"""
