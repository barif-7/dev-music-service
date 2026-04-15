INDEX_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dev Music Service</title>
  <style>
    :root {
      --bg1: #0b1020;
      --bg2: #1a1140;
      --bg3: #0a5c46;
      --card: rgba(12, 16, 34, 0.72);
      --card-2: rgba(255, 255, 255, 0.08);
      --text: #f4f7fb;
      --muted: #aab4c5;
      --accent: #1db954;
      --accent-2: #6c5ce7;
      --border: rgba(255, 255, 255, 0.12);
      --shadow: 0 30px 80px rgba(0, 0, 0, 0.4);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(108, 92, 231, 0.45), transparent 30%),
        radial-gradient(circle at top right, rgba(29, 185, 84, 0.22), transparent 24%),
        linear-gradient(135deg, var(--bg1), var(--bg2) 55%, var(--bg3));
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
      font-size: clamp(38px, 7vw, 72px);
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
      background: linear-gradient(180deg, #7cf7a4, #1db954);
      opacity: 0.88;
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
      border-color: rgba(29, 185, 84, 0.75);
      box-shadow: 0 0 0 4px rgba(29, 185, 84, 0.14);
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
      background: linear-gradient(135deg, #1db954, #2ee59d);
      box-shadow: 0 18px 40px rgba(29, 185, 84, 0.22);
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

    .suggestion:hover, .suggestion.active { background: rgba(29, 185, 84, 0.12); }

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
      background: rgba(29, 185, 84, 0.14);
      color: #a8f8c8;
      border: 1px solid rgba(29, 185, 84, 0.28);
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
      width: 36%;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #1db954, #7df3b3);
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

    .result:hover { border-color: rgba(29, 185, 84, 0.25); }

    .result .info { min-width: 0; }
    .result .info strong { display: block; margin-bottom: 3px; }
    .result .info small { color: var(--muted); }

    .muted { color: var(--muted); }
    .footer {
      padding: 18px 4px 0;
      color: rgba(255, 255, 255, 0.6);
      font-size: 13px;
    }

    @media (max-width: 960px) {
      .hero, .grid, .search-row { grid-template-columns: 1fr; }
      .side { justify-self: stretch; width: 100%; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <div class="title">
        <div class="eyebrow">🎵 Dev Music Service · local player</div>
        <h1>Search, queue, and play music with a very small Spotify-ish shell.</h1>
        <p class="subtitle">Gradient background, autocomplete search, one-click playback, and basic stop/resume controls, all backed by the local FastAPI service.</p>
      </div>
      <aside class="side">
        <div class="metric">
          <small>Now serving</small>
          <strong>Search · Stream · Play</strong>
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
          <input id="searchInput" placeholder="Search a song, artist, or vibe..." autocomplete="off" />
          <button class="primary" id="playBtn">Play</button>
          <button class="ghost" id="stopBtn">Stop</button>
          <button class="ghost" id="resumeBtn">Resume</button>
        </div>
        <div class="suggestions" id="suggestions"></div>
      </div>

      <div class="grid">
        <div class="card now-playing">
          <div class="status-line">
            <span class="pill" id="statusPill">Ready</span>
            <span id="message">Type to search.</span>
          </div>
          <h2 class="track-title" id="trackTitle">Nothing playing yet</h2>
          <p class="track-meta" id="trackMeta">Search for a track, pick a result, then hit Play.</p>
          <div class="progress" aria-hidden="true"><div></div></div>
          <div class="actions">
            <button class="primary" id="playTop">Play current search</button>
            <button class="ghost" id="copyBtn">Copy current query</button>
          </div>
        </div>

        <div class="card">
          <div class="status-line" style="margin-bottom:12px;">
            <strong>Search results</strong>
            <span class="muted" id="resultCount">0 tracks</span>
          </div>
          <div class="list" id="results"></div>
        </div>
      </div>

      <div class="footer">Tip: type a few letters, click a suggestion, or just press Enter to play the current query.</div>
    </section>
  </div>

  <script>
    const input = document.getElementById('searchInput');
    const suggestions = document.getElementById('suggestions');
    const results = document.getElementById('results');
    const resultCount = document.getElementById('resultCount');
    const trackTitle = document.getElementById('trackTitle');
    const trackMeta = document.getElementById('trackMeta');
    const statusPill = document.getElementById('statusPill');
    const sideStatus = document.getElementById('sideStatus');
    const message = document.getElementById('message');
    const playBtn = document.getElementById('playBtn');
    const stopBtn = document.getElementById('stopBtn');
    const resumeBtn = document.getElementById('resumeBtn');
    const playTop = document.getElementById('playTop');
    const copyBtn = document.getElementById('copyBtn');

    let timer = null;
    let currentResults = [];
    let activeIndex = -1;
    let currentQuery = '';
    let currentTrack = null;
    const audio = new Audio();
    audio.preload = 'none';
    audio.crossOrigin = 'anonymous';

    const progressFill = document.querySelector('.progress > div');

    const fmtDuration = (secs) => {
      const s = Number(secs || 0);
      const m = Math.floor(s / 60);
      const r = String(s % 60).padStart(2, '0');
      return s ? `${m}:${r}` : 'live';
    };

    const setStatus = (label, tone = 'idle') => {
      statusPill.textContent = label;
      sideStatus.textContent = label;
      statusPill.style.background = tone === 'good' ? 'rgba(29,185,84,0.14)' : tone === 'warn' ? 'rgba(255,193,7,0.14)' : 'rgba(255,255,255,0.08)';
    };

    const setTrack = (title, meta) => {
      trackTitle.textContent = title || 'Nothing playing yet';
      trackMeta.textContent = meta || 'Search for a track, pick a result, then hit Play.';
    };

    const syncProgress = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        progressFill.style.width = '0%';
        return;
      }
      const pct = Math.max(0, Math.min(100, (audio.currentTime / audio.duration) * 100));
      progressFill.style.width = `${pct}%`;
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
        row.innerHTML = `<div><strong>${item.title}</strong><br><small>${fmtDuration(item.duration)}</small></div><small>Play</small>`;
        row.addEventListener('mousedown', (e) => {
          e.preventDefault();
          input.value = item.title;
          currentQuery = item.title;
          playQuery(item.title, item);
          suggestions.classList.remove('visible');
        });
        suggestions.appendChild(row);
      });
      suggestions.classList.add('visible');
    };

    const renderResults = () => {
      results.innerHTML = '';
      resultCount.textContent = `${currentResults.length} track${currentResults.length === 1 ? '' : 's'}`;
      currentResults.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'result';
        row.innerHTML = `
          <div class="info">
            <strong>${item.title}</strong>
            <small>${fmtDuration(item.duration)}</small>
          </div>
          <button class="ghost">Play</button>
        `;
        row.querySelector('button').addEventListener('click', () => playQuery(item.title, item));
        results.appendChild(row);
      });
    };

    const startPlayback = async (item) => {
      if (!item) return;
      currentTrack = item;
      setStatus('Playing', 'good');
      message.textContent = 'Buffering audio...';
      setTrack(item.title, `Duration ${fmtDuration(item.duration)}`);

      audio.src = item.url;
      audio.currentTime = 0;
      await audio.play();
      message.textContent = 'Playing in the browser.';
    };

    const search = async (query) => {
      currentQuery = query;
      if (!query || query.length < 2) {
        currentResults = [];
        activeIndex = -1;
        renderSuggestions();
        renderResults();
        return;
      }
      setStatus('Searching...', 'warn');
      message.textContent = 'Fetching results...';
      const res = await fetch(`/search?query=${encodeURIComponent(query)}`);
      currentResults = await res.json();
      activeIndex = -1;
      renderSuggestions();
      renderResults();
      setStatus('Ready');
      message.textContent = currentResults.length ? 'Pick a result or hit Play.' : 'No matches found.';
    };

    const playQuery = async (query, item = null) => {
      if (!query) return;
      if (!item) {
        if (!currentResults.length || currentQuery !== query) {
          await search(query);
        }
        item = currentResults[0];
      }

      if (!item) {
        setStatus('Ready');
        message.textContent = 'No playable result found.';
        return;
      }

      await startPlayback(item);
    };

    const stopPlayback = async () => {
      audio.pause();
      audio.currentTime = 0;
      await fetch('/stop');
      setStatus('Stopped');
      message.textContent = 'Playback stopped.';
      syncProgress();
    };

    const resumePlayback = async () => {
      if (audio.src) {
        setStatus('Playing', 'good');
        await audio.play();
        message.textContent = 'Playback resumed in the browser.';
        return;
      }

      await fetch('/resume');
      if (currentTrack) {
        await startPlayback(currentTrack);
      }
    };

    input.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      clearTimeout(timer);
      timer = setTimeout(() => search(q), 220);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (currentResults[activeIndex]) {
          const item = currentResults[activeIndex];
          input.value = item.title;
          playQuery(item.title, item);
        } else {
          playQuery(input.value.trim());
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, Math.max(currentResults.length - 1, 0));
        renderSuggestions();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        renderSuggestions();
      } else if (e.key === 'Escape') {
        suggestions.classList.remove('visible');
      }
    });

    playBtn.addEventListener('click', () => playQuery(input.value.trim()));
    playTop.addEventListener('click', () => playQuery(input.value.trim()));
    stopBtn.addEventListener('click', stopPlayback);
    resumeBtn.addEventListener('click', resumePlayback);
    copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(input.value.trim());
      message.textContent = 'Copied query to clipboard.';
    });

    audio.addEventListener('timeupdate', syncProgress);
    audio.addEventListener('ended', () => {
      setStatus('Ready');
      message.textContent = 'Track finished.';
      progressFill.style.width = '100%';
    });
    audio.addEventListener('pause', () => {
      if (audio.currentTime > 0) {
        setStatus('Paused');
      }
    });
    audio.addEventListener('play', () => {
      setStatus('Playing', 'good');
    });
    audio.addEventListener('loadedmetadata', syncProgress);

    document.addEventListener('click', (e) => {
      if (!suggestions.contains(e.target) && e.target !== input) {
        suggestions.classList.remove('visible');
      }
    });

    setStatus('Ready');
    setTrack('Nothing playing yet', 'Search for a track, pick a result, then hit Play.');
  </script>
</body>
</html>
"""
