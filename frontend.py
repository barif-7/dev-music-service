INDEX_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dev Music Service — Find the right version before you press play</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,700;1,9..144,400&family=JetBrains+Mono:wght@400;500;600&family=Inter+Tight:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0c0e;
      --bg-elev: #121317;
      --bg-elev-2: #181a20;
      --border: #23252c;
      --border-strong: #2f323b;
      --ink: #eaeaea;
      --ink-dim: #a1a4ad;
      --ink-faint: #6b6e78;
      --accent: #d7ff3a;
      --accent-ink: #0b0c0e;
      --warn: #ffb454;
      --bad: #ff5a6a;
      --good: #6ee7a8;
      --radius: 4px;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: var(--bg); color: var(--ink); }
    body {
      font-family: 'Inter Tight', system-ui, sans-serif;
      font-feature-settings: "ss01", "cv11";
      -webkit-font-smoothing: antialiased;
      line-height: 1.5;
      min-height: 100vh;
      background-image:
        radial-gradient(ellipse 1200px 600px at 80% -10%, rgba(215,255,58,0.06), transparent 60%),
        radial-gradient(ellipse 800px 400px at 10% 100%, rgba(110,231,168,0.04), transparent 60%);
    }
    button, input { font: inherit; }
    button { border: 0; cursor: pointer; }

    /* ── Topbar ── */
    .topbar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 40px;
      border-bottom: 1px solid var(--border);
      position: sticky; top: 0; z-index: 20;
      background: rgba(11,12,14,0.88);
      backdrop-filter: blur(12px);
    }
    .topbar-left { display: flex; align-items: center; gap: 28px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-mark {
      width: 28px; height: 28px; border-radius: 6px;
      background: var(--accent); display: grid; place-items: center;
      color: var(--accent-ink);
      font-family: 'JetBrains Mono', monospace; font-weight: 600; font-size: 13px;
    }
    .brand-name { font-family: 'Fraunces', serif; font-weight: 500; font-size: 17px; letter-spacing: -0.01em; }
    .brand-tag {
      font-family: 'JetBrains Mono', monospace; font-size: 11px;
      color: var(--ink-faint); padding-left: 12px; margin-left: 4px;
      border-left: 1px solid var(--border); text-transform: uppercase; letter-spacing: 0.08em;
    }
    .nav { display: flex; gap: 28px; }
    .nav a { color: var(--ink-dim); text-decoration: none; font-size: 14px; }
    .nav a:hover { color: var(--ink); }
    .topbar-right { display: flex; align-items: center; gap: 14px; }
    .runtime-tag {
      font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-faint);
      display: flex; align-items: center; gap: 8px;
    }
    .runtime-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 8px var(--accent); }

    /* ── Buttons ── */
    .btn {
      font-family: 'Inter Tight', system-ui, sans-serif; font-weight: 500; font-size: 14px;
      padding: 10px 16px; border-radius: var(--radius); cursor: pointer;
      border: 1px solid transparent; transition: all .15s ease;
      display: inline-flex; align-items: center; gap: 8px; white-space: nowrap;
    }
    .btn:disabled { opacity: 0.42; cursor: not-allowed; transform: none !important; }
    .btn-primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
    .btn-primary:hover:not(:disabled) { background: #e1ff55; transform: translateY(-1px); }
    .btn-ghost { background: transparent; color: var(--ink); border-color: var(--border-strong); }
    .btn-ghost:hover:not(:disabled) { background: var(--bg-elev); }
    .btn-sm { padding: 7px 12px; font-size: 13px; }
    .kbd {
      font-family: 'JetBrains Mono', monospace; font-size: 11px;
      padding: 2px 5px; border-radius: 3px;
      background: rgba(0,0,0,0.3); border: 1px solid var(--border-strong); color: var(--ink-dim);
    }
    .btn-primary .kbd { background: rgba(0,0,0,0.15); border-color: rgba(0,0,0,0.2); color: rgba(0,0,0,0.5); }

    /* ── Hero ── */
    .hero {
      max-width: 1280px; margin: 0 auto; padding: 72px 40px 48px;
      display: grid; grid-template-columns: 1.05fr 1fr; gap: 80px; align-items: center;
    }
    .eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-family: 'JetBrains Mono', monospace; font-size: 11px;
      text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-dim);
      padding: 6px 10px; border: 1px solid var(--border); border-radius: 999px;
      background: var(--bg-elev);
    }
    .eyebrow .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 10px var(--accent); }
    h1.hero-title {
      font-family: 'Fraunces', serif; font-weight: 300;
      font-size: clamp(44px, 5.2vw, 72px); line-height: 1.02; letter-spacing: -0.025em;
      margin: 22px 0 20px; color: var(--ink);
    }
    h1.hero-title em { font-style: italic; font-weight: 400; color: var(--accent); }
    .hero .lede { font-size: 18px; color: var(--ink-dim); max-width: 520px; margin: 0 0 32px; }
    .cta-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .trust { display: flex; gap: 24px; margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--border); }
    .trust div { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.08em; }
    .trust div b { color: var(--ink); font-weight: 500; display: block; font-size: 13px; letter-spacing: 0; text-transform: none; font-family: 'Inter Tight', system-ui; margin-top: 4px; }

    /* ── Demo panel (hero right) ── */
    .demo {
      background: var(--bg-elev); border: 1px solid var(--border); border-radius: 8px;
      padding: 8px;
      box-shadow: 0 40px 80px -20px rgba(0,0,0,0.5), 0 0 0 1px rgba(215,255,58,0.02);
    }
    .demo-head {
      display: flex; align-items: center; gap: 8px; padding: 8px 12px;
      font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-faint);
      text-transform: uppercase; letter-spacing: 0.1em;
    }
    .demo-head .traffic { display: flex; gap: 6px; }
    .demo-head .traffic span { width: 9px; height: 9px; border-radius: 50%; background: var(--border-strong); }
    .demo-body { background: var(--bg); border-radius: 5px; padding: 18px 20px; border: 1px solid var(--border); }
    .demo-query {
      display: flex; align-items: center; gap: 10px;
      font-family: 'JetBrains Mono', monospace; font-size: 13px; color: var(--ink-dim);
      padding-bottom: 14px; border-bottom: 1px solid var(--border); margin-bottom: 0;
    }
    .demo-q { color: var(--ink); }
    .demo-cursor { width: 7px; height: 14px; background: var(--ink); animation: blink 1s steps(2) infinite; }
    @keyframes blink { 50% { opacity: 0; } }

    .search-anchor { position: relative; }

    .search-row {
      display: flex; align-items: center; gap: 10px;
      padding-bottom: 14px; border-bottom: 1px solid var(--border); margin-bottom: 0;
    }
    .search-input-wrap {
      display: flex; align-items: center; gap: 10px; flex: 1;
      font-family: 'JetBrains Mono', monospace; font-size: 13px; color: var(--ink-dim);
    }
    .search-prompt { color: var(--accent); }
    #searchInput {
      flex: 1; border: none; outline: none; background: transparent;
      font-family: 'Inter Tight', system-ui; font-size: 14px; color: var(--ink); min-width: 0;
    }
    #searchInput::placeholder { color: var(--ink-faint); }

    .quick-actions { display: flex; gap: 6px; flex-wrap: wrap; padding-top: 12px; }
    .quick-pill {
      font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase;
      padding: 4px 8px; border-radius: 3px; border: 1px solid var(--border);
      background: transparent; color: var(--ink-faint); cursor: pointer; letter-spacing: 0.06em;
      transition: all .12s;
    }
    .quick-pill:hover { color: var(--ink); border-color: var(--border-strong); }

    .matches-label {
      font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase;
      letter-spacing: 0.12em; color: var(--ink-faint);
      display: flex; justify-content: space-between; padding: 14px 0 8px;
    }

    /* ── Suggestions dropdown ── */
    .suggestions {
      position: absolute; top: calc(100% + 6px); left: 0; right: 0;
      background: var(--bg-elev); border: 1px solid var(--border-strong);
      border-radius: 6px; box-shadow: 0 20px 40px rgba(0,0,0,0.4);
      z-index: 30; display: none; max-height: 280px; overflow-y: auto;
    }
    .suggestions.visible { display: block; }
    .suggestion {
      display: grid; grid-template-columns: 36px 1fr auto;
      gap: 12px; align-items: center;
      padding: 11px 14px; border-bottom: 1px solid var(--border);
      cursor: pointer; font-size: 13px;
    }
    .suggestion:hover, .suggestion.active { background: var(--bg-elev-2); }
    .suggestion strong { display: block; color: var(--ink); margin-bottom: 2px; }
    .suggestion small { color: var(--ink-dim); font-family: 'JetBrains Mono', monospace; font-size: 10px; }

    /* ── Match rows (hero demo + results) ── */
    .match {
      display: grid; grid-template-columns: 44px 1fr auto; gap: 14px; align-items: center;
      padding: 12px; border-radius: 5px; border: 1px solid transparent;
      cursor: pointer; transition: all .15s ease;
    }
    .match:hover { background: var(--bg-elev-2); border-color: var(--border); }
    .match.best { background: rgba(215,255,58,0.04); border-color: rgba(215,255,58,0.2); }
    .match-art {
      width: 44px; height: 44px; border-radius: 4px; flex: 0 0 auto;
      background: linear-gradient(135deg, #3a2d5c, #a83e63); overflow: hidden;
      display: grid; place-items: center;
      font-family: 'Fraunces', serif; font-size: 14px; color: rgba(255,255,255,0.6);
    }
    .match-art img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .match-title { font-size: 14px; color: var(--ink); margin: 0; }
    .match-sub { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-faint); margin-top: 3px; }
    .match-sub .sep { margin: 0 6px; color: var(--border-strong); }

    .badge {
      font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500;
      text-transform: uppercase; letter-spacing: 0.06em;
      padding: 2px 6px; border-radius: 3px; margin-right: 6px;
    }
    .badge-ok   { background: rgba(110,231,168,0.12); color: var(--good); }
    .badge-warn { background: rgba(255,180,84,0.12); color: var(--warn); }
    .badge-bad  { background: rgba(255,90,106,0.12); color: var(--bad); }
    .badge-dim  { background: rgba(255,255,255,0.06); color: var(--ink-faint); border: 1px solid var(--border); }

    .score { text-align: right; font-family: 'JetBrains Mono', monospace; font-size: 13px; }
    .score .pct { font-weight: 600; font-size: 15px; color: var(--ink); }
    .score.high .pct { color: var(--good); }
    .score.mid  .pct { color: var(--warn); }
    .score.low  .pct { color: var(--bad); }
    .score .bar { width: 56px; height: 3px; background: var(--border); border-radius: 2px; margin-top: 5px; overflow: hidden; position: relative; }
    .score .bar::after { content: ''; position: absolute; inset: 0 auto 0 0; border-radius: 2px; }
    .score.high .bar::after { width: 96%; background: var(--good); }
    .score.mid  .bar::after { width: 62%; background: var(--warn); }
    .score.low  .bar::after { width: 28%; background: var(--bad); }

    /* ── Section bands ── */
    section.band { max-width: 1280px; margin: 0 auto; padding: 80px 40px; border-top: 1px solid var(--border); }
    .section-head { display: grid; grid-template-columns: 1fr 2fr; gap: 60px; margin-bottom: 56px; align-items: end; }
    .section-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.14em; }
    h2.section-title {
      font-family: 'Fraunces', serif; font-weight: 300;
      font-size: clamp(32px, 3.4vw, 48px); line-height: 1.05; letter-spacing: -0.02em;
      margin: 14px 0 0; color: var(--ink);
    }
    h2.section-title em { font-style: italic; color: var(--accent); font-weight: 400; }
    .section-head p { color: var(--ink-dim); font-size: 16px; max-width: 48ch; margin: 0; }

    .steps { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--border); }
    .step { padding: 32px 28px 32px 0; border-right: 1px solid var(--border); }
    .step:last-child { border-right: none; padding-right: 0; }
    .step:not(:first-child) { padding-left: 28px; }
    .step .num { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-faint); letter-spacing: 0.08em; }
    .step h3 { font-family: 'Fraunces', serif; font-weight: 400; font-size: 22px; letter-spacing: -0.01em; margin: 16px 0 8px; }
    .step p { color: var(--ink-dim); font-size: 14px; margin: 0; }

    /* ── 3-col app ── */
    .app-preview {
      border: 1px solid var(--border); border-radius: 8px;
      background: var(--bg-elev);
      display: grid; grid-template-columns: 280px 1fr 340px;
      min-height: 560px; overflow: hidden;
    }
    .app-col { padding: 20px; overflow-y: auto; }
    .app-col + .app-col { border-left: 1px solid var(--border); }
    .col-head {
      font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase;
      letter-spacing: 0.14em; color: var(--ink-faint);
      display: flex; justify-content: space-between; align-items: center;
      padding-bottom: 14px; border-bottom: 1px solid var(--border); margin-bottom: 16px;
    }
    .col-head .count { color: var(--accent); }

    /* Left col: playlists + history */
    .playlist-item {
      display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center;
      padding: 10px 8px; border-radius: 4px; cursor: pointer; font-size: 13px;
    }
    .playlist-item:hover { background: var(--bg-elev-2); }
    .playlist-item .pname { color: var(--ink); }
    .playlist-item .pmeta { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-faint); margin-top: 2px; }
    .issue-pill {
      font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500;
      padding: 2px 6px; border-radius: 3px;
      background: rgba(255,90,106,0.12); color: var(--bad);
    }
    .issue-pill.ok { background: rgba(110,231,168,0.12); color: var(--good); }

    .notice {
      padding: 11px 13px; font-size: 12px; color: var(--ink-dim);
      font-family: 'JetBrains Mono', monospace;
      border: 1px solid var(--border); border-left: 2px solid var(--accent);
      background: var(--bg-elev); border-radius: 4px;
    }
    .notice.good   { border-left-color: var(--good); }
    .notice.warn   { border-left-color: var(--warn); }
    .notice.danger { border-left-color: var(--bad); color: var(--bad); }
    .spotify-actions { display: flex; gap: 8px; margin-top: 10px; }

    .preview-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
    .preview-stat { padding: 10px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); }
    .preview-stat span { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.08em; }
    .preview-stat strong { display: block; font-family: 'Fraunces', serif; font-size: 20px; font-weight: 400; margin-top: 4px; color: var(--ink); }

    /* Middle col: search results */
    .track-row {
      display: grid; grid-template-columns: 40px 1fr auto auto;
      gap: 10px; align-items: center;
      padding: 11px 8px; border-bottom: 1px solid var(--border);
      font-size: 13px; cursor: pointer; transition: background .12s;
    }
    .track-row:hover { background: var(--bg-elev-2); }
    .track-row.selected { background: rgba(215,255,58,0.04); }
    .track-row .t { color: var(--ink); font-size: 13px; margin: 0; }
    .track-row .a { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-faint); margin-top: 2px; }
    .track-conf { font-family: 'JetBrains Mono', monospace; font-size: 12px; text-align: right; white-space: nowrap; }
    .conf-high { color: var(--good); }
    .conf-mid  { color: var(--warn); }
    .conf-low  { color: var(--bad); }

    .mini-btn {
      font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase;
      padding: 4px 8px; border-radius: 3px; border: 1px solid var(--border-strong);
      background: transparent; color: var(--ink-dim); cursor: pointer; letter-spacing: 0.06em; white-space: nowrap;
    }
    .mini-btn:hover { color: var(--ink); border-color: var(--ink-dim); }
    .mini-btn.play { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }

    .import-track {
      display: grid; grid-template-columns: 40px 1fr auto;
      gap: 10px; align-items: center;
      padding: 10px 8px; border-bottom: 1px solid var(--border); font-size: 13px;
    }
    .import-track strong { display: block; color: var(--ink); font-size: 13px; }
    .import-track small { display: block; color: var(--ink-faint); font-family: 'JetBrains Mono', monospace; font-size: 10px; margin-top: 2px; }

    /* Right col: player detail */
    .detail-art {
      width: 100%; aspect-ratio: 1; border-radius: 4px;
      background: linear-gradient(135deg, #3a2d5c, #a83e63);
      margin-bottom: 16px; overflow: hidden; position: relative;
      display: grid; place-items: center;
    }
    .detail-art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
    .detail-initials { font-family: 'Fraunces', serif; font-size: 42px; font-weight: 300; color: rgba(255,255,255,0.55); position: relative; z-index: 1; }
    h3.detail-title { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 400; margin: 0 0 4px; letter-spacing: -0.01em; color: var(--ink); }
    .detail-artist-line { color: var(--ink-dim); font-size: 14px; margin: 0 0 14px; }
    .detail-meta { display: grid; grid-template-columns: auto 1fr; gap: 7px 14px; font-family: 'JetBrains Mono', monospace; font-size: 11px; margin-bottom: 14px; }
    .detail-meta .k { color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.08em; }
    .detail-meta .v { color: var(--ink); }
    .detail-meta .v.good { color: var(--good); }

    /* Status pill */
    .status-pill {
      font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500;
      text-transform: uppercase; letter-spacing: 0.08em;
      padding: 3px 8px; border-radius: 3px;
      background: rgba(110,231,168,0.1); color: var(--good); border: 1px solid rgba(110,231,168,0.2);
    }
    .status-pill.warn { background: rgba(255,180,84,0.1); color: var(--warn); border-color: rgba(255,180,84,0.2); }
    .status-pill.idle { background: rgba(255,255,255,0.04); color: var(--ink-faint); border-color: var(--border); }

    /* Equalizer */
    .eq-wrap { height: 44px; display: flex; align-items: flex-end; gap: 2px; margin: 14px 0 6px; }
    .eq-bar {
      flex: 1; height: calc(var(--level) * 1%); border-radius: 1px 1px 0 0;
      background: var(--accent); opacity: 0.3;
      transform-origin: bottom;
      animation: eqPulse var(--speed, 1.2s) ease-in-out infinite;
      animation-delay: var(--delay, 0s);
      animation-play-state: paused;
    }
    #equalizer.playing .eq-bar { opacity: 0.85; animation-play-state: running; }
    #equalizer.paused  .eq-bar { opacity: 0.2;  animation-play-state: paused; }
    @keyframes eqPulse {
      0%, 100% { transform: scaleY(0.38); }
      36% { transform: scaleY(1); }
      68% { transform: scaleY(0.62); }
    }

    /* Progress */
    .progress { height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; margin: 10px 0 4px; }
    .progress > div { width: 0%; height: 100%; border-radius: inherit; background: var(--accent); }
    .time-row { display: flex; justify-content: space-between; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-faint); }
    .play-row { display: flex; gap: 8px; margin-top: 14px; }
    .play-row .btn { flex: 1; justify-content: center; }
    .message-line { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-faint); margin-top: 10px; min-height: 16px; }

    /* Empty / skeleton */
    .empty-state {
      padding: 28px 16px; text-align: center; color: var(--ink-faint);
      font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase;
      border: 1px dashed var(--border); border-radius: 4px; margin-top: 8px;
    }
    .skeleton { display: grid; gap: 10px; padding: 16px; }
    .skeleton-line { height: 11px; border-radius: 2px; background: linear-gradient(90deg, var(--border), var(--border-strong), var(--border)); background-size: 220% 100%; animation: shimmer 1.2s linear infinite; }
    @keyframes shimmer { from { background-position: 120% 0; } to { background-position: -120% 0; } }

    /* Callout */
    .callout {
      margin-top: 10px; padding: 13px 16px;
      border: 1px solid var(--border); border-left: 2px solid var(--accent);
      background: var(--bg-elev); border-radius: 4px;
      font-size: 13px; color: var(--ink-dim);
      display: flex; gap: 10px; align-items: flex-start;
    }
    .callout b { color: var(--ink); font-weight: 500; }
    .callout .icon { color: var(--accent); font-family: 'JetBrains Mono', monospace; font-size: 15px; flex-shrink: 0; margin-top: -1px; }

    /* Footer */
    footer {
      max-width: 1280px; margin: 0 auto; padding: 48px 40px 40px;
      border-top: 1px solid var(--border);
      display: grid; grid-template-columns: 1fr auto; gap: 40px; align-items: end;
      color: var(--ink-faint); font-size: 13px;
    }
    .footer-meta { font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 10px; }
    footer nav { display: flex; gap: 24px; }
    footer nav a { color: var(--ink-dim); text-decoration: none; }
    footer nav a:hover { color: var(--ink); }

    .app-search-field {
      display: flex; align-items: center; gap: 10px;
      background: var(--bg); border: 1px solid var(--border-strong);
      border-radius: var(--radius); padding: 9px 12px;
      transition: border-color .15s;
    }
    .app-search-field:focus-within { border-color: rgba(215,255,58,0.5); }
    .app-search-field input {
      flex: 1; border: none; outline: none; background: transparent;
      font-family: 'Inter Tight', system-ui; font-size: 13px; color: var(--ink); min-width: 0;
    }
    .app-search-field input::placeholder { color: var(--ink-faint); }

    /* ── Sticky player bar ── */
    #playerBar {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 40;
      background: rgba(18,19,23,0.96); backdrop-filter: blur(16px);
      border-top: 1px solid var(--border-strong);
      display: grid; grid-template-columns: 1fr 2fr 1fr;
      align-items: center; gap: 16px;
      padding: 12px 32px;
      transform: translateY(100%);
      transition: transform 0.24s ease;
    }
    #playerBar.visible { transform: translateY(0); }
    body.player-open { padding-bottom: 74px; }

    .bar-track { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .bar-art {
      width: 42px; height: 42px; border-radius: 4px; flex: 0 0 auto;
      background: linear-gradient(135deg, #3a2d5c, #a83e63); overflow: hidden;
      display: grid; place-items: center;
      font-family: 'Fraunces', serif; font-size: 13px; color: rgba(255,255,255,0.55);
    }
    .bar-art img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .bar-copy { min-width: 0; }
    .bar-title { font-size: 13px; font-weight: 500; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bar-artist { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-faint); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .bar-center { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .bar-controls { display: flex; align-items: center; gap: 10px; }
    .bar-btn {
      width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--border-strong);
      background: transparent; color: var(--ink); cursor: pointer;
      display: grid; place-items: center; font-size: 14px;
      transition: all .15s ease;
    }
    .bar-btn:hover { background: var(--bg-elev-2); border-color: var(--ink-faint); }
    .bar-btn.primary {
      width: 38px; height: 38px; background: var(--accent); color: var(--accent-ink);
      border-color: var(--accent); font-size: 16px;
    }
    .bar-btn.primary:hover { background: #e1ff55; }
    .bar-btn:disabled { opacity: 0.3; cursor: not-allowed; }
    .bar-progress { width: 100%; height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; cursor: pointer; }
    .bar-progress-fill { height: 100%; background: var(--accent); border-radius: inherit; width: 0%; transition: width .5s linear; }
    .bar-time { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-faint); display: flex; gap: 8px; }

    .bar-right { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
    .bar-status { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-faint); }
    .bar-status.playing { color: var(--good); }
    .bar-status.buffering { color: var(--warn); }

    /* Responsive */
    @media (max-width: 1100px) {
      .app-preview { grid-template-columns: 260px 1fr; }
      .app-col:last-child { display: none; }
    }
    @media (max-width: 960px) {
      .hero { grid-template-columns: 1fr; padding: 48px 24px; gap: 48px; }
      .topbar { padding: 14px 20px; }
      .nav { display: none; }
      section.band { padding: 56px 24px; }
      .section-head { grid-template-columns: 1fr; gap: 20px; }
      .steps { grid-template-columns: 1fr; }
      .step { border-right: none; border-bottom: 1px solid var(--border); padding: 24px 0 !important; }
      .app-preview { grid-template-columns: 1fr; min-height: auto; }
      .app-col + .app-col { border-left: none; border-top: 1px solid var(--border); }
      footer { grid-template-columns: 1fr; }
    }
    @media (max-width: 480px) {
      .topbar { padding: 12px 16px; }
      section.band, .hero { padding-left: 16px; padding-right: 16px; }
      .cta-row { flex-direction: column; align-items: flex-start; }
      .trust { flex-direction: column; gap: 16px; }
      .preview-summary { grid-template-columns: 1fr; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; }
    }
  </style>
</head>
<body>

<!-- TOPBAR -->
<div class="topbar">
  <div class="topbar-left">
    <div class="brand">
      <div class="brand-mark">◐</div>
      <div class="brand-name">Dev Music Service</div>
      <div class="brand-tag">v0.4 · beta</div>
    </div>
    <nav class="nav" aria-label="Primary">
      <a href="#how">How it works</a>
      <a href="#app">Try it</a>
      <a href="#app">Search</a>
    </nav>
  </div>
  <div class="topbar-right">
    <div class="runtime-tag"><span class="runtime-dot"></span><span id="runtimeStatus">Checking runtime</span></div>
    <button class="btn btn-primary btn-sm" id="spotifyConnectBtn">Connect Spotify</button>
  </div>
</div>

<!-- HERO -->
<section class="hero">
  <div>
    <span class="eyebrow"><span class="dot"></span> Read-only · we never touch your library</span>
    <h1 class="hero-title">Find the <em>right version</em> before you press play.</h1>
    <p class="lede">Import a Spotify playlist and see which tracks matched the wrong release — karaoke versions, sped-up edits, random covers — before they end up in your archive. Backed by MusicBrainz, previewed in the browser.</p>
    <div class="cta-row">
      <a class="btn btn-primary" href="#app">Try the live interface <span class="kbd">↓</span></a>
      <a class="btn btn-ghost" href="#how">How it works</a>
    </div>
    <div class="trust">
      <div>Sources<b>MusicBrainz · Spotify API</b></div>
      <div>Access<b>Read-only OAuth</b></div>
      <div>Playback<b>Browser-native</b></div>
    </div>
  </div>

  <div class="demo">
    <div class="demo-head">
      <div class="traffic"><span></span><span></span><span></span></div>
      <span style="margin-left:8px;">live match preview</span>
    </div>
    <div class="demo-body">
      <div class="demo-query">
        <span class="search-prompt">›</span>
        <span class="demo-q">blinding lights · the weeknd</span>
        <span class="demo-cursor"></span>
      </div>
      <div class="matches-label">
        <span>Ranked candidates</span>
        <span>MusicBrainz score</span>
      </div>
      <div class="match best">
        <div class="match-art"></div>
        <div>
          <div class="match-title"><span class="badge badge-ok">best</span>Blinding Lights</div>
          <div class="match-sub">The Weeknd<span class="sep">·</span>After Hours (2020)<span class="sep">·</span>official</div>
        </div>
        <div class="score high"><div class="pct">98%</div><div class="bar"></div></div>
      </div>
      <div class="match">
        <div class="match-art" style="background:linear-gradient(135deg,#4a4a4a,#2a2a2a);"></div>
        <div>
          <div class="match-title"><span class="badge badge-bad">karaoke</span>Blinding Lights (In the Style of…)</div>
          <div class="match-sub">Sing King<span class="sep">·</span>Karaoke Classics Vol 12</div>
        </div>
        <div class="score low"><div class="pct">31%</div><div class="bar"></div></div>
      </div>
      <div class="match">
        <div class="match-art" style="background:linear-gradient(135deg,#1b4332,#2d6a4f);"></div>
        <div>
          <div class="match-title"><span class="badge badge-warn">live</span>Blinding Lights — Live at SoFi Stadium</div>
          <div class="match-sub">The Weeknd<span class="sep">·</span>Live 2022<span class="sep">·</span>+0:42</div>
        </div>
        <div class="score mid"><div class="pct">64%</div><div class="bar"></div></div>
      </div>
      <div class="match">
        <div class="match-art" style="background:linear-gradient(135deg,#6a040f,#9d0208);"></div>
        <div>
          <div class="match-title"><span class="badge badge-bad">cover</span>Blinding Lights (Acoustic Cover)</div>
          <div class="match-sub">Boyce Avenue<span class="sep">·</span>Acoustic Sessions 7</div>
        </div>
        <div class="score low"><div class="pct">22%</div><div class="bar"></div></div>
      </div>
      <div class="callout">
        <span class="icon">!</span>
        <div><b>3 of 4 candidates would have been wrong imports.</b> DMS catches duration drift, karaoke-label heuristics, and explicit mismatches before writing anywhere.</div>
      </div>
    </div>
  </div>
</section>

<!-- HOW IT WORKS -->
<section class="band" id="how">
  <div class="section-head">
    <div>
      <div class="section-eyebrow">— How it works</div>
      <h2 class="section-title">Four stages, <em>zero writes</em> to your library.</h2>
    </div>
    <p>Every step is inspectable. Nothing leaves the browser except MusicBrainz lookups and your authenticated Spotify reads — no persistence, no sync, no surprises.</p>
  </div>
  <div class="steps">
    <div class="step">
      <div class="num">01 / CONNECT</div>
      <h3>Authenticate read-only</h3>
      <p>Spotify OAuth with <code style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--ink);">playlist-read-private</code> scope. We cannot modify, follow, or queue — even if we wanted to.</p>
    </div>
    <div class="step">
      <div class="num">02 / RANK</div>
      <h3>MusicBrainz cross-match</h3>
      <p>Each track is scored against MBID candidates using ISRC, duration delta, title normalization, and release metadata — then sorted by confidence.</p>
    </div>
    <div class="step">
      <div class="num">03 / PREVIEW</div>
      <h3>Browser playback</h3>
      <p>Resolve the chosen candidate to a streamable source and audition it in-page. No local player, no external app. Keyboard-driven.</p>
    </div>
  </div>
</section>

<!-- APP (3-col live interface) -->
<section class="band" id="app">
  <div class="section-head">
    <div>
      <div class="section-eyebrow">— Live interface</div>
      <h2 class="section-title">The <em>diff</em> for your playlists.</h2>
    </div>
    <p>Flagged tracks at the top, a detail pane for overriding a match, and browser-native playback. Everything live — not a mockup.</p>
  </div>

  <div class="app-preview">

    <!-- LEFT: Spotify + session -->
    <div class="app-col" id="spotifyImport">
      <div class="col-head"><span>Playlists</span><span class="count" id="historyCount">0</span></div>
      <div class="notice" id="spotifyStatus">Spotify import checking configuration…</div>
      <div class="spotify-actions">
        <button class="btn btn-ghost btn-sm" id="spotifyLoadBtn">Load playlists</button>
      </div>
      <div id="spotifyPlaylists" style="margin-top:12px;"></div>
      <div id="spotifyPreview" style="margin-top:12px;"></div>

      <div class="col-head" style="margin-top:24px;"><span>Session</span><span class="count">●</span></div>
      <div id="historyList">
        <div class="empty-state">Searches and plays appear here.</div>
      </div>
    </div>

    <!-- MIDDLE: search results -->
    <div class="app-col">
      <div class="col-head">
        <span id="resultsLabel">Search results</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ink-faint);">↑↓ navigate · ⏎ play</span>
      </div>
      <div class="search-anchor" style="margin-bottom:14px;">
        <div class="app-search-field">
          <span class="search-prompt">›</span>
          <input id="appSearchInput" placeholder="Search a song, artist, album…" autocomplete="off" />
          <button class="mini-btn play" id="appPlayBtn">Play</button>
        </div>
        <div class="suggestions" id="appSuggestions"></div>
      </div>
      <div id="results"></div>
    </div>

    <!-- RIGHT: player detail -->
    <div class="app-col" id="player">
      <div class="col-head">
        <span>Selected</span>
        <span class="status-pill idle" id="statusPill">Ready</span>
      </div>

      <div class="detail-art" id="trackCover">
        <span class="detail-initials" id="trackCoverInitials">DM</span>
      </div>

      <h3 class="detail-title" id="trackTitle">Nothing playing yet</h3>
      <p class="detail-artist-line" id="trackMeta">Search for a track, pick a result, then play it in the browser.</p>

      <div class="detail-meta">
        <span class="k">Album</span>   <span class="v" id="albumField">Unknown</span>
        <span class="k">Release</span> <span class="v" id="releaseField">Unknown</span>
        <span class="k">Source</span>  <span class="v" id="sourceField">Waiting</span>
        <span class="k">Match</span>   <span class="v" id="miniConfidence">No match</span>
        <span class="k">Output</span>  <span class="v" id="outputStatus">Browser</span>
      </div>

      <div class="eq-wrap paused" id="equalizer" aria-hidden="true">
        <span class="eq-bar" style="--level:42;--speed:1.1s;--delay:-0.1s"></span>
        <span class="eq-bar" style="--level:68;--speed:1.35s;--delay:-0.45s"></span>
        <span class="eq-bar" style="--level:36;--speed:0.95s;--delay:-0.2s"></span>
        <span class="eq-bar" style="--level:88;--speed:1.55s;--delay:-0.75s"></span>
        <span class="eq-bar" style="--level:54;--speed:1.15s;--delay:-0.35s"></span>
        <span class="eq-bar" style="--level:74;--speed:1.45s;--delay:-0.6s"></span>
        <span class="eq-bar" style="--level:48;--speed:1s;--delay:-0.15s"></span>
        <span class="eq-bar" style="--level:92;--speed:1.7s;--delay:-0.85s"></span>
        <span class="eq-bar" style="--level:62;--speed:1.25s;--delay:-0.5s"></span>
        <span class="eq-bar" style="--level:38;--speed:1.05s;--delay:-0.25s"></span>
        <span class="eq-bar" style="--level:78;--speed:1.5s;--delay:-0.7s"></span>
        <span class="eq-bar" style="--level:50;--speed:1.2s;--delay:-0.4s"></span>
        <span class="eq-bar" style="--level:86;--speed:1.62s;--delay:-0.52s"></span>
        <span class="eq-bar" style="--level:58;--speed:1.28s;--delay:-0.32s"></span>
        <span class="eq-bar" style="--level:72;--speed:1.48s;--delay:-0.64s"></span>
        <span class="eq-bar" style="--level:44;--speed:1.08s;--delay:-0.22s"></span>
      </div>

      <div class="progress" aria-hidden="true"><div></div></div>
      <div class="time-row"><span id="elapsedTime">0:00</span><span id="durationTime">0:00</span></div>

      <div class="play-row">
        <button class="btn btn-primary btn-sm" id="playTop">Play selected</button>
        <button class="btn btn-ghost btn-sm" id="toggleBtn">Pause</button>
      </div>
      <button class="btn btn-ghost btn-sm" id="copyBtn" style="margin-top:8px;width:100%;justify-content:center;">Copy query</button>
      <button class="btn btn-ghost btn-sm" id="sendLocalBtn" style="margin-top:8px;width:100%;justify-content:center;">Send to local player</button>
      <div class="message-line" id="message">Type to search or choose a suggested track.</div>

      <!-- hidden compat elements -->
      <div style="display:none">
        <span id="sideStatus"></span><span id="queueCount"></span>
        <div id="miniCover"></div><span id="miniTitle"></span>
        <span id="miniArtist"></span><span id="coverMeta"></span>
        <div id="miniVisualizer"></div>
      </div>
    </div>
  </div>
</section>

<!-- FOOTER -->
<footer>
  <div>
    <div class="brand" style="margin-bottom:12px;">
      <div class="brand-mark">◐</div>
      <div class="brand-name">Dev Music Service</div>
    </div>
    <div class="footer-meta">MIT · FastAPI + Vercel · v0.4.2</div>
  </div>
  <nav>
    <a href="#how">How it works</a>
    <a href="#app">Try it</a>
    <a href="#search">Search</a>
  </nav>
</footer>

<!-- STICKY PLAYER BAR -->
<div id="playerBar" role="region" aria-label="Now playing">
  <div class="bar-track">
    <div class="bar-art" id="barCover">DM</div>
    <div class="bar-copy">
      <div class="bar-title" id="barTitle">Nothing playing yet</div>
      <div class="bar-artist" id="barArtist">—</div>
    </div>
  </div>
  <div class="bar-center">
    <div class="bar-controls">
      <button class="bar-btn primary" id="barPlayBtn" title="Play / pause">▶</button>
      <button class="bar-btn" id="barStopBtn" title="Stop">■</button>
    </div>
    <div style="width:100%;display:flex;flex-direction:column;gap:4px;">
      <div class="bar-progress" id="barProgressWrap">
        <div class="bar-progress-fill" id="barProgressFill"></div>
      </div>
      <div class="bar-time"><span id="barElapsed">0:00</span><span id="barDuration">0:00</span></div>
    </div>
  </div>
  <div class="bar-right">
    <div class="bar-status" id="barStatus">Ready</div>
    <button class="btn btn-ghost btn-sm" id="barSendLocal" style="display:none;">Local</button>
  </div>
</div>

<script>
    const input          = document.getElementById('appSearchInput');
    const suggestionsEl  = document.getElementById('appSuggestions');
    const playBtn        = document.getElementById('appPlayBtn');
    const results        = document.getElementById('results');
    const resultsLabel   = document.getElementById('resultsLabel');
    const trackTitle     = document.getElementById('trackTitle');
    const trackMeta      = document.getElementById('trackMeta');
    const trackCover     = document.getElementById('trackCover');
    const miniCover      = document.getElementById('miniCover');
    const miniTitle      = document.getElementById('miniTitle');
    const miniArtist     = document.getElementById('miniArtist');
    const coverMeta      = document.getElementById('coverMeta');
    const statusPill     = document.getElementById('statusPill');
    const sideStatus     = document.getElementById('sideStatus');
    const outputStatus   = document.getElementById('outputStatus');
    const queueCount     = document.getElementById('queueCount');
    const miniConfidence = document.getElementById('miniConfidence');
    const message        = document.getElementById('message');
    const runtimeStatus  = document.getElementById('runtimeStatus');
    const albumField     = document.getElementById('albumField');
    const releaseField   = document.getElementById('releaseField');
    const sourceField    = document.getElementById('sourceField');
    const toggleBtn      = document.getElementById('toggleBtn');
    const playTop        = document.getElementById('playTop');
    const copyBtn        = document.getElementById('copyBtn');
    const sendLocalBtn   = document.getElementById('sendLocalBtn');
    const progressFill   = document.querySelector('.progress > div');
    const elapsedTime    = document.getElementById('elapsedTime');
    const durationTime   = document.getElementById('durationTime');
    const equalizer      = document.getElementById('equalizer');
    const miniVisualizer = document.getElementById('miniVisualizer');
    const spotifyImport  = document.getElementById('spotifyImport');
    const spotifyConnectBtn = document.getElementById('spotifyConnectBtn');
    const spotifyLoadBtn    = document.getElementById('spotifyLoadBtn');
    const spotifyStatus     = document.getElementById('spotifyStatus');
    const spotifyPlaylists  = document.getElementById('spotifyPlaylists');
    const spotifyPreview    = document.getElementById('spotifyPreview');
    const historyList    = document.getElementById('historyList');
    const historyCount   = document.getElementById('historyCount');

    // Player bar
    const playerBar       = document.getElementById('playerBar');
    const barCover        = document.getElementById('barCover');
    const barTitle        = document.getElementById('barTitle');
    const barArtist       = document.getElementById('barArtist');
    const barPlayBtn      = document.getElementById('barPlayBtn');
    const barStopBtn      = document.getElementById('barStopBtn');
    const barProgressFill = document.getElementById('barProgressFill');
    const barElapsed      = document.getElementById('barElapsed');
    const barDuration     = document.getElementById('barDuration');
    const barStatus       = document.getElementById('barStatus');
    const barSendLocal    = document.getElementById('barSendLocal');

    let timer = null;
    let currentResults = [];
    let activeIndex = -1;
    let currentQuery = '';
    let currentTrack = null;
    let isResolvingPlayback = false;
    let activeSearchController = null;
    let searchRequestId = 0;
    let audioGesturePrimed = false;
    let audioGesturePrimePromise = null;
    let suppressAudioEvents = false;
    let sessionHistory = [];
    const audio = new Audio();
    audio.preload = 'none';
    audio.setAttribute('playsinline', '');
    audio.setAttribute('webkit-playsinline', '');
    const silentAudioDataUri = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQQAAAAAAA==';

    const fmtDuration = (secs) => {
      const total = Number(secs || 0);
      const mins = Math.floor(total / 60);
      const remainder = String(total % 60).padStart(2, '0');
      return total ? `${mins}:${remainder}` : 'live';
    };

    const cleanText = (value, fallback = 'Unknown') => String(value || '').trim() || fallback;

    const albumMeta = (item) => {
      const parts = [];
      if (item.artist) parts.push(item.artist);
      if (item.album) parts.push(item.album);
      if (item.release_year) parts.push(item.release_year);
      return parts.join(' · ') || 'Album metadata unavailable';
    };

    const confidenceLabel = (item = {}) => {
      if (!item.confidence) return 'Metadata pending';
      if (item.confidence >= 90) return `${item.confidence}% strong`;
      if (item.confidence >= 75) return `${item.confidence}% good`;
      return `${item.confidence}% review`;
    };

    const reasonLabel = (item = {}) => {
      if (item.match_reason) return item.match_reason.replaceAll('_', ' ');
      if (item.confidence >= 90) return 'title · artist · album';
      if (item.confidence > 0) return 'metadata candidate';
      return 'requires review';
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
      match_reason: suggestion?.match_reason || playable.match_reason,
    });

    const confClass = (c) => c >= 80 ? 'conf-high' : c > 0 ? 'conf-mid' : 'conf-low';
    const badgeClass = (c) => c >= 80 ? 'badge-ok' : c > 0 ? 'badge-warn' : 'badge-bad';
    const scoreClass = (c) => c >= 80 ? 'high' : c >= 55 ? 'mid' : 'low';

    const setStatus = (label, tone = 'idle') => {
      statusPill.textContent = label;
      statusPill.className = `status-pill${tone === 'good' ? '' : ' ' + (tone === 'idle' ? 'idle' : tone)}`;
      sideStatus.textContent = label;
    };

    const addHistory = (type, item, detail = '') => {
      const title = cleanText(item?.title || item || type, type);
      const meta = detail || (item ? albumMeta(item) : '');
      sessionHistory = [{ type, title, meta, item, at: new Date() }, ...sessionHistory].slice(0, 6);
      renderHistory();
    };

    const renderHistory = () => {
      historyCount.textContent = String(sessionHistory.length);
      queueCount.textContent = `${sessionHistory.length} saved`;
      if (!sessionHistory.length) {
        historyList.innerHTML = '<div class="empty-state">Searches and plays appear here.</div>';
        return;
      }
      historyList.innerHTML = '';
      sessionHistory.forEach((entry) => {
        const row = document.createElement('div');
        row.className = 'playlist-item';
        row.innerHTML = `<div><div class="pname">${escapeHtml(entry.title)}</div><div class="pmeta">${escapeHtml(entry.type)}${entry.meta ? ' · ' + escapeHtml(entry.meta) : ''}</div></div>`;
        historyList.appendChild(row);
      });
    };

    const setPlaybackBusy = (busy) => {
      isResolvingPlayback = busy;
      playBtn.disabled = busy;
      playTop.disabled = busy;
      toggleBtn.disabled = busy || !audio.src;
      if (busy) {
        playBtn.textContent = 'Resolving\u2026';
        playTop.textContent = 'Resolving\u2026';
      } else {
        playBtn.textContent = 'Play top match';
        playTop.textContent = currentResults[activeIndex] ? 'Play selected' : 'Play top match';
      }
    };

    const refreshPlayLabels = () => {
      if (!isResolvingPlayback) {
        playBtn.textContent = 'Play top match';
        playTop.textContent = currentResults[activeIndex] ? 'Play selected' : 'Play top match';
      }
    };

    const syncToggleLabel = () => {
      toggleBtn.textContent = audio.paused ? 'Resume' : 'Pause';
      toggleBtn.disabled = isResolvingPlayback || !audio.src;
    };

    const setEqualizerState = (state) => {
      equalizer.classList.toggle('playing', state === 'playing');
      equalizer.classList.toggle('paused', state !== 'playing');
      barPlayBtn.textContent = state === 'playing' ? '❚❚' : '▶';
      barStatus.textContent = state === 'playing' ? 'Playing' : (state === 'paused' ? 'Paused' : barStatus.textContent);
      barStatus.className = `bar-status${state === 'playing' ? ' playing' : ''}`;
    };

    const setSpotifyStatus = (text, tone = '') => {
      spotifyStatus.textContent = text;
      spotifyStatus.className = `notice ${tone}`.trim();
    };

    const errorDetail = async (response, fallback) => {
      const payload = await response.json().catch(() => ({}));
      return payload.detail || fallback;
    };

    const previewSkeleton = () => `<div class="skeleton"><div class="skeleton-line" style="width:70%"></div><div class="skeleton-line" style="width:90%"></div><div class="skeleton-line" style="width:58%"></div></div>`;

    const escapeAttr = (value = '') => String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const escapeHtml = escapeAttr;

    const coverInitials = (item = {}) => {
      const source = item.artist || item.title || 'Dev Music';
      return source.split(/\\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'DM';
    };

    const coverLabel = (item = {}) => {
      if (item.artwork_source === 'cover_art_archive') return `MusicBrainz ${item.artwork_confidence || 'release'} art`;
      if (item.artwork_source === 'spotify') return 'Spotify playlist artwork';
      if (item.artwork_source === 'youtube') return 'YouTube video thumbnail fallback';
      return 'Generated cover fallback';
    };

    const artMarkup = (item = {}, size = 40) => {
      const initials = coverInitials(item);
      if (!item.thumbnail) {
        return `<div class="match-art" style="width:${size}px;height:${size}px;">${escapeHtml(initials)}</div>`;
      }
      return `<div class="match-art" style="width:${size}px;height:${size}px;" title="${escapeAttr(coverLabel(item))}"><img src="${escapeAttr(item.thumbnail)}" alt="${escapeAttr(item.title || 'Cover')}" referrerpolicy="no-referrer" onerror="this.remove();" /></div>`;
    };

    const setCover = (item = {}) => {
      const initials = coverInitials(item);
      // update detail-art panel
      const initSpan = document.getElementById('trackCoverInitials');
      if (initSpan) initSpan.textContent = initials;
      const oldImg = trackCover.querySelector('img');
      if (oldImg) oldImg.remove();
      if (item.thumbnail) {
        const img = document.createElement('img');
        img.src = item.thumbnail;
        img.alt = `${item.title || 'Track'} cover`;
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => img.remove());
        trackCover.appendChild(img);
      }
      miniCover.textContent = initials;
      if (coverMeta) coverMeta.textContent = `${coverLabel(item)}.`;
    };

    const setTrack = (title, meta, item = {}) => {
      const displayTitle = title || 'Nothing playing yet';
      trackTitle.textContent = displayTitle;
      trackMeta.textContent = meta || 'Search for a track, pick a result, then play it in the browser.';
      miniTitle.textContent = displayTitle;
      miniArtist.textContent = item.artist || item.album || 'Waiting for a search';
      albumField.textContent = item.album || 'Unknown';
      releaseField.textContent = item.release_year || 'Unknown';
      sourceField.textContent = item.source || 'Waiting';
      miniConfidence.textContent = confidenceLabel(item);
    };

    const syncProgress = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        progressFill.style.width = '0%';
        barProgressFill.style.width = '0%';
        const el = fmtDuration(Math.floor(audio.currentTime || 0));
        const dur = currentTrack?.duration ? fmtDuration(currentTrack.duration) : '0:00';
        elapsedTime.textContent = el;
        durationTime.textContent = dur;
        barElapsed.textContent = el;
        barDuration.textContent = dur;
        return;
      }
      const pct = Math.max(0, Math.min(100, (audio.currentTime / audio.duration) * 100));
      progressFill.style.width = `${pct}%`;
      barProgressFill.style.width = `${pct}%`;
      const el = fmtDuration(Math.floor(audio.currentTime || 0));
      const dur = fmtDuration(Math.floor(audio.duration || currentTrack?.duration || 0));
      elapsedTime.textContent = el;
      durationTime.textContent = dur;
      barElapsed.textContent = el;
      barDuration.textContent = dur;
    };

    const showPlayerBar = (item = {}) => {
      const initials = coverInitials(item);
      barTitle.textContent = item.title || 'Nothing playing yet';
      barArtist.textContent = item.artist || item.album || '\u2014';
      barCover.innerHTML = '';
      barCover.textContent = initials;
      if (item.thumbnail) {
        const img = document.createElement('img');
        img.src = item.thumbnail;
        img.alt = `${item.title || 'Track'} cover`;
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => img.remove());
        barCover.appendChild(img);
      }
      playerBar.classList.add('visible');
      document.body.classList.add('player-open');
    };

    const makeSuggestionRow = (item, idx, onPick) => {
      const row = document.createElement('div');
      row.className = 'suggestion' + (idx === activeIndex ? ' active' : '');
      row.innerHTML = `
        ${artMarkup(item, 36)}
        <div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(albumMeta(item))} · ${fmtDuration(item.duration)}</small></div>
        <span class="badge ${badgeClass(item.confidence)}">${confidenceLabel(item)}</span>
      `;
      row.addEventListener('mousedown', (event) => { event.preventDefault(); onPick(item); });
      return row;
    };

    const renderSuggestions = () => {
      suggestionsEl.innerHTML = '';
      if (!currentResults.length) {
        suggestionsEl.classList.remove('visible');
        return;
      }
      const onPick = (item) => {
        const q = item.query || item.title;
        input.value = q;
        currentQuery = q;
        playQuery(q, item);
        suggestionsEl.classList.remove('visible');
      };
      currentResults.slice(0, 6).forEach((item, idx) => {
        suggestionsEl.appendChild(makeSuggestionRow(item, idx, onPick));
      });
      suggestionsEl.classList.add('visible');
    };

    const renderResults = (state = '') => {
      results.innerHTML = '';
      resultsLabel.textContent = currentResults.length ? `Results · ${currentResults.length}` : 'Search results';

      if (state === 'loading') {
        results.innerHTML = previewSkeleton();
        return;
      }

      if (!currentResults.length) {
        results.innerHTML = currentQuery
          ? '<div class="empty-state">No strong MusicBrainz matches. Try adding artist or album.</div>'
          : '<div class="empty-state">Ranked matches will appear here.</div>';
        refreshPlayLabels();
        return;
      }

      currentResults.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'track-row' + (idx === activeIndex ? ' selected' : '');
        row.innerHTML = `
          ${artMarkup(item, 40)}
          <div><div class="t">${escapeHtml(item.title)}</div><div class="a">${escapeHtml(albumMeta(item))} · ${fmtDuration(item.duration)}</div></div>
          <div class="track-conf ${confClass(item.confidence)}">${item.confidence ? item.confidence + '%' : '\u2014'}</div>
          <button class="mini-btn play">Play</button>
        `;
        row.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          activeIndex = idx;
          input.value = item.query || item.title;
          setTrack(item.title, `${albumMeta(item)} · ${confidenceLabel(item)}`, item);
          setCover(item);
          renderSuggestions();
          // Differential update: toggle .selected class without rebuilding the list
          results.querySelectorAll('.track-row').forEach((r, i) => r.classList.toggle('selected', i === activeIndex));
        });
        row.querySelector('button').addEventListener('click', (e) => {
          e.stopPropagation();
          primeAudioForUserGesture();
          activeIndex = idx;
          playQuery(item.query || item.title, item);
        });
        results.appendChild(row);
      });
      refreshPlayLabels();
    };

    const resolvePlayableItem = async (query, suggestion = null) => {
      if (suggestion?.webpage_url && suggestion?.stream_url) return suggestion;
      const searchQuery = suggestion?.query || query;
      const response = await fetch(`/api/search?query=${encodeURIComponent(searchQuery)}&limit=1`);
      if (!response.ok) throw new Error(`Playback lookup failed with ${response.status}`);
      const candidates = await response.json();
      if (!candidates.length) throw new Error('No playable result found.');
      return mergeMetadata(candidates[0], suggestion);
    };

    const primeAudioForUserGesture = () => {
      if (audioGesturePrimed || audioGesturePrimePromise) return;
      audioGesturePrimed = true;
      suppressAudioEvents = true;
      audio.muted = true;
      audio.src = silentAudioDataUri;
      let playPromise;
      try { playPromise = audio.play(); } catch (_error) {
        audioGesturePrimed = false; audio.muted = false; suppressAudioEvents = false; audioGesturePrimePromise = null; return;
      }
      audioGesturePrimePromise = Promise.resolve(playPromise)
        .catch(() => { audioGesturePrimed = false; })
        .finally(() => {
          if (audio.currentSrc === silentAudioDataUri) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
          audio.muted = false; suppressAudioEvents = false; audioGesturePrimePromise = null;
          syncToggleLabel();
        });
    };

    const startPlayback = async (item) => {
      console.log('[startPlayback] Starting playback for:', item);
      if (audioGesturePrimePromise) await audioGesturePrimePromise.catch(() => {});
      currentTrack = item;
      setStatus('Playing', 'good');
      setEqualizerState('playing');
      outputStatus.textContent = 'Browser';
      message.textContent = 'Loading audio…';
      setTrack(item.title, `${albumMeta(item)} · Duration ${fmtDuration(item.duration)} · ${confidenceLabel(item)}`, item);
      setCover(item);
      showPlayerBar(item);
      
      const fullUrl = item.stream_url;
      console.log('[startPlayback] Setting audio.src to:', fullUrl);
      audio.src = fullUrl;
      audio.currentTime = 0;
      
      audio.addEventListener('loadstart', () => console.log('[audio] loadstart'));
      audio.addEventListener('loadeddata', () => console.log('[audio] loadeddata'));
      audio.addEventListener('loadedmetadata', () => console.log('[audio] loadedmetadata, duration:', audio.duration));
      audio.addEventListener('canplay', () => console.log('[audio] canplay'));
      audio.addEventListener('canplaythrough', () => console.log('[audio] canplaythrough'));
      
      try {
        console.log('[startPlayback] Calling audio.play()...');
        await audio.play();
        console.log('[startPlayback] audio.play() succeeded');
        message.textContent = 'Playing in the browser.';
        addHistory('Played', item, albumMeta(item));
        syncProgress();
        syncToggleLabel();
      } catch (playError) {
        console.error('[startPlayback] audio.play() failed:', playError);
        throw playError;
      }
    };

    const search = async (query) => {
      currentQuery = query;
      if (!query || query.length < 2) {
        activeSearchController?.abort();
        searchRequestId += 1;
        currentResults = []; activeIndex = -1;
        renderSuggestions(); renderResults(); setPlaybackBusy(false);
        message.textContent = 'Type at least two characters to search.';
        return;
      }
      setStatus('Searching', 'warn');
      message.textContent = 'Finding ranked MusicBrainz candidates\u2026';
      renderResults('loading');
      activeSearchController?.abort();
      const controller = new AbortController();
      activeSearchController = controller;
      const requestId = searchRequestId + 1;
      searchRequestId = requestId;
      const response = await fetch(`/api/autocomplete?query=${encodeURIComponent(query)}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Autocomplete failed with ${response.status}`);
      const res = await response.json();
      if (requestId !== searchRequestId) return;
      currentResults = res;
      activeIndex = currentResults.length ? 0 : -1;
      setStatus('Ready');
      renderSuggestions();
      renderResults();
      if (currentResults[0]) {
        setTrack(currentResults[0].title, `${albumMeta(currentResults[0])} · ${confidenceLabel(currentResults[0])}`, currentResults[0]);
        setCover(currentResults[0]);
        addHistory('Searched', currentResults[0], query);
      }
      message.textContent = currentResults.length ? 'Ranked matches ready.' : 'No good matches found.';
      if (activeSearchController === controller) activeSearchController = null;
    };

    const playQuery = async (query, item = null) => {
      if (!query || isResolvingPlayback) return;
      if (!item) {
        if (!currentResults.length || currentQuery !== query) await search(query);
        item = currentResults[activeIndex] || currentResults[0];
      }
      try {
        setPlaybackBusy(true);
        setStatus('Resolving', 'warn');
        setEqualizerState('paused');
        message.textContent = 'Resolving the selected stream\u2026';
        const playableItem = await resolvePlayableItem(query, item);
        const playbackBody = { url: playableItem.webpage_url, title: playableItem.title, duration: playableItem.duration || 0 };
        if (playableItem.album) playbackBody.album = playableItem.album;
        if (playableItem.artist) playbackBody.artist = playableItem.artist;
        if (playableItem.thumbnail) playbackBody.thumbnail = playableItem.thumbnail;
        if (playableItem.artwork_source) playbackBody.artwork_source = playableItem.artwork_source;
        if (playableItem.artwork_confidence) playbackBody.artwork_confidence = playableItem.artwork_confidence;
        if (playableItem.release_year) playbackBody.release_year = playableItem.release_year;
        await fetch('/api/browser/playback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(playbackBody) });
        await startPlayback(playableItem);
      } catch (error) {
        setStatus('Error', 'warn');
        setEqualizerState('paused');
        message.textContent = error.message || 'Playback failed.';
      } finally {
        setPlaybackBusy(false);
        syncToggleLabel();
      }
    };

    const togglePlayback = async () => {
      if (!audio.src) { message.textContent = 'No browser track is buffered yet.'; return; }
      if (audio.paused) {
        setStatus('Playing', 'good'); setEqualizerState('playing');
        await audio.play();
        message.textContent = 'Playback resumed in the browser.';
      } else {
        audio.pause();
        setStatus('Paused', 'warn'); setEqualizerState('paused');
        message.textContent = 'Browser playback paused.';
      }
      syncToggleLabel();
    };

    const sendToLocalPlayer = async () => {
      const query = input.value.trim() || currentTrack?.title;
      if (!query) { message.textContent = 'Enter a query before sending to the local player.'; return; }
      const response = await fetch(`/api/integrations/openclaw/play?query=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error(await errorDetail(response, `Local playback failed with ${response.status}`));
      const data = await response.json();
      setStatus('Local Output', 'warn');
      outputStatus.textContent = 'Local';
      message.textContent = `Sent to local player (PID ${data.pid}).`;
    };

    const renderSpotifyPreview = (payload) => {
      spotifyPreview.innerHTML = '';
      const summary = document.createElement('div');
      summary.className = 'preview-summary';
      summary.innerHTML = `
        <div class="preview-stat"><span>Matched</span><strong>${payload.matched_count}</strong></div>
        <div class="preview-stat"><span>Low conf.</span><strong>${payload.low_confidence_count}</strong></div>
        <div class="preview-stat"><span>Unmatched</span><strong>${payload.unmatched_count}</strong></div>
      `;
      spotifyPreview.appendChild(summary);
      payload.tracks.forEach((item) => {
        const source = item.source;
        const match = item.musicbrainz;
        const row = document.createElement('div');
        row.className = 'import-track';
        row.innerHTML = `
          ${artMarkup({ title: source.title, artist: source.artist_names?.[0], thumbnail: match.artwork_url || source.artwork_url }, 36)}
          <div>
            <strong>${escapeHtml(source.title)}</strong>
            <small>${escapeHtml((source.artist_names || []).join(', '))} · ${escapeHtml(source.album || 'Unknown album')}</small>
            <small>MB: ${escapeHtml(match.title || 'No match')}${match.artist ? ' · ' + escapeHtml(match.artist) : ''}</small>
          </div>
          <span class="badge ${badgeClass(match.confidence)}">${match.confidence ? match.confidence + '%' : '\u2014'}</span>
        `;
        spotifyPreview.appendChild(row);
      });
    };

    const previewSpotifyPlaylist = async (playlist) => {
      setSpotifyStatus(`Mapping \u201c${playlist.name}\u201d to MusicBrainz\u2026`, 'warn');
      spotifyPreview.innerHTML = previewSkeleton();
      const response = await fetch(`/api/import/spotify/playlists/${encodeURIComponent(playlist.id)}/preview?limit=25`);
      if (!response.ok) throw new Error(await errorDetail(response, `Playlist import failed with ${response.status}`));
      renderSpotifyPreview(await response.json());
      setSpotifyStatus('Preview ready. Review match quality below.', 'good');
    };

    const loadSpotifyPlaylists = async () => {
      setSpotifyStatus('Loading Spotify playlists\u2026', 'warn');
      spotifyPlaylists.innerHTML = previewSkeleton();
      spotifyPreview.innerHTML = '';
      const response = await fetch('/api/import/spotify/playlists?limit=20');
      if (!response.ok) throw new Error(await errorDetail(response, `Could not load Spotify playlists (${response.status})`));
      const playlists = await response.json();
      spotifyPlaylists.innerHTML = '';
      if (!playlists.length) { setSpotifyStatus('No Spotify playlists found.', 'warn'); return; }
      playlists.forEach((playlist) => {
        const row = document.createElement('div');
        row.className = 'playlist-item';
        row.innerHTML = `
          <div>
            <div class="pname">${escapeHtml(playlist.name)}</div>
            <div class="pmeta">${playlist.track_count} tracks${playlist.owner ? ' · ' + escapeHtml(playlist.owner) : ''}</div>
          </div>
          <button class="mini-btn">Preview</button>
        `;
        row.querySelector('button').addEventListener('click', async () => {
          try { await previewSpotifyPlaylist(playlist); }
          catch (error) { setSpotifyStatus(error.message || 'Playlist mapping failed.', 'danger'); }
        });
        spotifyPlaylists.appendChild(row);
      });
      setSpotifyStatus('Choose a playlist to preview match quality.', 'good');
    };

    const refreshSpotifyStatus = async () => {
      const response = await fetch('/api/import/spotify/status');
      if (!response.ok) { spotifyImport.hidden = true; return; }
      const status = await response.json();
      if (!status.configured) {
        spotifyConnectBtn.disabled = true;
        spotifyLoadBtn.disabled = true;
        setSpotifyStatus('Spotify import needs SPOTIFY_CLIENT_ID configured.', 'warn');
        return;
      }
      spotifyConnectBtn.disabled = false;
      spotifyLoadBtn.disabled = !status.connected;
      setSpotifyStatus(
        status.connected ? 'Spotify connected. Load playlists to inspect match quality.' : 'Connect Spotify to import playlists.',
        status.connected ? 'good' : ''
      );
    };

    const connectSpotify = () => {
      const popup = window.open('/api/import/spotify/start', 'spotify-auth', 'width=520,height=720');
      if (!popup) setSpotifyStatus('Popup was blocked. Allow popups and try again.', 'warn');
    };

    const applyRuntimeMode = async () => {
      try {
        const response = await fetch('/health');
        if (!response.ok) return;
        const health = await response.json();
        runtimeStatus.textContent = `${health.mode} · ${health.stream_delivery}`;
        if (health.local_integration === 'disabled-on-vercel') {
          sendLocalBtn.hidden = true;
          barSendLocal.style.display = 'none';
          outputStatus.textContent = 'Browser';
        } else {
          barSendLocal.style.display = '';
        }
      } catch (_error) {
        runtimeStatus.textContent = 'Runtime unavailable';
        sendLocalBtn.hidden = true;
        barSendLocal.style.display = 'none';
      }
    };

    input.addEventListener('input', (event) => {
      const query = event.target.value.trim();
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try { await search(query); }
        catch (error) {
          if (error.name === 'AbortError') return;
          setStatus('Error', 'warn'); renderResults();
          message.textContent = error.message || 'Search failed.';
        }
      }, 300);
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        primeAudioForUserGesture();
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
        renderSuggestions(); renderResults();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        renderSuggestions(); renderResults();
      } else if (event.key === 'Escape') {
        suggestionsEl.classList.remove('visible');
      }
    });

    playBtn.addEventListener('click', () => {
      primeAudioForUserGesture();
      const item = currentResults[activeIndex] || currentResults[0];
      playQuery(item?.query || input.value.trim(), item);
    });

    playTop.addEventListener('click', () => {
      primeAudioForUserGesture();
      const item = currentResults[activeIndex] || currentResults[0];
      playQuery(item?.query || input.value.trim(), item);
    });

    toggleBtn.addEventListener('click', togglePlayback);

    barPlayBtn.addEventListener('click', () => { primeAudioForUserGesture(); togglePlayback(); });
    barStopBtn.addEventListener('click', () => {
      audio.pause();
      audio.currentTime = 0;
      audio.removeAttribute('src');
      audio.load();
      setStatus('Ready');
      setEqualizerState('paused');
      message.textContent = 'Stopped.';
      syncProgress();
      syncToggleLabel();
      barProgressFill.style.width = '0%';
      barStatus.textContent = 'Stopped';
      barStatus.className = 'bar-status';
      barPlayBtn.textContent = '▶';
    });
    barSendLocal.addEventListener('click', async () => {
      try { await sendToLocalPlayer(); }
      catch (error) { setStatus('Error', 'warn'); message.textContent = error.message || 'Local playback failed.'; }
    });

    copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(input.value.trim());
      message.textContent = 'Copied query to clipboard.';
    });

    sendLocalBtn.addEventListener('click', async () => {
      try { await sendToLocalPlayer(); }
      catch (error) { setStatus('Error', 'warn'); message.textContent = error.message || 'Local playback failed.'; }
    });

    spotifyConnectBtn.addEventListener('click', connectSpotify);
    spotifyLoadBtn.addEventListener('click', async () => {
      try { await loadSpotifyPlaylists(); }
      catch (error) { setSpotifyStatus(error.message || 'Could not load Spotify playlists.', 'danger'); spotifyPlaylists.innerHTML = ''; }
    });

    window.addEventListener('message', async (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'spotify-connected') return;
      await refreshSpotifyStatus();
      try { await loadSpotifyPlaylists(); }
      catch (error) { setSpotifyStatus(error.message || 'Could not load Spotify playlists.', 'danger'); }
    });

    let _lastProgressTick = 0;
    audio.addEventListener('timeupdate', () => {
      const now = Date.now();
      if (now - _lastProgressTick < 200) return;
      _lastProgressTick = now;
      syncProgress();
    });
    audio.addEventListener('ended', () => {
      if (suppressAudioEvents) return;
      setStatus('Ready'); message.textContent = 'Track finished.';
      progressFill.style.width = '100%'; setEqualizerState('paused'); syncToggleLabel();
    });
    audio.addEventListener('pause', () => {
      if (suppressAudioEvents) return;
      if (audio.currentTime > 0 && audio.currentTime < audio.duration) setStatus('Paused', 'warn');
      setEqualizerState('paused'); syncToggleLabel();
    });
    audio.addEventListener('play', () => {
      if (suppressAudioEvents) return;
      setStatus('Playing', 'good'); setEqualizerState('playing'); syncToggleLabel();
    });
    audio.addEventListener('waiting', () => {
      if (suppressAudioEvents) return;
      setStatus('Buffering', 'warn'); message.textContent = 'Buffering browser audio\u2026';
      barStatus.textContent = 'Buffering'; barStatus.className = 'bar-status buffering';
    });
    audio.addEventListener('error', (e) => {
      if (suppressAudioEvents) return;
      console.error('Audio error event:', e);
      console.error('Audio error details:', audio.error);
      const errorMessages = {
        1: 'MEDIA_ERR_ABORTED',
        2: 'MEDIA_ERR_NETWORK',
        3: 'MEDIA_ERR_DECODE',
        4: 'MEDIA_ERR_SRC_NOT_SUPPORTED'
      };
      const errorCode = audio.error?.code || 'unknown';
      const errorMsg = audio.error?.message || 'Unknown error';
      setStatus(`Playback failed (${errorMessages[errorCode] || errorCode})`, 'warn');
      setEqualizerState('paused');
      message.textContent = `Browser playback failed: ${errorMsg}. Check console for details.`;
      barStatus.textContent = 'Failed'; barStatus.className = 'bar-status';
      barPlayBtn.textContent = '▶';
    });
    audio.addEventListener('loadedmetadata', syncProgress);

    document.addEventListener('click', (event) => {
      const t = event.target;
      if (!suggestionsEl.contains(t) && t !== input && !t.closest('.app-search-field')) {
        suggestionsEl.classList.remove('visible');
      }
    });

    setStatus('Ready');
    setTrack('Nothing playing yet', 'Search for a track, pick a result, then play it in the browser.', {});
    setCover({ title: 'Dev Music', artist: 'Dev Music' });
    renderResults();
    renderHistory();
    syncProgress();
    syncToggleLabel();
    setEqualizerState('paused');
    applyRuntimeMode();
    refreshSpotifyStatus();
</script>
</body>
</html>
"""
