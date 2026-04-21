INDEX_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dev Music Service</title>
  <style>
    :root {
      /* Theme variables */
      --gradient-default: radial-gradient(circle at 12% 4%, rgba(40, 240, 165, 0.16), transparent 28%),
        radial-gradient(circle at 88% 0%, rgba(125, 215, 255, 0.15), transparent 24%),
        radial-gradient(circle at 50% 100%, rgba(255, 209, 102, 0.10), transparent 30%),
        linear-gradient(145deg, #05070d 0%, #08111e 42%, #0c1724 100%);
      --gradient-sunset: radial-gradient(circle at 12% 4%, rgba(255, 94, 58, 0.2), transparent 28%),
        radial-gradient(circle at 88% 0%, rgba(255, 165, 0, 0.18), transparent 24%),
        radial-gradient(circle at 50% 100%, rgba(255, 215, 0, 0.12), transparent 30%),
        linear-gradient(145deg, #2b0d0d, #3a1f1f 45%, #4b2a2a);
      --gradient-slack: radial-gradient(circle at 12% 4%, rgba(97, 158, 255, 0.2), transparent 28%),
        radial-gradient(circle at 88% 0%, rgba(128, 108, 255, 0.18), transparent 24%),
        radial-gradient(circle at 50% 100%, rgba(255, 255, 255, 0.12), transparent 30%),
        linear-gradient(145deg, #2e3a59, #3f4b71 45%, #5b6a9c);
      --gradient-aurora: radial-gradient(circle at 12% 4%, rgba(173, 216, 230, 0.2), transparent 28%),
        radial-gradient(circle at 88% 0%, rgba(144, 238, 144, 0.18), transparent 24%),
        radial-gradient(circle at 50% 100%, rgba(221, 160, 221, 0.12), transparent 30%),
        linear-gradient(145deg, #0d1e2b, #12344f 45%, #1b5e80);
      --gradient-ocean: radial-gradient(circle at 12% 4%, rgba(0, 102, 204, 0.2), transparent 28%),
        radial-gradient(circle at 88% 0%, rgba(0, 153, 255, 0.18), transparent 24%),
        radial-gradient(circle at 50% 100%, rgba(102, 204, 255, 0.12), transparent 30%),
        linear-gradient(145deg, #001a33, #004080 45%, #0066cc);
      --gradient-forest: radial-gradient(circle at 12% 4%, rgba(34, 139, 34, 0.2), transparent 28%),
        radial-gradient(circle at 88% 0%, rgba(85, 107, 47, 0.18), transparent 24%),
        radial-gradient(circle at 50% 100%, rgba(107, 142, 35, 0.12), transparent 30%),
        linear-gradient(145deg, #0b200b, #113311 45%, #1a5a1a);
      --gradient-neon: radial-gradient(circle at 12% 4%, rgba(255, 0, 255, 0.2), transparent 28%),
        radial-gradient(circle at 88% 0%, rgba(0, 255, 255, 0.18), transparent 24%),
        radial-gradient(circle at 50% 100%, rgba(255, 255, 0, 0.12), transparent 30%),
        linear-gradient(145deg, #ff00ff, #00ffff 45%, #ffff00);
      --bg-gradient: var(--gradient-default);

      /* Theme variables */
      --bg: #05070d;
      --bg-deep: #090f18;
      --panel: rgba(13, 19, 31, 0.76);
      --panel-strong: rgba(17, 25, 39, 0.92);
      --panel-soft: rgba(255, 255, 255, 0.055);
      --line: rgba(255, 255, 255, 0.11);
      --line-strong: rgba(255, 255, 255, 0.18);
      --text: #f5f7fb;
      --muted: #94a2b5;
      --quiet: #657287;
      --accent: #28f0a5;
      --accent-2: #7dd7ff;
      --warn: #ffd166;
      --danger: #ff817a;
      --good-bg: rgba(40, 240, 165, 0.13);
      --warn-bg: rgba(255, 209, 102, 0.13);
      --danger-bg: rgba(255, 129, 122, 0.12);
      --radius-xl: 32px;
      --radius-lg: 24px;
      --radius-md: 18px;
      --shadow: 0 34px 90px rgba(0, 0, 0, 0.42);
      --font: ui-sans-serif, "Avenir Next", "SF Pro Display", "Segoe UI", sans-serif;
    }

    * { box-sizing: border-box; }

    html { scroll-behavior: smooth; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: var(--font);
      color: var(--text);
      background: var(--bg-gradient);
      overflow-x: hidden;
    }

    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: 0.38;
      background-image:
        linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.026) 1px, transparent 1px);
      background-size: 42px 42px;
      mask-image: radial-gradient(circle at 50% 18%, black, transparent 70%);
    }

    button, input {
      font: inherit;
    }

    button {
      border: 0;
      min-height: 46px;
      border-radius: 999px;
      padding: 0 18px;
      color: var(--text);
      font-weight: 800;
      letter-spacing: -0.01em;
      cursor: pointer;
      transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease, opacity 0.16s ease;
      white-space: nowrap;
    }

    button:hover:not(:disabled) { transform: translateY(-1px); }
    button:active:not(:disabled) { transform: translateY(0); }
    button:disabled { opacity: 0.48; cursor: not-allowed; }

    .primary {
      color: #02110b;
      background: linear-gradient(135deg, #eaffbf 0%, var(--accent) 42%, #15c987 100%);
      box-shadow: 0 18px 42px rgba(40, 240, 165, 0.2);
    }

    .secondary {
      color: var(--text);
      background: rgba(255, 255, 255, 0.09);
      border: 1px solid var(--line);
    }

    .ghost {
      color: var(--text);
      background: rgba(255, 255, 255, 0.055);
      border: 1px solid var(--line);
    }

    .wrap {
      position: relative;
      width: min(1440px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 22px 0 42px;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 18px;
      padding: 12px 0 18px;
      backdrop-filter: blur(18px);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: max-content;
    }

    .brand-mark {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      border-radius: 14px;
      color: #03110b;
      font-weight: 950;
      letter-spacing: -0.08em;
      background: linear-gradient(135deg, #eaffbf, var(--accent));
      box-shadow: 0 16px 34px rgba(40, 240, 165, 0.18);
    }

    .brand strong { display: block; letter-spacing: -0.04em; }
    .brand small { color: var(--muted); }

    .nav {
      display: flex;
      justify-content: center;
      gap: 6px;
      padding: 6px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.045);
      border-radius: 999px;
      justify-self: center;
    }

    .nav a {
      color: var(--muted);
      text-decoration: none;
      padding: 9px 13px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 750;
    }

    .nav a:hover {
      color: var(--text);
      background: rgba(255, 255, 255, 0.07);
    }

    .shell-status {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--muted);
      font-size: 13px;
      justify-self: end;
    }

    .dot {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 20px rgba(40, 240, 165, 0.75);
    }

    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.28fr) minmax(330px, 0.72fr);
      gap: 18px;
      align-items: stretch;
      margin: 16px 0 18px;
    }

    .surface {
      border: 1px solid var(--line);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.075), rgba(255, 255, 255, 0.03)),
        var(--panel);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow);
      backdrop-filter: blur(22px);
    }

    .hero-copy {
      padding: clamp(24px, 4vw, 42px);
      min-height: 360px;
      display: grid;
      align-content: space-between;
      gap: 24px;
      overflow: visible;
    }

    .eyebrow-row, .chips, .quick-actions, .meta-row, .card-head, .status-row, .player-actions, .quality-grid {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border: 1px solid rgba(40, 240, 165, 0.22);
      color: #bdf9dc;
      background: rgba(40, 240, 165, 0.09);
      border-radius: 999px;
      font-size: 13px;
      font-weight: 760;
    }

    .chip, .badge, .status-pill, .confidence-pill {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      border-radius: 999px;
      border: 1px solid var(--line);
      color: var(--muted);
      background: rgba(255, 255, 255, 0.055);
      font-size: 12px;
      font-weight: 760;
      line-height: 1;
      padding: 8px 10px;
    }

    .badge.good, .confidence-pill.good {
      color: #c7ffe3;
      border-color: rgba(40, 240, 165, 0.28);
      background: var(--good-bg);
    }

    .badge.warn, .confidence-pill.warn {
      color: #ffe5a9;
      border-color: rgba(255, 209, 102, 0.26);
      background: var(--warn-bg);
    }

    .badge.danger, .confidence-pill.danger {
      color: #ffc4c0;
      border-color: rgba(255, 129, 122, 0.24);
      background: var(--danger-bg);
    }

    h1 {
      max-width: 860px;
      margin: 20px 0 12px;
      font-size: clamp(46px, 7.8vw, 94px);
      line-height: 0.88;
      letter-spacing: -0.078em;
    }

    .subtitle {
      max-width: 780px;
      margin: 0;
      color: var(--muted);
      font-size: clamp(16px, 2vw, 19px);
      line-height: 1.65;
    }

    .search-console {
      position: relative;
      display: grid;
      gap: 14px;
      padding: 14px;
      border: 1px solid var(--line-strong);
      background: rgba(3, 8, 15, 0.58);
      border-radius: 26px;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 22px 60px rgba(0, 0, 0, 0.28);
    }

    .search-row {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 10px;
      align-items: center;
    }

    .search-input-wrap {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 12px;
      min-height: 58px;
      padding: 0 16px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.065);
      border-radius: 999px;
      transition: 0.18s ease;
    }

    .search-input-wrap:focus-within {
      border-color: rgba(40, 240, 165, 0.72);
      box-shadow: 0 0 0 5px rgba(40, 240, 165, 0.1);
    }

    .search-glyph {
      color: var(--accent);
      font-size: 18px;
      font-weight: 900;
    }

    input {
      width: 100%;
      min-width: 0;
      border: 0;
      outline: 0;
      color: var(--text);
      background: transparent;
      font-size: 16px;
    }

    input::placeholder { color: #6f7d91; }

    .quick-actions button {
      min-height: 34px;
      padding: 0 12px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 780;
    }

    .suggestions {
      position: absolute;
      inset: calc(100% + 8px) 12px auto 12px;
      display: none;
      max-height: 320px;
      overflow: auto;
      z-index: 20;
      border: 1px solid var(--line-strong);
      background: rgba(5, 9, 17, 0.97);
      border-radius: 24px;
      box-shadow: var(--shadow);
    }

    .suggestions.visible { display: block; }

    .suggestion {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 13px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.065);
      cursor: pointer;
    }

    .suggestion:hover, .suggestion.active { background: rgba(40, 240, 165, 0.1); }
    .suggestion strong { display: block; margin-bottom: 3px; letter-spacing: -0.02em; }
    .suggestion small { color: var(--muted); }

    .mini-player {
      padding: 20px;
      display: grid;
      gap: 16px;
      align-content: space-between;
      min-height: 360px;
    }

    .mini-top {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 14px;
      align-items: center;
    }

    .mini-copy small, .label, .section-kicker {
      display: block;
      color: var(--quiet);
      font-size: 11px;
      font-weight: 850;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }

    .mini-copy strong {
      display: block;
      margin-top: 5px;
      font-size: 18px;
      letter-spacing: -0.03em;
    }

    .mini-meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .mini-stat {
      padding: 14px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.045);
      border-radius: 18px;
    }

    .mini-stat strong {
      display: block;
      margin-top: 6px;
      font-size: 16px;
      min-height: 21px;
    }

    .mini-visual {
      height: 110px;
      display: grid;
      align-items: end;
      grid-template-columns: repeat(18, 1fr);
      gap: 5px;
      padding: 16px;
      border-radius: 24px;
      overflow: hidden;
      border: 1px solid var(--line);
      background:
        radial-gradient(circle at 18% 0%, rgba(40, 240, 165, 0.20), transparent 34%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.03));
    }

    .mini-visual span {
      height: calc(var(--level) * 1%);
      border-radius: 999px 999px 4px 4px;
      background: linear-gradient(180deg, #dfffb3, var(--accent));
      opacity: 0.48;
      transform-origin: bottom;
      animation: meterPulse var(--speed) ease-in-out infinite;
      animation-play-state: paused;
    }

    .mini-visual.playing span {
      opacity: 0.95;
      animation-play-state: running;
    }

    @keyframes meterPulse {
      0%, 100% { transform: scaleY(0.42); }
      44% { transform: scaleY(1); }
      72% { transform: scaleY(0.68); }
    }

    .workspace {
      display: grid;
      grid-template-columns: minmax(0, 1.06fr) minmax(360px, 0.94fr);
      gap: 18px;
      align-items: start;
    }

    .stack {
      display: grid;
      gap: 18px;
    }

    .card {
      padding: 20px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.045);
      border-radius: var(--radius-lg);
    }

    .card.surface { background: var(--panel); }

    .card-head {
      justify-content: space-between;
      margin-bottom: 16px;
    }

    .section-title {
      margin: 3px 0 0;
      font-size: 20px;
      letter-spacing: -0.04em;
    }

    .muted { color: var(--muted); }
    .quiet { color: var(--quiet); }

    .player-card {
      min-height: 560px;
      overflow: hidden;
      position: relative;
    }

    .player-card::after {
      content: "";
      position: absolute;
      inset: auto -18% -34% 34%;
      height: 260px;
      pointer-events: none;
      background: radial-gradient(circle, rgba(40, 240, 165, 0.13), transparent 68%);
    }

    .player-main {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: minmax(220px, 0.5fr) minmax(0, 1fr);
      gap: 22px;
      align-items: start;
    }

    .cover-stage {
      display: grid;
      gap: 12px;
    }

    .cover {
      position: relative;
      width: 56px;
      height: 56px;
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      overflow: hidden;
      border-radius: 16px;
      color: rgba(255, 255, 255, 0.92);
      font-weight: 950;
      letter-spacing: -0.08em;
      text-transform: uppercase;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background:
        linear-gradient(135deg, rgba(40, 240, 165, 0.42), rgba(125, 215, 255, 0.22)),
        radial-gradient(circle at 30% 18%, rgba(255, 255, 255, 0.28), transparent 36%),
        rgba(255, 255, 255, 0.075);
    }

    .cover img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .cover.large {
      width: min(100%, 320px);
      aspect-ratio: 1;
      height: auto;
      border-radius: 30px;
      font-size: 48px;
      box-shadow: 0 28px 70px rgba(0, 0, 0, 0.38);
    }

    .cover.small {
      width: 46px;
      height: 46px;
      border-radius: 14px;
      font-size: 14px;
    }

    .cover.tiny {
      width: 34px;
      height: 34px;
      border-radius: 11px;
      font-size: 11px;
    }

    .track-title {
      margin: 0;
      font-size: clamp(28px, 4vw, 46px);
      line-height: 1;
      letter-spacing: -0.062em;
    }

    .track-meta {
      margin: 12px 0 0;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.55;
    }

    .status-row {
      justify-content: space-between;
      margin-bottom: 18px;
    }

    .status-pill {
      color: #c7ffe3;
      border-color: rgba(40, 240, 165, 0.28);
      background: var(--good-bg);
    }

    .status-pill.warn {
      color: #ffe5a9;
      border-color: rgba(255, 209, 102, 0.26);
      background: var(--warn-bg);
    }

    .status-pill.idle {
      color: var(--muted);
      border-color: var(--line);
      background: rgba(255, 255, 255, 0.055);
    }

    .message-line {
      color: var(--muted);
      font-size: 13px;
      text-align: right;
    }

    .metadata-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin: 20px 0;
    }

    .metadata-tile {
      padding: 13px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.045);
      border-radius: 17px;
      min-height: 74px;
    }

    .metadata-tile strong {
      display: block;
      margin-top: 6px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .visualizer {
      position: relative;
      height: 154px;
      display: flex;
      align-items: end;
      gap: 7px;
      padding: 18px;
      margin: 18px 0;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 26px;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.025)),
        radial-gradient(circle at 20% 12%, rgba(40, 240, 165, 0.20), transparent 38%),
        radial-gradient(circle at 82% 100%, rgba(125, 215, 255, 0.13), transparent 36%);
    }

    .visualizer::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background-image:
        linear-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
      background-size: 100% 22px, 42px 100%;
      mask-image: linear-gradient(180deg, transparent, black 18%, black 82%, transparent);
    }

    .eq-bar {
      position: relative;
      z-index: 1;
      flex: 1;
      min-width: 5px;
      height: calc(var(--level) * 1%);
      border-radius: 999px 999px 5px 5px;
      background: linear-gradient(180deg, #f5ffc7 0%, #69f5bc 45%, #0fb778 100%);
      box-shadow: 0 0 18px rgba(40, 240, 165, 0.24);
      opacity: 0.42;
      transform-origin: bottom;
      transition: opacity 0.2s ease, filter 0.2s ease;
      animation: eqPulse var(--speed) ease-in-out infinite;
      animation-delay: var(--delay);
      animation-play-state: paused;
    }

    .visualizer.playing .eq-bar {
      opacity: 0.96;
      filter: saturate(1.18);
      animation-play-state: running;
    }

    .visualizer.paused .eq-bar {
      opacity: 0.36;
      animation-play-state: paused;
    }

    @keyframes eqPulse {
      0%, 100% { transform: scaleY(0.38); }
      36% { transform: scaleY(1); }
      68% { transform: scaleY(0.62); }
    }

    .progress {
      height: 11px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.085);
    }

    .progress > div {
      width: 0%;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--accent), #eaffbf);
      box-shadow: 0 0 18px rgba(40, 240, 165, 0.35);
    }

    .time-row {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
      color: var(--quiet);
      font-size: 12px;
      font-weight: 760;
    }

    .player-actions {
      margin-top: 18px;
    }

    .side-panel {
      display: grid;
      gap: 18px;
    }

    .results-list, .playlist-list, .import-preview, .history-list {
      display: grid;
      gap: 10px;
    }

    .result {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 12px;
      align-items: center;
      padding: 13px;
      border: 1px solid rgba(255, 255, 255, 0.075);
      background: rgba(255, 255, 255, 0.04);
      border-radius: 20px;
      cursor: pointer;
      transition: 0.16s ease;
    }

    .result:hover {
      transform: translateY(-1px);
      border-color: rgba(40, 240, 165, 0.24);
      background: rgba(255, 255, 255, 0.058);
    }

    .result.selected {
      border-color: rgba(40, 240, 165, 0.58);
      background: rgba(40, 240, 165, 0.095);
      box-shadow: inset 4px 0 0 rgba(40, 240, 165, 0.74);
    }

    .result-info {
      min-width: 0;
      display: grid;
      gap: 6px;
    }

    .result-info strong, .playlist-row strong, .import-track strong, .history-item strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      letter-spacing: -0.025em;
    }

    .result-info small, .playlist-row small, .import-track small, .history-item small {
      color: var(--muted);
      line-height: 1.45;
    }

    .result-actions {
      display: grid;
      justify-items: end;
      gap: 8px;
    }

    .result-actions button {
      min-height: 36px;
      padding: 0 13px;
      font-size: 12px;
    }

    .rank {
      color: var(--quiet);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    .empty-state, .loading-state, .notice {
      padding: 18px;
      border: 1px dashed rgba(255, 255, 255, 0.16);
      background: rgba(255, 255, 255, 0.035);
      border-radius: 20px;
      color: var(--muted);
      line-height: 1.55;
    }

    .notice.good {
      color: #c7ffe3;
      border-color: rgba(40, 240, 165, 0.24);
      background: var(--good-bg);
    }

    .notice.warn {
      color: #ffe5a9;
      border-color: rgba(255, 209, 102, 0.24);
      background: var(--warn-bg);
    }

    .notice.danger {
      color: #ffc4c0;
      border-color: rgba(255, 129, 122, 0.24);
      background: var(--danger-bg);
    }

    .skeleton {
      display: grid;
      gap: 10px;
    }

    .skeleton-line {
      height: 14px;
      border-radius: 999px;
      background: linear-gradient(90deg, rgba(255,255,255,0.055), rgba(255,255,255,0.13), rgba(255,255,255,0.055));
      background-size: 220% 100%;
      animation: shimmer 1.15s linear infinite;
    }

    @keyframes shimmer {
      from { background-position: 120% 0; }
      to { background-position: -120% 0; }
    }

    .spotify-card {
      border-color: rgba(40, 240, 165, 0.16);
      background:
        linear-gradient(135deg, rgba(40, 240, 165, 0.08), rgba(125, 215, 255, 0.035)),
        rgba(255, 255, 255, 0.04);
    }

    .spotify-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .playlist-row, .import-track, .history-item {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 12px;
      align-items: center;
      padding: 12px;
      border: 1px solid rgba(255, 255, 255, 0.075);
      background: rgba(255, 255, 255, 0.04);
      border-radius: 18px;
    }

    .playlist-row button {
      min-height: 36px;
      padding: 0 13px;
      font-size: 12px;
    }

    .import-track {
      grid-template-columns: auto 1fr auto;
    }

    .preview-summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .preview-stat {
      padding: 13px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.045);
      border-radius: 17px;
    }

    .preview-stat strong {
      display: block;
      margin-top: 6px;
      font-size: 20px;
      letter-spacing: -0.04em;
    }

    .history-item {
      grid-template-columns: auto 1fr;
    }

    .footer {
      padding: 18px 4px 0;
      color: rgba(255, 255, 255, 0.54);
      font-size: 13px;
    }

    @media (max-width: 1120px) {
      .hero, .workspace, .player-main {
        grid-template-columns: 1fr;
      }

      .topbar {
        grid-template-columns: 1fr;
      }

      .nav {
        justify-self: stretch;
        overflow-x: auto;
        justify-content: flex-start;
      }

      .shell-status {
        justify-self: start;
      }

      .cover.large {
        width: min(280px, 100%);
      }
    }

    @media (max-width: 720px) {
      .wrap { width: min(100vw - 20px, 1440px); }
      .hero-copy, .mini-player, .card { padding: 16px; border-radius: 24px; }
      .search-row, .metadata-grid, .preview-summary, .mini-meta {
        grid-template-columns: 1fr;
      }
      .result, .playlist-row, .import-track {
        grid-template-columns: auto 1fr;
      }
      .result-actions, .playlist-row button, .import-track .confidence-pill {
        grid-column: 1 / -1;
        justify-self: stretch;
      }
      .result-actions button, .playlist-row button {
        width: 100%;
      }
      .message-line {
        text-align: left;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">DM</div>
        <div>
          <strong>Dev Music Service</strong>
          <small>Browser-first music matching</small>
        </div>
      </div>
      <nav class="nav" aria-label="Primary sections">
        <a href="#search">Search</a>
        <a href="#player">Player</a>
        <a href="#matches">Matches</a>
        <a href="#spotify">Spotify import</a>
      </nav>
      <div class="shell-status"><span class="dot"></span><span id="runtimeStatus">Checking runtime</span></div>
    </header>

    <main>
      <section class="hero">
        <div class="theme-picker" style="margin-top:12px;">
          <label for="themeSelect" style="color:var(--muted);font-size:13px;">Theme:</label>
          <select id="themeSelect" style="margin-left:8px;background:var(--panel-soft);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:4px;">
            <option value="default">Default</option>
            <option value="sunset">Sunset</option>
            <option value="aurora">Aurora</option>
            <option value="ocean">Ocean</option>
            <option value="forest">Forest</option>
            <option value="neon">Neon</option>
          </select>
        </div>
        <div class="surface hero-copy" id="search">
          <div>
            <div class="eyebrow-row">
              <span class="eyebrow">MusicBrainz-ranked matching</span>
              <span class="chip">Read-only imports</span>
              <span class="chip">Browser playback</span>
            </div>
            <h1>Find the right version before you press play.</h1>
            <p class="subtitle">Search tracks, inspect ranked metadata matches, resolve the best playable stream, and preview playlist quality before committing to a larger import workflow.</p>
          </div>

          <div class="search-console">
            <div class="search-row">
              <label class="search-input-wrap" for="searchInput">
                <span class="search-glyph">⌕</span>
                <input id="searchInput" placeholder="Search a song, artist, album, or version..." autocomplete="off" />
              </label>
              <button class="primary" id="playBtn">Play top match</button>
              <button class="secondary" id="toggleBtn">Pause</button>
            </div>
            <div class="quick-actions" aria-label="Suggested searches">
              <button class="ghost quick-search" data-query="Daft Punk One More Time">Daft Punk</button>
              <button class="ghost quick-search" data-query="Sade Smooth Operator">Sade</button>
              <button class="ghost quick-search" data-query="Radiohead Weird Fishes">Radiohead</button>
              <button class="ghost quick-search" data-query="Kendrick Lamar Alright">Kendrick</button>
            </div>
            <div class="suggestions" id="suggestions"></div>
          </div>
        </div>

        <aside class="surface mini-player" aria-label="Compact player status">
          <div class="mini-top">
            <div class="cover small" id="miniCover">DM</div>
            <div class="mini-copy">
              <small>Now playing</small>
              <strong id="miniTitle">No track selected</strong>
              <div class="muted" id="miniArtist">Waiting for a search</div>
            </div>
          </div>
          <div class="mini-visual paused" id="miniVisualizer" aria-hidden="true">
            <span style="--level:42;--speed:1.05s"></span><span style="--level:66;--speed:1.24s"></span><span style="--level:38;--speed:0.96s"></span><span style="--level:78;--speed:1.42s"></span><span style="--level:54;--speed:1.15s"></span><span style="--level:86;--speed:1.58s"></span><span style="--level:48;--speed:1.08s"></span><span style="--level:70;--speed:1.36s"></span><span style="--level:44;--speed:0.98s"></span><span style="--level:90;--speed:1.62s"></span><span style="--level:58;--speed:1.18s"></span><span style="--level:74;--speed:1.44s"></span><span style="--level:36;--speed:1.02s"></span><span style="--level:68;--speed:1.3s"></span><span style="--level:50;--speed:1.11s"></span><span style="--level:82;--speed:1.54s"></span><span style="--level:46;--speed:1.04s"></span><span style="--level:62;--speed:1.25s"></span>
          </div>
          <div class="mini-meta">
            <div class="mini-stat"><span class="label">Mode</span><strong id="sideStatus">Ready</strong></div>
            <div class="mini-stat"><span class="label">Output</span><strong id="outputStatus">Browser</strong></div>
            <div class="mini-stat"><span class="label">Queue</span><strong id="queueCount">0 saved</strong></div>
            <div class="mini-stat"><span class="label">Match</span><strong id="miniConfidence">No match</strong></div>
          </div>
        </aside>
      </section>

      <section class="workspace">
        <div class="stack">
          <section class="surface card player-card" id="player">
            <div class="status-row">
              <span class="status-pill idle" id="statusPill">Ready</span>
              <span class="message-line" id="message">Type to search or choose a suggested track.</span>
            </div>

            <div class="player-main">
              <div class="cover-stage">
                <div class="cover large" id="trackCover">DM</div>
                <div class="muted" id="coverMeta">Cover art will prefer MusicBrainz / Cover Art Archive.</div>
              </div>

              <div>
                <span class="section-kicker">Current selection</span>
                <h2 class="track-title" id="trackTitle">Nothing playing yet</h2>
                <p class="track-meta" id="trackMeta">Search for a track, pick a ranked result, then play it immediately in the browser.</p>

                <div class="metadata-grid">
                  <div class="metadata-tile"><span class="label">Album</span><strong id="albumField">Unknown</strong></div>
                  <div class="metadata-tile"><span class="label">Release</span><strong id="releaseField">Unknown</strong></div>
                  <div class="metadata-tile"><span class="label">Source</span><strong id="sourceField">Waiting</strong></div>
                </div>

                <div class="visualizer paused" id="equalizer" aria-hidden="true">
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
                <div class="player-actions">
                  <button class="primary" id="playTop">Play selected song</button>
                  <button class="secondary" id="copyBtn">Copy query</button>
                  <button class="ghost" id="sendLocalBtn">Send to local player</button>
                </div>
              </div>
            </div>
          </section>

          <section class="surface card spotify-card" id="spotify">
            <div class="card-head">
              <div>
                <span class="section-kicker">Playlist import</span>
                <h2 class="section-title">Spotify playlist matching</h2>
                <p class="muted">Connect read-only, load playlists, and inspect MusicBrainz match quality before any persistence workflow exists.</p>
              </div>
              <div class="spotify-actions">
                <button class="secondary" id="spotifyConnectBtn">Connect Spotify</button>
                <button class="ghost" id="spotifyLoadBtn">Load playlists</button>
              </div>
            </div>
            <div class="notice" id="spotifyStatus">Spotify import is checking configuration...</div>
            <div class="playlist-list" id="spotifyPlaylists"></div>
            <div class="import-preview" id="spotifyPreview"></div>
          </section>
        </div>

        <aside class="side-panel">
          <section class="surface card" id="matches">
            <div class="card-head">
              <div>
                <span class="section-kicker">Ranked candidates</span>
                <h2 class="section-title">Song matches</h2>
              </div>
              <span class="badge" id="resultCount">0 matches</span>
            </div>
            <div class="results-list" id="results"></div>
          </section>

          <section class="surface card">
            <div class="card-head">
              <div>
                <span class="section-kicker">Session</span>
                <h2 class="section-title">Recent actions</h2>
              </div>
              <span class="badge" id="historyCount">0</span>
            </div>
            <div class="history-list" id="historyList">
              <div class="empty-state">Searches and playback selections will appear here during this session.</div>
            </div>
          </section>
        </aside>
      </section>

      <div class="footer">Suggestions come from MusicBrainz. Playback resolves the selected candidate to a browser stream while preserving the existing FastAPI/Vercel deployment model.</div>
    </main>
  </div>

  <script>
    const suggestions = document.getElementById('suggestions');
    const input = document.getElementById('searchInput');
    const results = document.getElementById('results');
    const resultCount = document.getElementById('resultCount');
    const trackTitle = document.getElementById('trackTitle');
    const trackMeta = document.getElementById('trackMeta');
    const trackCover = document.getElementById('trackCover');
    const miniCover = document.getElementById('miniCover');
    const miniTitle = document.getElementById('miniTitle');
    const miniArtist = document.getElementById('miniArtist');
    const coverMeta = document.getElementById('coverMeta');
    const statusPill = document.getElementById('statusPill');
    const sideStatus = document.getElementById('sideStatus');
    const outputStatus = document.getElementById('outputStatus');
    const queueCount = document.getElementById('queueCount');
    const miniConfidence = document.getElementById('miniConfidence');
    const message = document.getElementById('message');
    const runtimeStatus = document.getElementById('runtimeStatus');
    const albumField = document.getElementById('albumField');
    const releaseField = document.getElementById('releaseField');
    const sourceField = document.getElementById('sourceField');
    const playBtn = document.getElementById('playBtn');
    const toggleBtn = document.getElementById('toggleBtn');
    const playTop = document.getElementById('playTop');
    const copyBtn = document.getElementById('copyBtn');
    const sendLocalBtn = document.getElementById('sendLocalBtn');
    const progressFill = document.querySelector('.progress > div');
    const elapsedTime = document.getElementById('elapsedTime');
    const durationTime = document.getElementById('durationTime');
    const equalizer = document.getElementById('equalizer');
    const miniVisualizer = document.getElementById('miniVisualizer');
    const spotifyImport = document.getElementById('spotify');
    const spotifyConnectBtn = document.getElementById('spotifyConnectBtn');
    const spotifyLoadBtn = document.getElementById('spotifyLoadBtn');
    const spotifyStatus = document.getElementById('spotifyStatus');
    const spotifyPlaylists = document.getElementById('spotifyPlaylists');
    const spotifyPreview = document.getElementById('spotifyPreview');
    const historyList = document.getElementById('historyList');
    const historyCount = document.getElementById('historyCount');
    const themeSelect = document.getElementById('themeSelect');

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
      if (item.confidence >= 90) return 'title, artist, album alignment';
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

    const setStatus = (label, tone = 'idle') => {
      statusPill.textContent = label;
      statusPill.className = `status-pill ${tone === 'good' ? '' : tone}`;
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
        historyList.innerHTML = '<div class="empty-state">Searches and playback selections will appear here during this session.</div>';
        return;
      }
      historyList.innerHTML = '';
      sessionHistory.forEach((entry) => {
        const row = document.createElement('div');
        row.className = 'history-item';
        row.innerHTML = `
          ${coverMarkup(entry.item || { title: entry.title }, 'tiny')}
          <div>
            <strong>${escapeHtml(entry.title)}</strong>
            <small>${escapeHtml(entry.type)}${entry.meta ? ` · ${escapeHtml(entry.meta)}` : ''}</small>
          </div>
        `;
        historyList.appendChild(row);
      });
    };

    const setPlaybackBusy = (busy) => {
      isResolvingPlayback = busy;
      playBtn.disabled = busy;
      playTop.disabled = busy;
      toggleBtn.disabled = busy || !audio.src;
      if (busy) {
        playBtn.textContent = 'Resolving...';
        playTop.textContent = 'Resolving...';
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
      miniVisualizer.classList.toggle('playing', state === 'playing');
      miniVisualizer.classList.toggle('paused', state !== 'playing');
    };

    const setSpotifyStatus = (text, tone = '') => {
      spotifyStatus.textContent = text;
      spotifyStatus.className = `notice ${tone}`;
    };

    const matchTone = (confidence) => {
      if (confidence >= 80) return 'good';
      if (confidence > 0) return 'warn';
      return 'danger';
    };

    const errorDetail = async (response, fallback) => {
      const payload = await response.json().catch(() => ({}));
      return payload.detail || fallback;
    };

    const previewSkeleton = () => `
      <div class="loading-state skeleton">
        <div class="skeleton-line" style="width:70%"></div>
        <div class="skeleton-line" style="width:92%"></div>
        <div class="skeleton-line" style="width:58%"></div>
      </div>
    `;

    const renderSpotifyPreview = (payload) => {
      spotifyPreview.innerHTML = '';
      const summary = document.createElement('div');
      summary.className = 'preview-summary';
      summary.innerHTML = `
        <div class="preview-stat"><span class="label">Matched</span><strong>${payload.matched_count}</strong></div>
        <div class="preview-stat"><span class="label">Low confidence</span><strong>${payload.low_confidence_count}</strong></div>
        <div class="preview-stat"><span class="label">Unmatched</span><strong>${payload.unmatched_count}</strong></div>
      `;
      spotifyPreview.appendChild(summary);

      const note = document.createElement('div');
      note.className = 'notice';
      note.textContent = `${payload.playlist.name} preview mapped ${payload.tracks.length} tracks. Use low-confidence rows as review targets before building a saved import flow.`;
      spotifyPreview.appendChild(note);

      payload.tracks.forEach((item) => {
        const source = item.source;
        const match = item.musicbrainz;
        const row = document.createElement('div');
        row.className = 'import-track';
        row.innerHTML = `
          ${coverMarkup({ title: source.title, artist: source.artist_names?.[0], thumbnail: match.artwork_url || source.artwork_url, artwork_source: match.artwork_url ? 'cover_art_archive' : 'spotify', artwork_confidence: match.artwork_url ? 'match' : 'playlist' })}
          <div>
            <strong>${escapeHtml(source.title)}</strong>
            <small>${escapeHtml((source.artist_names || []).join(', '))} · ${escapeHtml(source.album || 'Unknown album')}<br />MusicBrainz: ${escapeHtml(match.title || 'No match')}${match.artist ? ` · ${escapeHtml(match.artist)}` : ''} · ${escapeHtml(reasonLabel(match))}</small>
          </div>
          <span class="confidence-pill ${matchTone(match.confidence)}">${match.confidence ? `${match.confidence}%` : 'unmatched'}</span>
        `;
        spotifyPreview.appendChild(row);
      });
    };

    const previewSpotifyPlaylist = async (playlist) => {
      setSpotifyStatus(`Mapping "${playlist.name}" to MusicBrainz...`, 'warn');
      spotifyPreview.innerHTML = previewSkeleton();
      const response = await fetch(`/api/import/spotify/playlists/${encodeURIComponent(playlist.id)}/preview?limit=25`);
      if (!response.ok) {
        throw new Error(await errorDetail(response, `Playlist import failed with ${response.status}`));
      }
      renderSpotifyPreview(await response.json());
      setSpotifyStatus('Preview ready. Review match quality below.', 'good');
    };

    const loadSpotifyPlaylists = async () => {
      setSpotifyStatus('Loading Spotify playlists...', 'warn');
      spotifyPlaylists.innerHTML = previewSkeleton();
      spotifyPreview.innerHTML = '';
      const response = await fetch('/api/import/spotify/playlists?limit=20');
      if (!response.ok) {
        throw new Error(await errorDetail(response, `Could not load Spotify playlists (${response.status})`));
      }
      const playlists = await response.json();
      spotifyPlaylists.innerHTML = '';
      if (!playlists.length) {
        setSpotifyStatus('No Spotify playlists found.', 'warn');
        return;
      }

      playlists.forEach((playlist) => {
        const row = document.createElement('div');
        row.className = 'playlist-row';
        row.innerHTML = `
          ${coverMarkup({ title: playlist.name, artist: playlist.owner, thumbnail: playlist.thumbnail, artwork_source: 'spotify', artwork_confidence: 'playlist' })}
          <div>
            <strong>${escapeHtml(playlist.name)}</strong>
            <small>${playlist.track_count} tracks${playlist.owner ? ` · ${escapeHtml(playlist.owner)}` : ''}</small>
          </div>
          <button class="ghost">Preview match</button>
        `;
        row.querySelector('button').addEventListener('click', async () => {
          try {
            await previewSpotifyPlaylist(playlist);
          } catch (error) {
            setSpotifyStatus(error.message || 'Playlist mapping failed.', 'danger');
          }
        });
        spotifyPlaylists.appendChild(row);
      });
      setSpotifyStatus('Choose a playlist to preview match quality.', 'good');
    };

    const applyTheme = (value) => {
      const theme = value || 'default';
      const gradientVar = `--gradient-${theme}`;
      document.documentElement.style.setProperty('--bg-gradient', `var(${gradientVar})`);
      document.documentElement.dataset.theme = theme;
    };

    const refreshSpotifyStatus = async () => {
      const response = await fetch('/api/import/spotify/status');
      if (!response.ok) {
        spotifyImport.hidden = true;
        return;
      }
      const status = await response.json();
      if (!status.configured) {
        spotifyImport.hidden = false;
        spotifyConnectBtn.disabled = true;
        spotifyLoadBtn.disabled = true;
        setSpotifyStatus('Spotify import needs SPOTIFY_CLIENT_ID configured in the deployment environment.', 'warn');
        return;
      }

      spotifyConnectBtn.disabled = false;
      spotifyLoadBtn.disabled = !status.connected;
      setSpotifyStatus(status.connected ? 'Spotify connected. Load playlists to inspect match quality.' : 'Connect Spotify to import playlists.', status.connected ? 'good' : '');
    };

    const connectSpotify = () => {
      const popup = window.open('/api/import/spotify/start', 'spotify-auth', 'width=520,height=720');
      if (!popup) {
        setSpotifyStatus('Popup was blocked. Allow popups and try again.', 'warn');
      }
    };

    const coverInitials = (item = {}) => {
      const source = item.artist || item.title || 'Dev Music';
      return source.split(/\\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'DM';
    };

    const coverLabel = (item = {}) => {
      if (item.artwork_source === 'cover_art_archive') return `MusicBrainz ${item.artwork_confidence || 'release'} art`;
      if (item.artwork_source === 'spotify') return 'Spotify playlist artwork';
      if (item.artwork_source === 'youtube') return 'YouTube video thumbnail fallback';
      return 'Generated cover fallback';
    };

    const escapeAttr = (value = '') => String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const escapeHtml = escapeAttr;

    const coverMarkup = (item = {}, size = 'small') => {
      const initials = coverInitials(item);
      if (!item.thumbnail) {
        return `<div class="cover ${size}" title="Generated cover fallback">${escapeHtml(initials)}</div>`;
      }
      return `
        <div class="cover ${size}" title="${escapeAttr(coverLabel(item))}">
          <img src="${escapeAttr(item.thumbnail)}" alt="${escapeAttr(item.title || 'Cover art')} cover" referrerpolicy="no-referrer" onerror="this.remove(); this.parentElement.textContent='${escapeAttr(initials)}'; this.parentElement.title='Generated cover fallback';" />
        </div>
      `;
    };

    const setCoverNode = (node, item = {}) => {
      node.innerHTML = '';
      node.title = coverLabel(item);
      if (!item.thumbnail) {
        node.textContent = coverInitials(item);
      } else {
        const img = document.createElement('img');
        img.src = item.thumbnail;
        img.alt = `${item.title || 'Track'} cover`;
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => {
          img.remove();
          node.textContent = coverInitials(item);
          node.title = 'Generated cover fallback';
          if (node === trackCover) coverMeta.textContent = 'Generated cover fallback.';
        });
        node.appendChild(img);
      }
    };

    const setCover = (item = {}) => {
      setCoverNode(trackCover, item);
      setCoverNode(miniCover, item);
      coverMeta.textContent = `${coverLabel(item)}.`;
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
        row.innerHTML = `
          ${coverMarkup(item)}
          <div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(albumMeta(item))} · ${fmtDuration(item.duration)}</small></div>
          <span class="confidence-pill ${matchTone(item.confidence)}">${confidenceLabel(item)}</span>
        `;
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

    const renderResults = (state = '') => {
      results.innerHTML = '';
      resultCount.textContent = `${currentResults.length} match${currentResults.length === 1 ? '' : 'es'}`;

      if (state === 'loading') {
        results.innerHTML = `
          <div class="loading-state skeleton">
            <div class="skeleton-line" style="width:76%"></div>
            <div class="skeleton-line" style="width:94%"></div>
            <div class="skeleton-line" style="width:60%"></div>
          </div>
          <div class="loading-state skeleton">
            <div class="skeleton-line" style="width:70%"></div>
            <div class="skeleton-line" style="width:88%"></div>
          </div>
        `;
        return;
      }

      if (!currentResults.length) {
        results.innerHTML = currentQuery
          ? '<div class="empty-state">No strong MusicBrainz matches yet. Try adding the artist, album, or version keyword.</div>'
          : '<div class="empty-state">Ranked matches will appear here. The first result is optimized for quick playback, while lower-ranked rows are useful for version checks.</div>';
        refreshPlayLabels();
        return;
      }

      currentResults.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'result' + (idx === activeIndex ? ' selected' : '');
        row.innerHTML = `
          ${coverMarkup(item)}
          <div class="result-info">
            <span class="rank">#${idx + 1} · ${escapeHtml(reasonLabel(item))}</span>
            <strong>${escapeHtml(item.title)}</strong>
            <small>${escapeHtml(albumMeta(item))} · ${fmtDuration(item.duration)}</small>
            <div class="meta-row">
              <span class="badge ${matchTone(item.confidence)}">${confidenceLabel(item)}</span>
              <span class="badge">${escapeHtml(item.source || 'MusicBrainz')}</span>
              ${item.artwork_source ? `<span class="badge">${escapeHtml(coverLabel(item))}</span>` : ''}
            </div>
          </div>
          <div class="result-actions">
            <button class="primary">Play</button>
            <button class="ghost" data-select="true">Select</button>
          </div>
        `;
        row.addEventListener('click', () => {
          activeIndex = idx;
          input.value = item.query || item.title;
          setTrack(item.title, `${albumMeta(item)} · ${confidenceLabel(item)}`, item);
          setCover(item);
          renderSuggestions();
          renderResults();
        });
        row.querySelector('.primary').addEventListener('click', (event) => {
          event.stopPropagation();
          primeAudioForUserGesture();
          activeIndex = idx;
          playQuery(item.query || item.title, item);
        });
        row.querySelector('[data-select="true"]').addEventListener('click', (event) => {
          event.stopPropagation();
          activeIndex = idx;
          input.value = item.query || item.title;
          setTrack(item.title, `${albumMeta(item)} · ${confidenceLabel(item)}`, item);
          setCover(item);
          renderSuggestions();
          renderResults();
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
      try {
        playPromise = audio.play();
      } catch (_error) {
        audioGesturePrimed = false;
        audio.muted = false;
        suppressAudioEvents = false;
        audioGesturePrimePromise = null;
        return;
      }
      audioGesturePrimePromise = Promise.resolve(playPromise)
        .catch(() => {
          audioGesturePrimed = false;
        })
        .finally(() => {
          if (audio.currentSrc === silentAudioDataUri) {
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
          }
          audio.muted = false;
          suppressAudioEvents = false;
          audioGesturePrimePromise = null;
          syncToggleLabel();
        });
    };

    const startPlayback = async (item) => {
      if (audioGesturePrimePromise) {
        await audioGesturePrimePromise.catch(() => {});
      }
      currentTrack = item;
      setStatus('Playing', 'good');
      setEqualizerState('playing');
      outputStatus.textContent = 'Browser';
      message.textContent = 'Loading audio...';
      setTrack(item.title, `${albumMeta(item)} · Duration ${fmtDuration(item.duration)} · ${confidenceLabel(item)}`, item);
      setCover(item);
      audio.src = item.stream_url;
      audio.currentTime = 0;
      await audio.play();
      message.textContent = 'Playing in the browser.';
      addHistory('Played', item, albumMeta(item));
      syncProgress();
      syncToggleLabel();
    };

    const search = async (query) => {
      currentQuery = query;
      if (!query || query.length < 2) {
        activeSearchController?.abort();
        searchRequestId += 1;
        currentResults = [];
        activeIndex = -1;
        renderSuggestions();
        renderResults();
        setPlaybackBusy(false);
        message.textContent = 'Type at least two characters to search.';
        return;
      }

      setStatus('Searching', 'warn');
      message.textContent = 'Finding ranked MusicBrainz candidates...';
      renderResults('loading');
      activeSearchController?.abort();
      const controller = new AbortController();
      activeSearchController = controller;
      const requestId = searchRequestId + 1;
      searchRequestId = requestId;
      const response = await fetch(`/api/autocomplete?query=${encodeURIComponent(query)}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Autocomplete failed with ${response.status}`);

      const results = await response.json();
      if (requestId !== searchRequestId) return;

      currentResults = results;
      activeIndex = currentResults.length ? 0 : -1;
      setStatus('Ready');
      renderSuggestions();
      renderResults();
      if (currentResults[0]) {
        setTrack(currentResults[0].title, `${albumMeta(currentResults[0])} · ${confidenceLabel(currentResults[0])}`, currentResults[0]);
        setCover(currentResults[0]);
        addHistory('Searched', currentResults[0], query);
      }
      message.textContent = currentResults.length ? 'Ranked matches ready. Review or play the first result.' : 'No good matches found.';
      if (activeSearchController === controller) {
        activeSearchController = null;
      }
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
        message.textContent = 'Resolving the selected stream...';
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
        setEqualizerState('paused');
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
      if (!response.ok) throw new Error(await errorDetail(response, `Local playback failed with ${response.status}`));
      const data = await response.json();
      setStatus('Local Output', 'warn');
      outputStatus.textContent = 'Local';
      message.textContent = `Sent to local player (PID ${data.pid}).`;
    };

    const applyRuntimeMode = async () => {
      try {
        const response = await fetch('/health');
        if (!response.ok) return;
        const health = await response.json();
        runtimeStatus.textContent = `${health.mode} · ${health.stream_delivery}`;
        if (health.local_integration === 'disabled-on-vercel') {
          sendLocalBtn.hidden = true;
          outputStatus.textContent = 'Browser';
        }
      } catch (_error) {
        runtimeStatus.textContent = 'Runtime unavailable';
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
          if (error.name === 'AbortError') return;
          setStatus('Error', 'warn');
          renderResults();
          message.textContent = error.message || 'Search failed.';
        }
      }, 520);
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

    document.querySelectorAll('.quick-search').forEach((button) => {
      button.addEventListener('click', async () => {
        input.value = button.dataset.query;
        await search(button.dataset.query);
      });
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

    spotifyConnectBtn.addEventListener('click', connectSpotify);
    spotifyLoadBtn.addEventListener('click', async () => {
      try {
        await loadSpotifyPlaylists();
      } catch (error) {
        setSpotifyStatus(error.message || 'Could not load Spotify playlists.', 'danger');
        spotifyPlaylists.innerHTML = '';
      }
    });

    window.addEventListener('message', async (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'spotify-connected') return;
      await refreshSpotifyStatus();
      try {
        await loadSpotifyPlaylists();
      } catch (error) {
        setSpotifyStatus(error.message || 'Could not load Spotify playlists.', 'danger');
      }
    });
    themeSelect.addEventListener('input', (event) => applyTheme(event.target.value));
    themeSelect.addEventListener('change', (event) => applyTheme(event.target.value));

    audio.addEventListener('timeupdate', syncProgress);
    audio.addEventListener('ended', () => {
      if (suppressAudioEvents) return;
      setStatus('Ready');
      message.textContent = 'Track finished.';
      progressFill.style.width = '100%';
      setEqualizerState('paused');
      syncToggleLabel();
    });
    audio.addEventListener('pause', () => {
      if (suppressAudioEvents) return;
      if (audio.currentTime > 0 && audio.currentTime < audio.duration) setStatus('Paused', 'warn');
      setEqualizerState('paused');
      syncToggleLabel();
    });
    audio.addEventListener('play', () => {
      if (suppressAudioEvents) return;
      setStatus('Playing', 'good');
      setEqualizerState('playing');
      syncToggleLabel();
    });
    audio.addEventListener('waiting', () => {
      if (suppressAudioEvents) return;
      setStatus('Buffering', 'warn');
      message.textContent = 'Buffering browser audio...';
    });
    audio.addEventListener('error', () => {
      if (suppressAudioEvents) return;
      setStatus('Playback failed', 'warn');
      setEqualizerState('paused');
      message.textContent = 'Browser playback failed. Try another ranked result.';
    });
    audio.addEventListener('loadedmetadata', syncProgress);

    document.addEventListener('click', (event) => {
      if (!suggestions.contains(event.target) && event.target !== input && !event.target.closest('.search-input-wrap')) {
        suggestions.classList.remove('visible');
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
    applyTheme(themeSelect.value);
    applyRuntimeMode();
    refreshSpotifyStatus();
  </script>
</body>
</html>
"""
