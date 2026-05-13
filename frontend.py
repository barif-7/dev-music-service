INDEX_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Phase · dev-music-service</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;1,9..144,400&family=JetBrains+Mono:wght@400;500;600&family=Inter+Tight:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  :root{
    --bg:#0b0c0e;
    --bg-elev:#121317;
    --bg-elev-2:#181a20;
    --border:#23252c;
    --border-strong:#2f323b;
    --ink:#eaeaea;
    --ink-dim:#a1a4ad;
    --ink-faint:#6b6e78;
    --accent:#d7ff3a;
    --accent-ink:#0b0c0e;
    --warn:#ffb454;
    --bad:#ff5a6a;
    --good:#6ee7a8;
    --radius:6px;
    --sans:"Inter Tight", system-ui, sans-serif;
    --mono:"JetBrains Mono", ui-monospace, monospace;
    --serif:"Fraunces", serif;
  }
  *{box-sizing:border-box}
  html,body{margin:0;background:#08080a;color:var(--ink);font-family:var(--sans);}
  body{
    min-height:100vh;
    background:
      radial-gradient(1200px 600px at 80% -10%, rgba(215,255,58,0.05) 0%, transparent 60%),
      radial-gradient(900px 500px at -10% 110%, rgba(110,231,168,0.04) 0%, transparent 60%),
      #08080a;
  }
  button,input{font:inherit;color:inherit}
  button{border:0;cursor:pointer;background:transparent}

  .topbar{
    display:flex;align-items:center;justify-content:space-between;
    padding:14px 24px;border-bottom:1px solid var(--border);
    position:sticky;top:0;z-index:30;
    background:rgba(11,12,14,.88);backdrop-filter:blur(14px);
  }
  .tl{display:flex;align-items:center;gap:22px}
  .brand{display:flex;align-items:center;gap:10px}
  .brand-mark{
    width:26px;height:26px;border-radius:6px;background:var(--accent);
    display:grid;place-items:center;color:var(--accent-ink);
    font-family:var(--mono);font-weight:600;font-size:13px;
  }
  .brand-name{font-family:var(--serif);font-weight:500;font-size:17px;letter-spacing:-.01em}
  .brand-tag{
    font-family:var(--mono);font-size:11px;color:var(--ink-faint);
    padding-left:12px;margin-left:4px;border-left:1px solid var(--border);
    text-transform:uppercase;letter-spacing:.08em;
  }
  .nav{display:flex;gap:22px}
  .nav a{color:var(--ink-dim);text-decoration:none;font-size:13.5px}
  .nav a.on{color:var(--ink)}
  .nav a:hover{color:var(--ink)}
  .tr{display:flex;align-items:center;gap:12px}
  .runtime{
    font-family:var(--mono);font-size:11px;color:var(--ink-faint);
    display:flex;align-items:center;gap:8px;padding:5px 10px;
    border:1px solid var(--border);border-radius:999px;background:var(--bg-elev);
  }
  .dot{width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 8px var(--accent)}
  .btn{
    font-family:var(--sans);font-weight:500;font-size:13px;
    padding:8px 12px;border-radius:var(--radius);
    border:1px solid var(--border-strong);color:var(--ink);
    display:inline-flex;gap:8px;align-items:center;transition:all .15s;
  }
  .btn:hover{background:var(--bg-elev)}
  .btn.primary{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
  .btn.primary:hover{background:#e1ff55}

  .stage{
    display:grid;grid-template-columns:1fr 340px;gap:18px;
    max-width:1520px;margin:18px auto 0;padding:0 24px;
  }
  @media (max-width:1100px){.stage{grid-template-columns:1fr}}

  .window{
    position:relative;border-radius:14px;overflow:hidden;
    border:1px solid var(--border);background:#000;
    box-shadow:0 30px 80px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.02);
    aspect-ratio:16/10;min-height:600px;
  }
  .chrome{
    position:absolute;inset:0 0 auto 0;height:38px;z-index:5;
    display:flex;align-items:center;gap:12px;padding:0 14px;
    background:linear-gradient(180deg, rgba(15,15,18,.85), rgba(15,15,18,.4) 70%, transparent);
    backdrop-filter:blur(14px) saturate(140%);
    border-bottom:1px solid rgba(255,255,255,.05);
  }
  .traffic{display:flex;gap:7px}
  .traffic i{width:11px;height:11px;border-radius:50%;display:block}
  .traffic i:nth-child(1){background:#ff5f57}
  .traffic i:nth-child(2){background:#febc2e}
  .traffic i:nth-child(3){background:#28c840}
  .chrome .title{
    font-family:var(--mono);font-size:11px;color:rgba(255,255,255,.55);
    letter-spacing:.06em;text-transform:uppercase;flex:1;text-align:center;
  }
  .chrome .title b{color:#fff;font-weight:500}
  .chrome .right{display:flex;gap:8px;font-family:var(--mono);font-size:10.5px;color:rgba(255,255,255,.55)}
  .chrome .right .k{padding:3px 7px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(0,0,0,.25)}

  canvas.main{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:crosshair}

  .searchBlock{
    position:absolute;left:18px;right:18px;top:52px;z-index:6;
    display:flex;justify-content:center;pointer-events:none;
  }
  .searchAnchor{position:relative;width:min(560px, 70%);pointer-events:auto}
  .searchBar{
    display:flex;align-items:center;gap:10px;padding:11px 14px;
    background:rgba(14,14,16,.6);backdrop-filter:blur(28px) saturate(180%);
    border:1px solid rgba(255,255,255,.07);border-radius:12px;
    box-shadow:0 20px 60px rgba(0,0,0,.4);
  }
  .searchBar .prompt{font-family:var(--mono);font-size:12px;color:var(--accent)}
  .searchBar input{flex:1;border:0;outline:0;background:transparent;color:#fff;font-size:14px}
  .searchBar input::placeholder{color:rgba(255,255,255,.45)}
  .searchBar .endpoint{font-family:var(--mono);font-size:10px;color:rgba(255,255,255,.4);letter-spacing:.06em}
  .searchBar .endpoint b{color:rgba(255,255,255,.7);font-weight:500}
  .suggestions{
    position:absolute;left:0;right:0;top:calc(100% + 8px);
    background:rgba(14,14,16,.85);backdrop-filter:blur(28px) saturate(180%);
    border:1px solid rgba(255,255,255,.08);border-radius:12px;
    box-shadow:0 30px 80px rgba(0,0,0,.5);
    overflow:hidden;max-height:360px;overflow-y:auto;
    opacity:0;transform:translateY(-4px);pointer-events:none;transition:all .18s ease;
  }
  .suggestions.open{opacity:1;transform:none;pointer-events:auto}
  .sugg{
    display:grid;grid-template-columns:40px 1fr auto;gap:12px;align-items:center;
    padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);
  }
  .sugg:hover,.sugg.active{background:rgba(255,255,255,.05)}
  .sugg-art{
    width:40px;height:40px;border-radius:6px;background:#1a1a1e;
    position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.05);
    display:grid;place-items:center;
  }
  .sugg-art img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .sugg-art .placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:rgba(255,255,255,.25);background:linear-gradient(135deg,#1a1a2e,#0f3460)}
  .sugg-art .src{
    position:absolute;bottom:2px;right:2px;
    font-family:var(--mono);font-size:8px;letter-spacing:.04em;
    padding:1px 3px;border-radius:3px;background:rgba(0,0,0,.6);color:#fff;
    text-transform:uppercase;line-height:1.2;
  }
  .sugg .name{font-size:13.5px;color:#fff;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sugg .meta{font-family:var(--mono);font-size:10px;color:rgba(255,255,255,.55);margin-top:2px;letter-spacing:.04em;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  .sugg .meta .sep{color:rgba(255,255,255,.2)}
  .sugg .meta .yr{color:rgba(255,255,255,.85)}
  .sugg .score{font-family:var(--mono);font-size:11px;color:rgba(255,255,255,.7);text-align:right;min-width:46px}
  .sugg .score .pct{font-weight:600;font-size:13px;color:#fff;display:block;line-height:1}
  .sugg .score.high .pct{color:var(--good)}
  .sugg .score.mid  .pct{color:var(--warn)}
  .sugg .score.low  .pct{color:var(--bad)}
  .sugg .score .lbl{font-size:9px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.1em;margin-top:2px;display:block}

  .heroArt{
    position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
    z-index:3;pointer-events:none;
    width:min(320px,38%);aspect-ratio:1/1;
    border-radius:16px;overflow:hidden;
    border:1px solid rgba(255,255,255,.08);
    box-shadow:0 30px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.03) inset;
  }
  .heroArt img{
    position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none;
  }
  .heroArt .ph{
    position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    font-size:88px;color:rgba(255,255,255,.35);
    background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);
    letter-spacing:.05em;
  }
  .heroArt.hasImg .ph{display:none}
  .heroArt.hasImg img{display:block}

  .lyricsBlock{
    position:absolute;left:50%;top:78%;transform:translate(-50%,-50%);
    z-index:4;text-align:center;pointer-events:none;width:min(720px,80%);
    text-shadow:0 2px 18px rgba(0,0,0,.7), 0 0 36px rgba(0,0,0,.4);
  }
  .lyricsBlock .row{
    font-family:var(--serif);font-weight:400;letter-spacing:-.01em;
    transition:opacity .35s, transform .35s, color .35s;
  }
  .lyricsBlock .prev{font-size:18px;color:rgba(255,255,255,.32);font-style:italic}
  .lyricsBlock .cur{font-size:38px;color:#fff;margin:8px 0;line-height:1.15}
  .lyricsBlock .next{font-size:16px;color:rgba(255,255,255,.42)}
  .lyricsBlock .meta{
    margin-top:14px;font-family:var(--mono);font-size:10px;
    color:rgba(255,255,255,.45);letter-spacing:.14em;text-transform:uppercase;
    display:inline-flex;gap:10px;align-items:center;
    padding:5px 11px;border:1px solid rgba(255,255,255,.1);border-radius:999px;
    background:rgba(0,0,0,.25);backdrop-filter:blur(8px);
  }
  .lyricsBlock .meta .live{width:5px;height:5px;border-radius:50%;background:var(--good);box-shadow:0 0 8px var(--good)}

  .eqOverlay{
    position:absolute;left:18px;right:18px;bottom:152px;z-index:5;height:56px;
    pointer-events:none;display:flex;align-items:flex-end;justify-content:space-between;
    gap:3px;mix-blend-mode:screen;opacity:.95;
  }
  .eqOverlay canvas{position:absolute;inset:0;width:100%;height:100%}
  .eqOverlay .eqLabel{
    position:absolute;left:0;top:-14px;
    font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;color:rgba(255,255,255,.55);
    text-transform:uppercase;display:flex;gap:8px;align-items:center;
    text-shadow:0 1px 4px rgba(0,0,0,.6);
  }
  .eqOverlay .eqLabel .dot{width:5px;height:5px;border-radius:50%;background:var(--accent);box-shadow:0 0 8px var(--accent)}

  .miniEq{
    position:absolute;right:3px;top:3px;display:flex;gap:1.5px;align-items:flex-end;
    width:18px;height:14px;padding:1px;border-radius:3px;
    background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.12);
  }
  .miniEq i{flex:1;background:var(--accent);border-radius:.5px;transform-origin:bottom;display:block;height:100%}

  .eqCard{position:relative}
  .eqCard canvas{display:block;width:100%;height:104px;border-radius:6px;background:#0a0a0c;border:1px solid var(--border)}
  .eqLegend{
    display:flex;justify-content:space-between;margin-top:8px;
    font-family:var(--mono);font-size:10px;color:var(--ink-faint);letter-spacing:.06em;
  }
  .eqLegend b{color:var(--ink);font-weight:600}
  .eqControls{display:flex;flex-direction:column;gap:8px;margin-top:10px}
  .eqRow{display:flex;align-items:center;gap:8px}
  .eqRow .lbl{
    font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;
    color:var(--ink-faint);text-transform:uppercase;width:40px;flex:none;
  }
  .eqChips{display:flex;gap:4px;flex-wrap:wrap;flex:1}
  .eqChip{
    font-family:var(--mono);font-size:10px;letter-spacing:.06em;
    padding:4px 8px;border-radius:4px;cursor:pointer;
    background:#0d0d10;border:1px solid var(--border);
    color:var(--ink-faint);text-transform:uppercase;
    transition:all .12s ease;user-select:none;
  }
  .eqChip:hover{color:var(--ink);border-color:#2a2a30}
  .eqChip.on{
    background:rgba(215,255,58,0.10);border-color:var(--accent);color:var(--accent);
    box-shadow:inset 0 0 0 1px rgba(215,255,58,0.25);
  }
  .eqChip .sw{
    display:inline-block;width:8px;height:8px;border-radius:50%;
    vertical-align:-1px;margin-right:5px;border:1px solid rgba(255,255,255,0.15);
  }

  .scrubArea{
    position:absolute;left:18px;right:18px;bottom:128px;z-index:5;height:18px;
    display:flex;align-items:center;gap:10px;
    font-family:var(--mono);font-size:10.5px;color:rgba(255,255,255,.65);
    text-shadow:0 1px 4px rgba(0,0,0,.6);
  }
  .scrubArea .bar{flex:1;height:3px;background:rgba(255,255,255,.14);border-radius:2px;position:relative;cursor:pointer}
  .scrubArea .bar .fill{position:absolute;left:0;top:0;bottom:0;background:#fff;width:0%;border-radius:2px}
  .scrubArea .bar .head{position:absolute;top:50%;width:9px;height:9px;border-radius:50%;background:#fff;transform:translate(-50%,-50%);left:0%}

  .nowPlaying{
    position:absolute;left:18px;right:18px;bottom:18px;z-index:6;
    display:grid;grid-template-columns:1fr auto 1fr;gap:18px;
    padding:14px 16px;border-radius:14px;color:#f4f4f0;
    background:rgba(14,14,16,.55);backdrop-filter:blur(28px) saturate(180%);
    border:1px solid rgba(255,255,255,.07);
    box-shadow:0 30px 80px rgba(0,0,0,.4), 0 1px 0 rgba(255,255,255,.05) inset;
  }
  .np-track{display:flex;gap:14px;align-items:center;min-width:0}
  .np-art{
    width:56px;height:56px;border-radius:10px;flex:none;position:relative;overflow:hidden;
    border:1px solid rgba(255,255,255,.08);background:#111;
  }
  .np-art img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none}
  #artPlaceholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.6rem;color:var(--fg-dim);background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);letter-spacing:.05em}
  .np-art .srcBadge{
    position:absolute;left:4px;bottom:4px;
    font-family:var(--mono);font-size:8.5px;letter-spacing:.06em;text-transform:uppercase;
    padding:1.5px 5px;border-radius:4px;background:rgba(0,0,0,.55);color:#fff;
    border:1px solid rgba(255,255,255,.12);
  }
  .np-meta{min-width:0}
  .np-meta .name{font-weight:600;font-size:15.5px;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--serif);font-weight:500}
  .np-meta .sub{font-family:var(--mono);font-size:11px;color:rgba(255,255,255,.6);letter-spacing:.04em;margin-top:4px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .np-meta .sub .sep{color:rgba(255,255,255,.18)}
  .np-meta .sub .alb{color:rgba(255,255,255,.85)}
  .np-meta .sub .yr{padding:1px 5px;border:1px solid rgba(255,255,255,.12);border-radius:4px;color:rgba(255,255,255,.85)}

  .np-controls{display:flex;align-items:center;gap:6px}
  .np-controls button{
    width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.12);
    background:rgba(255,255,255,.04);color:#fff;cursor:pointer;
    display:flex;align-items:center;justify-content:center;transition:transform .15s,background .15s;
  }
  .np-controls button:hover{background:rgba(255,255,255,.1)}
  .np-controls button:active{transform:scale(.94)}
  .np-controls .play{width:52px;height:52px;background:var(--accent);color:var(--accent-ink);border:none;box-shadow:0 6px 24px rgba(215,255,58,.25)}
  .np-controls .play:hover{background:#e1ff55}
  .np-controls svg{width:16px;height:16px}
  .np-controls .play svg{width:18px;height:18px}

  .np-right{display:flex;align-items:center;justify-content:flex-end;gap:12px}
  .bpmCard{
    display:flex;align-items:center;gap:10px;padding:7px 12px;border-radius:10px;
    background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.08);
  }
  .bpmCard .num{font-family:var(--mono);font-weight:600;font-size:22px;letter-spacing:-.02em;color:#fff;font-variant-numeric:tabular-nums;line-height:1;min-width:46px;text-align:right}
  .bpmCard .lbl{font-family:var(--mono);font-size:10px;letter-spacing:.12em;color:rgba(255,255,255,.55);text-transform:uppercase}
  .bpmCard .heart{width:10px;height:10px;border-radius:50%;background:var(--accent);box-shadow:0 0 14px var(--accent);transform-origin:center}

  .modeToggle{
    position:absolute;left:18px;top:52px;z-index:5;display:flex;gap:0;
    background:rgba(14,14,16,.6);backdrop-filter:blur(20px);
    border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:3px;
    font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;
    box-shadow:0 12px 30px rgba(0,0,0,.4);
  }
  .modeToggle button{
    padding:5px 10px;border-radius:5px;color:rgba(255,255,255,.55);text-transform:uppercase;
  }
  .modeToggle button.on{background:rgba(215,255,58,.18);color:var(--accent)}

  .endpointPill{
    position:absolute;right:18px;top:52px;z-index:5;
    font-family:var(--mono);font-size:10.5px;letter-spacing:.04em;
    padding:6px 10px;border-radius:8px;
    background:rgba(14,14,16,.6);backdrop-filter:blur(20px);
    border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.65);
    display:flex;align-items:center;gap:6px;
  }
  .endpointPill .verb{color:var(--accent);font-weight:600}

  .side{display:flex;flex-direction:column;gap:14px;min-width:0}
  .card{background:var(--bg-elev);border:1px solid var(--border);border-radius:12px;padding:14px}
  .card h4{
    margin:0 0 10px;font-family:var(--mono);font-size:10.5px;
    letter-spacing:.12em;text-transform:uppercase;color:var(--ink-faint);font-weight:500;
    display:flex;align-items:center;justify-content:space-between;
  }
  .card h4 .ix{color:var(--ink-faint)}
  .card h4 .ix.live{color:var(--good);display:inline-flex;gap:6px;align-items:center}
  .card h4 .ix.live::before{content:'';width:5px;height:5px;border-radius:50%;background:var(--good);box-shadow:0 0 8px var(--good)}

  .picker{display:flex;flex-direction:column;gap:6px}
  .wp{
    display:grid;grid-template-columns:78px 1fr auto;gap:12px;align-items:center;
    padding:6px;border-radius:8px;border:1px solid transparent;cursor:pointer;transition:all .15s;
  }
  .wp:hover{background:var(--bg-elev-2)}
  .wp.active{border-color:var(--accent);background:rgba(215,255,58,.04)}
  .wp .thumb{
    width:78px;height:48px;border-radius:6px;background:#000;position:relative;overflow:hidden;
    border:1px solid var(--border-strong);
  }
  .wp .thumb canvas{position:absolute;inset:0;width:100%;height:100%}
  .wp .info .name{font-size:13.5px;font-weight:500;letter-spacing:-.005em;font-family:var(--serif);font-weight:500}
  .wp .info .sub{font-family:var(--mono);font-size:10px;color:var(--ink-faint);letter-spacing:.05em;margin-top:2px;text-transform:uppercase}
  .wp .ix{font-family:var(--mono);font-size:10px;color:var(--ink-faint)}
  .wp.active .ix{color:var(--accent)}

  .lyricsCard .row{display:grid;grid-template-columns:54px 1fr;gap:10px;padding:5px 0;font-size:13px;color:var(--ink-dim);font-family:var(--sans)}
  .lyricsCard .row .ts{font-family:var(--mono);font-size:10.5px;color:var(--ink-faint);padding-top:2px;letter-spacing:.04em}
  .lyricsCard .row.is-cur{color:var(--ink)}
  .lyricsCard .row.is-cur .ts{color:var(--accent)}
  .lyricsCard .row.is-cur .ln{font-weight:500}
  #lyricsList{max-height:220px;overflow-y:auto;scrollbar-width:thin;pointer-events:none;user-select:none}
  #lyricsList::-webkit-scrollbar{width:4px}
  #lyricsList::-webkit-scrollbar-thumb{background:var(--border-strong);border-radius:2px}
  .lyricsCard .source{
    margin-top:10px;padding-top:10px;border-top:1px solid var(--border);
    font-family:var(--mono);font-size:10px;color:var(--ink-faint);
    display:flex;justify-content:space-between;letter-spacing:.06em;
  }

  .plRow{
    display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;
    padding:9px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;
    cursor:pointer;transition:all .15s;
  }
  .plRow:hover{border-color:var(--border-strong);background:var(--bg-elev-2)}
  .plRow .pl-name{font-size:13px;color:var(--ink);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .plRow .pl-sub{font-family:var(--mono);font-size:10px;color:var(--ink-faint);letter-spacing:.04em;margin-top:2px}
  .plRow .match{display:flex;gap:4px;font-family:var(--mono);font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;}
  .plRow .match span{padding:2px 5px;border-radius:3px;line-height:1.4}
  .plRow .match .ok{background:rgba(110,231,168,.12);color:var(--good)}
  .plRow .match .mid{background:rgba(255,180,84,.12);color:var(--warn)}
  .plRow .match .bad{background:rgba(255,90,106,.12);color:var(--bad)}

  .knobs{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .knob{
    background:var(--bg-elev-2);border:1px solid var(--border);border-radius:8px;padding:9px;
    display:flex;flex-direction:column;gap:5px;cursor:ns-resize;user-select:none;
  }
  .knob .lbl{font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;color:var(--ink-faint);text-transform:uppercase}
  .knob .val{font-family:var(--mono);font-size:16px;font-weight:600;letter-spacing:-.02em;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1}
  .knob .track{height:3px;border-radius:2px;background:#0a0a0c;overflow:hidden}
  .knob .track i{display:block;height:100%;background:var(--accent);width:50%}

  .bpmPresets{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px}
  .bpmPresets button{
    background:var(--bg-elev-2);border:1px solid var(--border);color:var(--ink-dim);
    font-family:var(--mono);font-size:10px;padding:7px 8px;border-radius:6px;
    text-align:left;letter-spacing:.04em;
  }
  .bpmPresets button:hover{border-color:var(--border-strong);color:var(--ink)}
  .bpmPresets button.on{border-color:var(--accent);color:var(--accent);background:rgba(215,255,58,.06)}
  .bpmPresets b{display:block;font-weight:600;color:inherit;font-size:11px;margin-bottom:2px}
  .bpmPresets span{display:block;color:var(--ink-faint);font-size:9px;letter-spacing:.08em;text-transform:uppercase}

  .endpoints .ep{
    display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;
    padding:6px 0;border-bottom:1px solid var(--border);
    font-family:var(--mono);font-size:11px;color:var(--ink-dim);
  }
  .endpoints .ep:last-child{border-bottom:0}
  .endpoints .ep .verb{color:var(--accent);font-weight:600;font-size:10px;text-transform:uppercase}
  .endpoints .ep .path{color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .endpoints .ep .lat{color:var(--ink-faint);font-size:10px}
  .endpoints .ep.warn .lat{color:var(--warn)}
  .endpoints .ep.bad  .lat{color:var(--bad)}

  .below{
    max-width:1520px;margin:18px auto 50px;padding:0 24px;
    display:grid;grid-template-columns:repeat(4,1fr);gap:18px;
  }
  .blip{border:1px solid var(--border);border-radius:12px;padding:14px;background:linear-gradient(180deg,#111114,#0c0c0e)}
  .blip .k{font-family:var(--mono);font-size:10px;letter-spacing:.12em;color:var(--ink-faint);text-transform:uppercase}
  .blip .v{font-family:var(--serif);font-weight:400;font-size:30px;letter-spacing:-.01em;color:var(--ink);margin-top:6px;line-height:1}
  .blip .v em{font-style:italic;color:var(--accent)}
  .blip .d{font-size:12px;color:var(--ink-dim);margin-top:8px;line-height:1.5}

  @media (max-width:880px){
    .below{grid-template-columns:repeat(2,1fr)}
    .nowPlaying{grid-template-columns:1fr;gap:12px}
    .np-right{justify-content:flex-start}
    .searchAnchor{width:100%}
  }

  /* ── MCP Pill + Drawer ── */
  .mcpPill{
    font-family:var(--mono);font-size:11px;color:var(--ink-dim);
    display:inline-flex;align-items:center;gap:8px;padding:5px 10px 5px 9px;
    border:1px solid var(--border);border-radius:4px;background:var(--bg-elev);
    cursor:pointer;transition:all .15s;letter-spacing:.04em;
  }
  .mcpPill:hover{border-color:var(--border-strong);color:var(--ink)}
  .mcpPill .lbl{text-transform:uppercase;letter-spacing:.12em;font-size:10px;color:var(--ink-faint)}
  .mcpPill .stat{color:var(--ink);font-variant-numeric:tabular-nums}
  .mcpPill .chev{opacity:.5}
  .mcpDot{
    position:relative;width:7px;height:7px;border-radius:50%;
    background:var(--ink-faint);transition:background .3s, box-shadow .3s;flex-shrink:0;
  }
  .mcpDot::after{
    content:'';position:absolute;inset:-3px;border-radius:50%;
    border:1px solid currentColor;opacity:0;
  }
  .mcpDot.running{background:var(--good);box-shadow:0 0 10px var(--good);color:var(--good)}
  .mcpDot.running::after{animation:mcpPulse 1.8s ease-out infinite}
  .mcpDot.starting{background:var(--warn);box-shadow:0 0 10px var(--warn);color:var(--warn)}
  .mcpDot.starting::after{animation:mcpPulse 1s ease-out infinite}
  .mcpDot.stopped{background:#5a5d66;box-shadow:none;color:#5a5d66}
  @keyframes mcpPulse{
    0%{opacity:.6;transform:scale(.6)}
    100%{opacity:0;transform:scale(2.2)}
  }
  .mcpScrim{
    position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.42);
    backdrop-filter:blur(2px);opacity:0;pointer-events:none;
    transition:opacity .25s ease;
  }
  .mcpScrim.open{opacity:1;pointer-events:auto}
  .mcpDrawer{
    position:fixed;top:0;right:0;bottom:0;width:var(--mcp-w,360px);z-index:90;
    background:var(--bg-elev);border-left:1px solid var(--border-strong);
    display:flex;flex-direction:column;transform:translateX(110%);
    transition:transform .35s cubic-bezier(.5,.1,.2,1);
    box-shadow:-30px 0 80px rgba(0,0,0,.5);
  }
  .mcpDrawer.open{transform:translateX(0)}
  .mcpHead{
    display:flex;align-items:flex-start;justify-content:space-between;
    padding:18px 18px 14px;border-bottom:1px solid var(--border);
  }
  .mcpHead .crumb{
    font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;
    color:var(--ink-faint);text-transform:uppercase;
  }
  .mcpHead h2{
    margin:6px 0 0;font-family:var(--serif);font-weight:400;
    font-size:22px;letter-spacing:-.01em;color:var(--ink);
  }
  .mcpClose{
    width:26px;height:26px;border-radius:4px;border:1px solid var(--border);
    background:transparent;color:var(--ink-dim);cursor:pointer;
    display:grid;place-items:center;font-family:var(--mono);font-size:14px;
  }
  .mcpClose:hover{background:var(--bg-elev-2);color:var(--ink)}
  .mcpBody{flex:1;overflow-y:auto;padding:0}
  .mcpBody::-webkit-scrollbar{width:6px}
  .mcpBody::-webkit-scrollbar-thumb{background:var(--border-strong);border-radius:3px}
  .mcpSection{padding:16px 18px;border-bottom:1px solid var(--border)}
  .mcpSection:last-child{border-bottom:0}
  .mcpSection .h{
    font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;
    text-transform:uppercase;color:var(--ink-faint);margin-bottom:10px;
    display:flex;justify-content:space-between;align-items:center;
  }
  .mcpStatus{display:flex;align-items:center;gap:12px}
  .mcpStatus .big{
    width:32px;height:32px;display:grid;place-items:center;flex:none;
    border-radius:4px;background:var(--bg-elev-2);border:1px solid var(--border);
  }
  .mcpStatus .big .mcpDot{width:10px;height:10px}
  .mcpStatus .lbl{
    font-family:var(--serif);font-size:19px;letter-spacing:-.01em;color:var(--ink);
    line-height:1.1;
  }
  .mcpStatus.starting .lbl{color:var(--warn)}
  .mcpStatus.running .lbl{color:var(--good)}
  .mcpStatus.stopped .lbl{color:var(--ink-dim)}
  .mcpStatus .meta{
    margin-top:5px;font-family:var(--mono);font-size:10.5px;
    color:var(--ink-faint);letter-spacing:.04em;display:flex;gap:10px;
  }
  .mcpStatus .meta b{color:var(--ink-dim);font-weight:500}
  .mcpStatus .meta .sep{color:var(--border-strong)}
  .mcpCtrls{display:flex;gap:8px;margin-top:14px}
  .mcpBtn{
    flex:1;font-family:var(--sans);font-weight:500;font-size:12.5px;
    padding:8px 12px;border-radius:4px;cursor:pointer;
    border:1px solid var(--border-strong);background:transparent;color:var(--ink);
    transition:all .15s;display:inline-flex;align-items:center;justify-content:center;gap:6px;
  }
  .mcpBtn:hover:not(:disabled){background:var(--bg-elev-2)}
  .mcpBtn:disabled{opacity:.35;cursor:not-allowed}
  .mcpBtn.start{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
  .mcpBtn.start:hover:not(:disabled){background:#e1ff55}
  .mcpBtn.stop{border-color:var(--bad);color:var(--bad)}
  .mcpBtn.stop:hover:not(:disabled){background:rgba(255,90,106,.08)}
  .mcpKv{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-family:var(--mono);font-size:11px}
  .mcpKv dt{color:var(--ink-faint);letter-spacing:.06em;text-transform:uppercase;font-size:9.5px;padding-top:2px}
  .mcpKv dd{margin:0;color:var(--ink);word-break:break-all;letter-spacing:.02em}
  .mcpKv dd .tag{display:inline-block;padding:1px 5px;border-radius:3px;background:var(--bg-elev-2);border:1px solid var(--border);font-size:10px;color:var(--ink-dim)}
  .mcpTools{display:flex;flex-direction:column;gap:1px}
  .mcpTool{
    padding:9px 0;display:grid;grid-template-columns:1fr auto;gap:4px 10px;
    border-bottom:1px solid var(--border);align-items:start;
  }
  .mcpTool:last-child{border-bottom:0}
  .mcpTool .name{font-family:var(--mono);font-size:12px;color:var(--ink);font-weight:500;letter-spacing:.01em}
  .mcpTool .desc{font-size:11.5px;color:var(--ink-dim);grid-column:1;line-height:1.45}
  .mcpTool .arity{
    font-family:var(--mono);font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;
    padding:2px 6px;border-radius:3px;background:var(--bg-elev-2);border:1px solid var(--border);
    color:var(--ink-faint);white-space:nowrap;align-self:start;
  }
  .mcpTool .arity.has{color:var(--accent);border-color:rgba(215,255,58,.3);background:rgba(215,255,58,.06)}
  .mcpToolsEmpty{font-family:var(--mono);font-size:11px;color:var(--ink-faint);padding:14px 0;text-align:center;border:1px dashed var(--border);border-radius:4px}
  .mcpLog{display:flex;flex-direction:column;background:#0a0b0d;border:1px solid var(--border);border-radius:4px;padding:6px 8px}
  .mcpLogRow{
    display:grid;grid-template-columns:62px 1fr auto;gap:8px;align-items:center;
    padding:3px 0;font-family:var(--mono);font-size:10.5px;
  }
  .mcpLogRow .ts{color:var(--ink-faint);letter-spacing:.02em}
  .mcpLogRow .nm{color:var(--ink-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .mcpLogRow .bd{font-size:9px;padding:1px 5px;border-radius:3px;letter-spacing:.08em;text-transform:uppercase}
  .mcpLogRow .bd.ok{color:var(--good);border:1px solid rgba(110,231,168,.3);background:rgba(110,231,168,.06)}
  .mcpLogRow .bd.err{color:var(--bad);border:1px solid rgba(255,90,106,.3);background:rgba(255,90,106,.06)}
  .mcpCallout{
    display:flex;gap:10px;align-items:flex-start;
    padding:10px 12px;border-radius:4px;
    background:rgba(255,180,84,.06);border:1px solid rgba(255,180,84,.3);
  }
  .mcpCallout .ic{color:var(--warn);font-family:var(--mono);flex:none;line-height:1.2;font-size:14px}
  .mcpCallout .tx{font-size:11.5px;color:var(--ink);line-height:1.5;flex:1}
  .mcpCallout .tx b{color:var(--warn);font-weight:600}
  .mcpCallout button{
    background:transparent;border:0;color:var(--warn);opacity:.6;
    cursor:pointer;font-family:var(--mono);font-size:13px;line-height:1;padding:0 2px;
  }
  .mcpCallout button:hover{opacity:1}
  .mcpDrawer[data-trans="1"] .mcpBtn{opacity:.35;pointer-events:none}
</style>
</head>
<body>

<header class="topbar">
  <div class="tl">
    <div class="brand">
      <div class="brand-mark">P</div>
      <div class="brand-name">Phase</div>
      <div class="brand-tag">dev-music-service · v0.4 · browser-first</div>
    </div>
    <nav class="nav">
      <a href="#" class="on">Focus</a>
      <a href="/docs">API</a>
      <a href="/api/import/spotify/start">Spotify</a>
    </nav>
  </div>
  <div class="tr">
    <div class="runtime" id="runtimePill"><i class="dot"></i><span id="runtimeText">GET&nbsp;/health · checking…</span></div>
    <button class="mcpPill" id="mcpOpen" aria-haspopup="dialog">
      <span class="mcpDot stopped" id="mcpPillDot"></span>
      <span class="lbl">MCP</span>
      <span class="stat" id="mcpPillStat">stopped</span>
      <svg class="chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 6l6 6-6 6"/></svg>
    </button>
  </div>
</header>

<div class="stage">
  <div class="window" id="window">
    <div class="chrome">
      <div class="traffic"><i></i><i></i><i></i></div>
      <div class="title">phase · <b id="trackTitleChrome">—</b> · LRCLIB synced</div>
      <div class="right"><span class="k">⌘ K</span><span class="k">Focus</span></div>
    </div>

    <canvas class="main" id="mainCanvas"></canvas>

    <div class="modeToggle" title="Playback delivery">
      <button class="on" data-mode="browser">Browser stream</button>
      <button data-mode="openclaw">OpenClaw local</button>
    </div>

    <div class="endpointPill"><span class="verb">GET</span><span id="endpointPath"> /api/stream · </span><b id="endStatus">ready</b></div>

    <div class="searchBlock">
      <div class="searchAnchor">
        <div class="searchBar">
          <span class="prompt">&gt;</span>
          <input id="searchInput" type="text" placeholder="search a track — MusicBrainz first, then YouTube…" autocomplete="off" />
          <span class="endpoint">GET <b>/api/autocomplete</b></span>
        </div>
        <div class="suggestions" id="suggestions"></div>
      </div>
    </div>

    <div class="heroArt" id="heroArt">
      <img id="heroArtImg" alt="">
      <div class="ph">♪</div>
    </div>

    <div class="lyricsBlock" id="lyricsBlock">
      <div class="row prev" id="lyrPrev"></div>
      <div class="row cur"  id="lyrCur"></div>
      <div class="row next" id="lyrNext"></div>
      <div class="meta"><span class="live"></span><span id="lyrProvider">LRCLIB · synced · </span><span id="lyrTs">—</span></div>
    </div>

    <div class="eqOverlay">
      <div class="eqLabel"><span class="dot"></span>FFT · 32 bands · post-stream</div>
      <canvas id="eqCanvas"></canvas>
    </div>

    <div class="scrubArea">
      <span id="elapsed">00:00</span>
      <div class="bar" id="scrubBar"><div class="fill" id="scrubFill"></div><div class="head" id="scrubHead"></div></div>
      <span id="duration">00:00</span>
    </div>

    <div class="nowPlaying">
      <div class="np-track">
        <div class="np-art">
          <div id="artPlaceholder">♪</div>
          <img id="artImg" alt="cover art">
          <div class="miniEq" id="miniEq"><i></i><i></i><i></i><i></i></div>
          <div class="srcBadge" id="artSrc">—</div>
        </div>
        <div class="np-meta">
          <div class="name" id="trackTitle">—</div>
          <div class="sub">
            <span id="artistName">—</span>
            <span class="sep">·</span>
            <span class="alb" id="albumName">—</span>
            <span class="yr" id="releaseYear">—</span>
          </div>
        </div>
      </div>
      <div class="np-controls">
        <button title="Previous" id="prevBtn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zm12 0L9 12l9 7z"/></svg></button>
        <button class="play" title="Play / pause" id="playBtn"><svg id="playIcon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>
        <button title="Next" id="nextBtn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM6 5l9 7-9 7z"/></svg></button>
      </div>
      <div class="np-right">
        <div class="bpmCard">
          <div class="heart" id="bpmHeart"></div>
          <div class="num" id="bpmNum">72</div>
          <div class="lbl">BPM<br/><span style="color:rgba(255,255,255,.35);font-size:8.5px" id="bpmBand">FLOW</span></div>
        </div>
      </div>
    </div>
  </div>

  <aside class="side">
    <div class="card">
      <h4>Wallpapers <span class="ix" id="wpIx">1 / 5</span></h4>
      <div class="picker" id="picker"></div>
    </div>

    <div class="card lyricsCard">
      <h4>Synced lyrics <span class="ix live">LRCLIB</span></h4>
      <div id="lyricsList"></div>
      <div class="source">
        <span>provider · lrclib</span>
        <span id="lyrSync">— no track —</span>
      </div>
    </div>

    <div class="card eqCard">
      <h4>Spectrum <span class="ix" id="eqMode">bars · 32 · lime</span></h4>
      <canvas id="eqSideCanvas"></canvas>
      <div class="eqLegend">
        <span>20 Hz</span><span><b id="eqPeak">−∞</b> dB peak</span><span>20 kHz</span>
      </div>
      <div class="eqControls" id="eqControls">
        <div class="eqRow">
          <span class="lbl">View</span>
          <div class="eqChips" data-key="style">
            <span class="eqChip on" data-v="bars">Bars</span>
            <span class="eqChip" data-v="mirror">Mirror</span>
            <span class="eqChip" data-v="wave">Wave</span>
            <span class="eqChip" data-v="dots">Dots</span>
            <span class="eqChip" data-v="ribbon">Ribbon</span>
          </div>
        </div>
        <div class="eqRow">
          <span class="lbl">Bands</span>
          <div class="eqChips" data-key="bands">
            <span class="eqChip" data-v="16">16</span>
            <span class="eqChip on" data-v="32">32</span>
            <span class="eqChip" data-v="64">64</span>
            <span class="eqChip" data-v="96">96</span>
          </div>
        </div>
        <div class="eqRow">
          <span class="lbl">Color</span>
          <div class="eqChips" data-key="palette">
            <span class="eqChip on" data-v="lime"><span class="sw" style="background:#d7ff3a"></span>Lime</span>
            <span class="eqChip" data-v="ice"><span class="sw" style="background:#7ad9ff"></span>Ice</span>
            <span class="eqChip" data-v="magma"><span class="sw" style="background:#ff6a3d"></span>Magma</span>
            <span class="eqChip" data-v="mono"><span class="sw" style="background:#f4f4f5"></span>Mono</span>
          </div>
        </div>
        <div class="eqRow">
          <span class="lbl">Scale</span>
          <div class="eqChips" data-key="scale">
            <span class="eqChip on" data-v="linear">Linear</span>
            <span class="eqChip" data-v="log">Log</span>
          </div>
          <div class="eqChips" data-key="peaks" style="flex:none">
            <span class="eqChip on" data-v="on">Peaks</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h4>Fidget <span class="ix">drag vertically</span></h4>
      <div class="knobs">
        <div class="knob" data-k="intensity"><span class="lbl">Intensity</span><span class="val" id="kIntensity">0.65</span><div class="track"><i id="tIntensity"></i></div></div>
        <div class="knob" data-k="warp"><span class="lbl">Warp</span><span class="val" id="kWarp">0.40</span><div class="track"><i id="tWarp"></i></div></div>
        <div class="knob" data-k="hue"><span class="lbl">Hue shift</span><span class="val" id="kHue">+0°</span><div class="track"><i id="tHue"></i></div></div>
        <div class="knob" data-k="grain"><span class="lbl">Grain</span><span class="val" id="kGrain">0.18</span><div class="track"><i id="tGrain"></i></div></div>
      </div>
    </div>

    <div class="card">
      <h4>BPM target <span class="ix" id="bpmDescIx">flow state</span></h4>
      <div class="bpmPresets" id="bpmPresets"></div>
    </div>

    <div class="card endpoints">
      <h4>Runtime · <span class="ix" id="healthIx">/health · checking</span></h4>
      <div class="ep"><span class="verb">GET</span><span class="path">/api/autocomplete</span><span class="lat" id="latAc">—</span></div>
      <div class="ep"><span class="verb">GET</span><span class="path">/api/search</span><span class="lat" id="latSr">—</span></div>
      <div class="ep"><span class="verb">GET</span><span class="path">/api/stream</span><span class="lat" id="latSt">—</span></div>
      <div class="ep"><span class="verb">GET</span><span class="path">/api/lyrics</span><span class="lat" id="latLy">—</span></div>
      <div class="ep warn"><span class="verb">GET</span><span class="path">/api/integrations/openclaw/play</span><span class="lat">local-only</span></div>
    </div>
  </aside>
</div>

<div class="below">
  <div class="blip"><div class="k">Resonance window</div><div class="v"><em>62–84</em></div><div class="d">BPM band most cited for sustained attention. Wallpapers tune softer; LRCLIB ticker eases line transitions.</div></div>
  <div class="blip"><div class="k">Artwork cascade</div><div class="v">MB → YT → ✷</div><div class="d">Cover Art Archive first, then YouTube thumb, then generated placeholder — each track keeps an <code style="font-family:var(--mono);font-size:11px;color:var(--ink-dim)">artwork_source</code> badge.</div></div>
  <div class="blip"><div class="k">Pulse latency</div><div class="v">&lt; <em>4ms</em></div><div class="d">Beat callback drives shader uniforms in the same frame; LRCLIB <code style="font-family:var(--mono);font-size:11px;color:var(--ink-dim)">start_time_ms</code> drives the lyric cross-fade.</div></div>
  <div class="blip"><div class="k">Modes</div><div class="v"><em>Browser</em> · OpenClaw</div><div class="d">Browser-first proxy stream is default. Local <code style="font-family:var(--mono);font-size:11px;color:var(--ink-dim)">/api/integrations/openclaw</code> handles ffplay sessions.</div></div>
</div>

<audio id="audioEl" preload="none"></audio>

<div class="mcpScrim" id="mcpScrim"></div>
<aside class="mcpDrawer" id="mcpDrawer"></aside>

<script id="shader-vert" type="x-shader/x-vertex">
attribute vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
</script>

<script id="shader-common" type="x-shader/x-fragment">
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec2 iMouse;
uniform vec2 iDrag;
uniform float iClick;
uniform float iPulse;
uniform float iBass;
uniform float iTreble;
uniform float iEnergy;
uniform float iIntensity;
uniform float iWarp;
uniform float iHue;
uniform float iGrain;
uniform float iPlaying;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
  vec2 u=f*f*(3.0-2.0*f);
  return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;
}
float fbm(vec2 p){
  float v=0., a=0.5;
  for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.02; a*=0.5; }
  return v;
}
vec3 hueShift(vec3 c, float h){
  const mat3 toYIQ = mat3(0.299,0.587,0.114, 0.596,-0.274,-0.322, 0.211,-0.523,0.312);
  const mat3 toRGB = mat3(1.0,0.956,0.621, 1.0,-0.272,-0.647, 1.0,-1.107,1.704);
  vec3 yiq = toYIQ * c;
  float cos_h=cos(h), sin_h=sin(h);
  yiq.yz = mat2(cos_h,-sin_h,sin_h,cos_h) * yiq.yz;
  return toRGB * yiq;
}
float grain(vec2 uv, float t){ return (hash(uv*1234.0 + t) - 0.5); }
</script>

<script id="frag-pulse" type="x-shader/x-fragment">
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*iResolution)/min(iResolution.x,iResolution.y);
  vec2 m  = (iMouse - 0.5) * vec2(iResolution.x/iResolution.y, 1.0);
  vec2 d = uv - m; float r = length(d);
  float warp = 0.12 + 0.5*iWarp;
  uv -= d * warp * exp(-r*2.4);
  float rr = length(uv);
  /* rings — modest brightening with energy */
  float rings = 0.0;
  for(int i=0;i<4;i++){
    float age = iPulse - float(i)*0.14;
    if(age>0.0){
      float ring = exp(-pow((rr - age*0.95)*9.0, 2.0));
      rings += ring * (1.0 - age) * (0.7 + 0.25*iEnergy);
    }
  }
  float clickR = exp(-pow((length(uv-m) - (1.0-iClick)*0.9)*8.0, 2.0)) * iClick;
  float a = atan(uv.y, uv.x);
  /* energy slightly accelerates time */
  float tmod = iTime * (0.25 + 0.20*iEnergy);
  float wob = fbm(vec2(rr*3.0 - tmod, a*0.7 + tmod*0.4));
  /* bass gently expands the orb */
  float body = smoothstep(1.0, 0.05, rr - 0.16*wob - 0.10*iBass);
  /* treble shimmer in outer halo (subtle) */
  float shimmer = noise(vec2(uv.x*9.0 + iTime*2.0, uv.y*9.0 - iTime*1.5)) * exp(-rr*2.2);
  vec3 c1 = vec3(0.05, 0.06, 0.12);
  vec3 c2 = vec3(0.18, 0.08, 0.22);
  vec3 c3 = vec3(1.0, 0.65, 0.42);
  vec3 c4 = vec3(1.0, 0.88, 0.65);
  vec3 col = mix(c1, c2, body);
  col = mix(col, c3, rings * iIntensity);
  col = mix(col, c4, clickR*0.8);
  /* bass-driven center glow */
  col += c3 * (0.18 + 0.15*iBass) * exp(-rr*1.8) * (0.5 + 0.3*iEnergy);
  /* treble shimmer */
  col += c4 * shimmer * iTreble * 0.45;
  col += iGrain * 0.06 * grain(gl_FragCoord.xy, iTime);
  col = hueShift(col, iHue);
  col *= mix(0.82, 1.0, iPlaying);
  gl_FragColor = vec4(col, 1.0);
}
</script>

<script id="frag-tide" type="x-shader/x-fragment">
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p  = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  float mx = (iMouse.x-0.5);
  float my = (iMouse.y-0.5);
  /* energy slightly accelerates waves */
  float t = iTime*0.18 + iEnergy*0.35;
  vec3 col = vec3(0.02, 0.04, 0.06);
  for(int i=0;i<5;i++){
    float fi = float(i);
    float yOff = -0.6 + fi*0.30 + my*0.6*(fi-2.0)*0.18;
    float speed = 0.25 + fi*0.07;
    /* bass gently swells wave amplitude — capped well below band spacing */
    float amp = 0.18 + 0.05*iBass;
    float wave = sin(p.x*1.4 + t*speed + fi*1.7) * amp
               + sin(p.x*3.0 - t*speed*1.3 + fi*0.6) * 0.06
               + fbm(vec2(p.x*1.2 + t*0.3, fi)) * 0.18;
    float split = (1.0 + 0.6*iWarp) * (1.0 - exp(-pow((p.x - mx*1.4)*1.0, 2.0)));
    wave += (p.y>yOff?1.0:-1.0) * (1.0 - split) * 0.25 * iWarp;
    float d = abs(p.y - (yOff + wave));
    /* keep band width near original; subtle treble sharpening only */
    float bandW = max(0.08, 0.16 - 0.03*iEnergy - 0.02*iTreble);
    float band = smoothstep(bandW, 0.0, d);
    vec3 hue = mix(vec3(0.05,0.45,0.55), vec3(0.55,0.95,0.85), fi/4.0);
    hue = mix(hue, vec3(0.95,0.85,0.55), iBass*0.35);
    col += hue * band * (0.35 + 0.65*iIntensity) * (0.7 + 0.4*iPulse);
    /* treble glint on wave crests (subtle) */
    col += vec3(0.9,1.0,0.95) * exp(-d*d*400.0) * iTreble * 0.30;
  }
  vec2 mp = vec2(iMouse.x-0.5, iMouse.y-0.5);
  mp.x *= iResolution.x/iResolution.y;
  float cr = length(p-mp);
  col += vec3(0.6,0.95,0.85) * exp(-cr*4.0) * iClick * 0.9;
  float v = smoothstep(1.1, 0.2, abs(p.y));
  col *= 0.7 + 0.3*v;
  col += iGrain * 0.05 * grain(gl_FragCoord.xy, iTime);
  col = hueShift(col, iHue);
  col *= mix(0.82, 1.0, iPlaying);
  gl_FragColor = vec4(col, 1.0);
}
</script>

<script id="frag-cells" type="x-shader/x-fragment">
vec2 cellPoint(vec2 ip){ return vec2(hash(ip+1.3), hash(ip+5.7)); }
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p  = uv * vec2(iResolution.x/iResolution.y, 1.0);
  p *= 7.0 + iWarp*4.0;
  vec2 mp = vec2(iMouse.x*iResolution.x/iResolution.y, iMouse.y) * (7.0 + iWarp*4.0);
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float minD = 10.0;
  vec2 minCell = vec2(0.0);
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 off = vec2(float(x),float(y));
    vec2 cc = ip + off;
    vec2 cp = cellPoint(cc);
    cp += 0.25*vec2(sin(iTime*0.3 + cc.x*1.7), cos(iTime*0.4 + cc.y*2.1));
    vec2 toM = (mp - (cc+cp));
    cp += toM * 0.05 * iWarp;
    float d = length(off + cp - fp);
    if(d<minD){ minD = d; minCell = cc; }
  }
  float beatHash = hash(minCell + floor(iTime*2.0));
  float beat = smoothstep(0.65, 1.0, beatHash) * iPulse;
  float secD = 10.0;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 off = vec2(float(x),float(y));
    vec2 cc = ip + off;
    vec2 cp = cellPoint(cc);
    cp += 0.25*vec2(sin(iTime*0.3 + cc.x*1.7), cos(iTime*0.4 + cc.y*2.1));
    vec2 toM = (mp - (cc+cp));
    cp += toM * 0.05 * iWarp;
    float d = length(off + cp - fp);
    if(d>minD-0.001) secD = min(secD, d);
  }
  float edgeDist = secD - minD;
  float seam = 1.0 - smoothstep(0.004, 0.028, edgeDist);
  float h = hash(minCell + 0.7);
  vec3 hotC = vec3(1.0, 0.65, 0.25);
  vec3 cellCol = mix(vec3(1.00, 0.55, 0.18), vec3(1.00, 0.92, 0.50), h);
  vec3 col = cellCol * (1.10 + 0.30*h);
  col *= (1.0 - 0.92 * seam);
  col += hotC * 0.35 * (1.0 - smoothstep(0.0, 0.18, edgeDist)) * iEnergy;
  col = mix(col, vec3(1.0, 0.95, 0.75), beat * (0.6 + 0.4*iIntensity));
  vec2 mpUv = (uv - vec2(iMouse.x, iMouse.y));
  mpUv.x *= iResolution.x/iResolution.y;
  float ring = exp(-pow((length(mpUv) - (1.0-iClick)*0.7)*10.0, 2.0)) * iClick;
  col += hotC * ring;
  col += iGrain * 0.06 * grain(gl_FragCoord.xy, iTime);
  col = hueShift(col, iHue);
  gl_FragColor = vec4(col, 1.0);
}
</script>

<script id="frag-mercury" type="x-shader/x-fragment">
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*iResolution)/min(iResolution.x,iResolution.y);
  vec2 m  = (iMouse - 0.5) * vec2(iResolution.x/iResolution.y, 1.0);
  float f = 0.0;
  f += 0.18 / max(length(uv - m), 0.02);
  /* energy gently accelerates blob speed */
  float spd = 0.35 + 0.30*iEnergy;
  for(int i=0;i<5;i++){
    float fi = float(i);
    float t = iTime*spd + fi*1.7;
    vec2 c = vec2(
      cos(t*0.9 + fi)*0.55 + sin(t*0.43)*0.18,
      sin(t*0.7 + fi*1.3)*0.42 + cos(t*0.27)*0.18
    );
    c = mix(c, m, 0.18*iWarp);
    /* bass slightly inflates blob radius */
    float radius = 0.11 + 0.04*iBass + 0.02*sin(t*2.0);
    f += radius / max(length(uv - c), 0.025);
  }
  /* pulse merges blobs (conservative — prevents full coverage) */
  float thresh = 2.4 - 0.6*iIntensity - 0.28*iPulse - 0.10*iBass;
  float surface = smoothstep(thresh-0.05, thresh+0.05, f);
  float inner   = smoothstep(thresh+0.4, thresh+0.2, f);
  vec3 bg = vec3(0.04, 0.05, 0.07);
  vec3 chrome1 = vec3(0.55, 0.62, 0.78);
  vec3 chrome2 = vec3(0.92, 0.95, 1.0);
  /* treble slightly warms specular */
  vec3 spec = mix(vec3(0.45, 0.7, 1.0), vec3(1.0, 0.85, 0.5), iTreble * 0.45);
  float env = 0.5 + 0.5*sin(uv.x*4.0 + uv.y*6.0 + iTime*0.4);
  vec3 chrome = mix(chrome1, chrome2, env);
  vec3 col = bg;
  col = mix(col, chrome, surface);
  float rim = surface - inner;
  col += spec * rim * (0.7 + 0.5*iEnergy);
  /* subtle treble noise texture on surface */
  float trebleTex = noise(uv*14.0 + vec2(iTime*2.0)) * iTreble * surface * 0.18;
  col += chrome2 * trebleTex;
  col += vec3(1.0) * iClick * 0.3 * surface;
  col += chrome2 * 0.15 * smoothstep(0.4, 0.0, length(uv-m)) * iIntensity;
  col += iGrain * 0.05 * grain(gl_FragCoord.xy, iTime);
  col = hueShift(col, iHue);
  col *= mix(0.82, 1.0, iPlaying);
  gl_FragColor = vec4(col, 1.0);
}
</script>

<script id="frag-lattice" type="x-shader/x-fragment">
mat2 rot(float a){ float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*iResolution)/min(iResolution.x,iResolution.y);
  vec2 m  = (iMouse - 0.5);
  /* energy gently accelerates rotation (bass would cause jitter as a velocity multiplier) */
  uv = rot(iTime*(0.08 + 0.15*iEnergy)) * uv;
  uv.x += m.x * 0.3 * iWarp;
  uv.y += m.y * 0.3 * iWarp;
  float scale = 7.0 + iWarp*3.0;
  vec2 p = uv * scale;
  vec2 q = vec2(p.x + p.y*0.577, p.y*1.155);
  vec2 iq = floor(q);
  vec2 fq = fract(q);
  float tri = step(fq.x + fq.y, 1.0);
  vec2 cellId = iq + vec2(tri<0.5?1.0:0.0);
  float d3 = 1.0 - fq.x - fq.y;
  float dEdge = min(min(fq.x, fq.y), abs(d3));
  if(tri<0.5){ dEdge = min(min(1.0-fq.x, 1.0-fq.y), abs(d3)); }
  /* bass slightly fattens grid lines */
  float edgeW = 0.05 + 0.03*iBass;
  float edge = smoothstep(edgeW, 0.0, dEdge);
  float beatH = hash(cellId + floor(iTime*1.5));
  float beat = smoothstep(0.7, 1.0, beatH) * iPulse;
  vec2 cen = (tri<0.5)? vec2(1.0/3.0, 1.0/3.0) : vec2(2.0/3.0, 2.0/3.0);
  float nodeD = length(fq - cen);
  /* bass slightly expands nodes */
  float node = exp(-nodeD*max(7.0, 10.0 - 2.5*iBass));
  float r = length(uv);
  float shock = exp(-pow((r - (1.0-iClick)*1.2)*6.0, 2.0)) * iClick;
  vec3 bg     = vec3(0.04, 0.03, 0.07);
  vec3 line   = vec3(0.40, 0.18, 0.55);
  vec3 hot    = vec3(1.0, 0.45, 0.85);
  vec3 hotter = vec3(1.0, 0.75, 0.95);
  /* treble subtly brightens grid lines */
  vec3 edgeC = mix(line, hotter, iTreble * 0.45);
  vec3 col = bg;
  col = mix(col, edgeC, edge*(0.35 + 0.65*iIntensity));
  col += hot * node * (0.5 + 0.4*iEnergy);
  col = mix(col, hotter, beat);
  col += hotter * shock;
  /* treble sparkles on nodes (gentle) */
  col += hotter * exp(-nodeD*15.0) * iTreble * 0.35;
  col += hot * (0.18 + 0.12*iBass) * exp(-r*2.2) * iIntensity;
  col += iGrain * 0.06 * grain(gl_FragCoord.xy, iTime);
  col = hueShift(col, iHue);
  col *= mix(0.82, 1.0, iPlaying);
  gl_FragColor = vec4(col, 1.0);
}
</script>

<script>
/* ====== WebGL plumbing ====== */
const VERT = document.getElementById('shader-vert').textContent;
const COMMON = document.getElementById('shader-common').textContent;
const FRAGS = {
  pulse:   document.getElementById('frag-pulse').textContent,
  tide:    document.getElementById('frag-tide').textContent,
  cells:   document.getElementById('frag-cells').textContent,
  mercury: document.getElementById('frag-mercury').textContent,
  lattice: document.getElementById('frag-lattice').textContent,
};
function makeProg(gl, fragSrc){
  function compile(type, src){
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error('shader', gl.getShaderInfoLog(s));
    return s;
  }
  const v = compile(gl.VERTEX_SHADER, VERT);
  const f = compile(gl.FRAGMENT_SHADER, COMMON + '\\n' + fragSrc);
  const p = gl.createProgram(); gl.attachShader(p,v); gl.attachShader(p,f); gl.linkProgram(p);
  return p;
}

/* ====== Wallpaper definitions (visual only — track data set by real API) ====== */
const WALLS = [
  {id:'pulse',   name:'Pulse',   preset:'flow',  bpm:72},
  {id:'tide',    name:'Tide',    preset:'rest',  bpm:64},
  {id:'cells',   name:'Cells',   preset:'flow',  bpm:96},
  {id:'mercury', name:'Mercury', preset:'spark', bpm:108},
  {id:'lattice', name:'Lattice', preset:'drive', bpm:128},
];

const BPM_PRESETS = [
  {id:'rest',  label:'Rest',  range:[55,65],  blurb:'wind-down · low stim'},
  {id:'flow',  label:'Flow',  range:[68,84],  blurb:'deep focus band'},
  {id:'spark', label:'Spark', range:[96,112], blurb:'task-switching'},
  {id:'drive', label:'Drive', range:[120,140],blurb:'sprint / energy'},
];

/* ====== State ====== */
const state = {
  activeIdx:0,
  intensity:0.65, warp:0.40, hue:0, grain:0.18,
  bpm:72, playing:false,
  elapsed:0, duration:0,
  mode:'browser',
  currentWebpageUrl:null,
  lyrics:[],  // [{ms, text}]
  targetHue:0,
};

/* ====== Audio element ====== */
const audioEl = document.getElementById('audioEl');
audioEl.addEventListener('play',  () => { state.playing = true;  updatePlayBtn(); });
audioEl.addEventListener('pause', () => { state.playing = false; updatePlayBtn(); });
audioEl.addEventListener('ended', () => { state.playing = false; updatePlayBtn(); });

/* ====== Web Audio analyser ====== */
let audioCtx=null, analyser=null, freqData=null;
let beatHistory=new Float32Array(60), beatIdx=0, lastBeatT=0;
let sBass=0, sTreble=0, sEnergy=0; // smoothed envelopes (asymmetric attack/release)

function setupAnalyser(){
  if(audioCtx) return;
  try{
    audioCtx=new(window.AudioContext||window.webkitAudioContext)();
    analyser=audioCtx.createAnalyser();
    analyser.fftSize=2048;                // 1024 bins
    analyser.smoothingTimeConstant=0.72;
    const src=audioCtx.createMediaElementSource(audioEl);
    src.connect(analyser);
    analyser.connect(audioCtx.destination);
    freqData=new Uint8Array(analyser.frequencyBinCount);
  }catch(e){ console.warn('AudioContext unavailable',e); }
}
audioEl.addEventListener('play',()=>{
  setupAnalyser();
  if(audioCtx&&audioCtx.state==='suspended') audioCtx.resume().catch(()=>{});
});

/* ====== Renderer ====== */
class Renderer {
  constructor(canvas, fragId){
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', {antialias:false, premultipliedAlpha:false});
    if(!this.gl) return;
    const gl = this.gl;
    this.prog = makeProg(gl, FRAGS[fragId]);
    this.fragId = fragId;
    gl.useProgram(this.prog);
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    ['iResolution','iTime','iMouse','iDrag','iClick','iPulse','iBass','iTreble',
     'iEnergy','iIntensity','iWarp','iHue','iGrain','iPlaying'].forEach(n=>{
      this.u[n] = gl.getUniformLocation(this.prog, n);
    });
    this.localMouse = {x:0.5,y:0.5};
    this.localClick = 0;
  }
  setFrag(fragId){
    if(this.fragId === fragId) return;
    this.fragId = fragId;
    const gl = this.gl;
    this.prog = makeProg(gl, FRAGS[fragId]);
    gl.useProgram(this.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    const loc = gl.getAttribLocation(this.prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    Object.keys(this.u).forEach(n=>{ this.u[n] = gl.getUniformLocation(this.prog, n); });
  }
  resize(){
    const dpr = Math.min(window.devicePixelRatio||1, 2);
    const w = this.canvas.clientWidth * dpr, h = this.canvas.clientHeight * dpr;
    if(this.canvas.width!==w || this.canvas.height!==h){ this.canvas.width=w; this.canvas.height=h; }
  }
  draw(env){
    if(!this.gl) return;
    this.resize();
    const gl = this.gl;
    gl.viewport(0,0,this.canvas.width,this.canvas.height);
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.iResolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.iTime, env.t);
    gl.uniform2f(this.u.iMouse, this.localMouse.x, 1.0 - this.localMouse.y);
    gl.uniform2f(this.u.iDrag, 0,0);
    gl.uniform1f(this.u.iClick, this.localClick);
    gl.uniform1f(this.u.iPulse, env.pulse);
    gl.uniform1f(this.u.iBass, env.bass);
    gl.uniform1f(this.u.iTreble, env.treble);
    gl.uniform1f(this.u.iEnergy, env.energy);
    gl.uniform1f(this.u.iIntensity, state.intensity);
    gl.uniform1f(this.u.iWarp, state.warp);
    gl.uniform1f(this.u.iHue, state.hue * Math.PI/180);
    gl.uniform1f(this.u.iGrain, state.grain);
    gl.uniform1f(this.u.iPlaying, state.playing?1:0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.localClick = Math.max(0, this.localClick - env.dt*1.4);
  }
}

/* ====== UI build ====== */
const picker = document.getElementById('picker');
const previewRenderers = [];
WALLS.forEach((w,i)=>{
  const row = document.createElement('div');
  row.className = 'wp' + (i===0?' active':'');
  const preset = BPM_PRESETS.find(p=>p.id===w.preset);
  row.innerHTML = `
    <div class="thumb"><canvas></canvas></div>
    <div class="info"><div class="name">${w.name}</div><div class="sub">${preset.label} · ${w.bpm} bpm</div></div>
    <div class="ix">0${i+1}</div>
  `;
  picker.appendChild(row);
  previewRenderers.push(new Renderer(row.querySelector('canvas'), w.id));
  row.addEventListener('click', ()=>setActiveShader(i));
});

const bpmPresets = document.getElementById('bpmPresets');
BPM_PRESETS.forEach((p,i)=>{
  const b = document.createElement('button');
  b.dataset.id = p.id;
  b.innerHTML = `<b>${p.label}</b><span>${p.range[0]}–${p.range[1]} bpm · ${p.blurb}</span>`;
  if(i===1) b.classList.add('on');
  b.addEventListener('click', ()=>{
    [...bpmPresets.children].forEach(c=>c.classList.remove('on'));
    b.classList.add('on');
    state.bpm = Math.round((p.range[0]+p.range[1])/2);
    document.getElementById('bpmDescIx').textContent = p.blurb;
    document.getElementById('bpmBand').textContent = p.label.toUpperCase();
    document.getElementById('bpmNum').textContent = state.bpm;
  });
  bpmPresets.appendChild(b);
});

/* knobs */
function setupKnob(node, opts){
  const val = node.querySelector('.val');
  const track = node.querySelector('.track i');
  let dragging=false,sy=0,sv=0;
  const fmt = v => opts.fmt? opts.fmt(v) : v.toFixed(2);
  function apply(v){
    v = Math.max(opts.min, Math.min(opts.max, v));
    opts.set(v);
    val.textContent = fmt(v);
    track.style.width = (100*(v-opts.min)/(opts.max-opts.min)).toFixed(1)+'%';
  }
  node.addEventListener('pointerdown', e=>{ dragging=true; sy=e.clientY; sv=opts.get(); node.setPointerCapture(e.pointerId); });
  node.addEventListener('pointermove', e=>{ if(!dragging) return; const dy=(sy-e.clientY)/130*(opts.max-opts.min); apply(sv+dy); });
  node.addEventListener('pointerup', ()=>dragging=false);
  apply(opts.get());
}
setupKnob(document.querySelector('[data-k=intensity]'), {min:0,max:1, get:()=>state.intensity, set:v=>state.intensity=v});
setupKnob(document.querySelector('[data-k=warp]'),      {min:0,max:1, get:()=>state.warp,      set:v=>state.warp=v});
setupKnob(document.querySelector('[data-k=hue]'),       {min:-180,max:180, get:()=>state.hue,  set:v=>{state.hue=v;state.targetHue=v;}, fmt:v=>(v>=0?'+':'')+v.toFixed(0)+'°'});
setupKnob(document.querySelector('[data-k=grain]'),     {min:0,max:1, get:()=>state.grain,     set:v=>state.grain=v});

/* main + art renderer */
const main = document.getElementById('mainCanvas');
const mainR = new Renderer(main, WALLS[0].id);
const artImg = document.getElementById('artImg');
const artPlaceholder = document.getElementById('artPlaceholder');
const heroArt = document.getElementById('heroArt');
const heroArtImg = document.getElementById('heroArtImg');
function setHeroArt(src){
  if(src){ heroArtImg.src = src; heroArt.classList.add('hasImg'); }
  else   { heroArtImg.removeAttribute('src'); heroArt.classList.remove('hasImg'); }
}

main.addEventListener('pointermove', e=>{
  const r = main.getBoundingClientRect();
  mainR.localMouse.x = (e.clientX - r.left)/r.width;
  mainR.localMouse.y = (e.clientY - r.top)/r.height;
});
main.addEventListener('pointerdown', e=>{
  const r = main.getBoundingClientRect();
  mainR.localMouse.x = (e.clientX - r.left)/r.width;
  mainR.localMouse.y = (e.clientY - r.top)/r.height;
  mainR.localClick = 1.0;
});

/* keyboard shortcuts */
window.addEventListener('keydown', e=>{
  if(e.target.tagName==='INPUT') return;
  const n = parseInt(e.key,10);
  if(!isNaN(n) && n>=1 && n<=5) setActiveShader(n-1);
  if(e.key===' '){ togglePlay(); e.preventDefault(); }
});
document.addEventListener('keydown', e=>{
  if((e.metaKey||e.ctrlKey) && e.key==='k'){ e.preventDefault(); searchInput.focus(); }
});

/* mode toggle */
document.querySelectorAll('.modeToggle button').forEach(b=>{
  b.addEventListener('click', ()=>{
    document.querySelectorAll('.modeToggle button').forEach(x=>x.classList.remove('on'));
    b.classList.add('on');
    state.mode = b.dataset.mode;
    const path = document.getElementById('endpointPath');
    if(state.mode==='browser') path.textContent = ' /api/stream · ';
    else                       path.textContent = ' /api/integrations/openclaw/play · ';
  });
});

/* wallpaper shader switch (visual only) */
function setActiveShader(i){
  state.activeIdx = i;
  document.querySelectorAll('.wp').forEach((el,j)=>el.classList.toggle('active', j===i));
  document.getElementById('wpIx').textContent = (i+1)+' / 5';
  state.bpm = WALLS[i].bpm;
  const preset = BPM_PRESETS.find(p=>p.id===WALLS[i].preset);
  [...bpmPresets.children].forEach(c=>c.classList.toggle('on', c.dataset.id===WALLS[i].preset));
  document.getElementById('bpmDescIx').textContent = preset.blurb;
  document.getElementById('bpmBand').textContent = preset.label.toUpperCase();
  document.getElementById('bpmNum').textContent = state.bpm;
  mainR.setFrag(WALLS[i].id);
}

/* ====== Real autocomplete ====== */
const searchInput = document.getElementById('searchInput');
const suggBox = document.getElementById('suggestions');
let acTimer = null;

async function openSuggestions(query){
  if(!query || !query.trim()){ closeSuggestions(); return; }
  clearTimeout(acTimer);
  acTimer = setTimeout(async ()=>{
    try {
      const t0 = performance.now();
      const r = await fetch(`/api/autocomplete?query=${encodeURIComponent(query.trim())}&limit=6`);
      const latMs = Math.round(performance.now()-t0);
      document.getElementById('latAc').textContent = latMs+'ms';
      if(!r.ok) return;
      const pool = await r.json();
      suggBox.innerHTML = '';
      pool.forEach((s,i)=>{
        const conf = Math.min(99,Math.max(20,s.confidence||50));
        const tier = conf>=85?'high':conf>=60?'mid':'low';
        const srcShort = s.artwork_source==='musicbrainz'?'MB':s.artwork_source==='youtube'?'YT':'✷';
        const row = document.createElement('div');
        row.className = 'sugg'+(i===0?' active':'');
        const thumbHtml = s.thumbnail
          ? `<img src="${s.thumbnail}" alt="" loading="lazy">`
          : `<div class="placeholder">♪</div>`;
        row.innerHTML = `
          <div class="sugg-art">${thumbHtml}<div class="src">${srcShort}</div></div>
          <div>
            <div class="name">${s.title||''}</div>
            <div class="meta">
              <span>${s.artist||''}</span>
              <span class="sep">·</span>
              <span>${s.album||'—'}</span>
              <span class="sep">·</span>
              <span class="yr">${s.release_year||'—'}</span>
            </div>
          </div>
          <div class="score ${tier}"><span class="pct">${conf}%</span><span class="lbl">match</span></div>`;
        suggBox.appendChild(row);
        row.addEventListener('click', ()=>{ closeSuggestions(); searchInput.value=''; loadTrack(s); });
      });
      if(pool.length>0) suggBox.classList.add('open');
    } catch(e){ console.warn('autocomplete', e); }
  }, 120);
}
function closeSuggestions(){ suggBox.classList.remove('open'); }
searchInput.addEventListener('focus', ()=>openSuggestions(searchInput.value));
searchInput.addEventListener('input', ()=>openSuggestions(searchInput.value));
searchInput.addEventListener('blur',  ()=>setTimeout(closeSuggestions, 180));

/* ====== Track loading ====== */
async function loadTrack(s){
  document.getElementById('trackTitle').textContent = s.title||'…';
  document.getElementById('trackTitleChrome').textContent = s.title||'…';
  document.getElementById('artistName').textContent = s.artist||'—';
  document.getElementById('albumName').textContent = s.album||'—';
  document.getElementById('releaseYear').textContent = s.release_year||'—';
  artImg.style.display='none'; artImg.src=''; artPlaceholder.style.display='flex';
  setHeroArt(null);

  const query = [s.title, s.artist].filter(Boolean).join(' ');
  try {
    const t0 = performance.now();
    const r = await fetch(`/api/search?query=${encodeURIComponent(query)}&limit=1`);
    document.getElementById('latSr').textContent = Math.round(performance.now()-t0)+'ms';
    if(!r.ok) return;
    const results = await r.json();
    if(!results||!results.length) return;
    const result = results[0];

    state.currentWebpageUrl = result.webpage_url;
    state.duration = result.duration||s.duration||0;
    state.elapsed = 0;

    document.getElementById('trackTitle').textContent = result.title||s.title;
    document.getElementById('trackTitleChrome').textContent = result.title||s.title;
    document.getElementById('artistName').textContent = result.artist||s.artist||'—';
    document.getElementById('albumName').textContent = result.album||s.album||'—';
    document.getElementById('releaseYear').textContent = result.release_year||s.release_year||'—';
    const artSrc = result.artwork_source||s.artwork_source||'';
    document.getElementById('artSrc').textContent =
      artSrc==='musicbrainz'?'MB · cover':artSrc==='youtube'?'YT · thumb':'✷ · gen';

    const thumb = result.thumbnail||result.artwork_url||'';
    if(thumb){ artImg.src=thumb; artImg.style.display='block'; artPlaceholder.style.display='none'; }
    else { artImg.style.display='none'; artImg.src=''; artPlaceholder.style.display='flex'; }
    setHeroArt(thumb||null);

    if(state.mode==='browser'){
      const t1 = performance.now();
      const streamUrl = `/api/stream?url=${encodeURIComponent(result.webpage_url)}`;
      audioEl.src = streamUrl;
      audioEl.play().then(()=>{
        document.getElementById('latSt').textContent = Math.round(performance.now()-t1)+'ms';
        document.getElementById('endStatus').textContent = '200 · streaming';
      }).catch(()=>{});
    } else {
      fetch(`/api/integrations/openclaw/play?query=${encodeURIComponent(query)}`);
      state.playing = true;
      updatePlayBtn();
      document.getElementById('endStatus').textContent = 'ffplay · local';
    }

    loadLyrics({title:result.title||s.title, artist:result.artist||s.artist, album:result.album||s.album, duration:state.duration});
  } catch(e){ console.warn('loadTrack', e); }
}

async function loadLyrics(meta){
  state.lyrics = [];
  document.getElementById('lyricsList').innerHTML = '';
  document.getElementById('lyrSync').textContent = '— loading —';
  try {
    const params = new URLSearchParams({title:meta.title||'', artist:meta.artist||''});
    if(meta.album) params.set('album', meta.album);
    if(meta.duration) params.set('duration', Math.round(meta.duration));
    const t0 = performance.now();
    const r = await fetch(`/api/lyrics?${params}`);
    document.getElementById('latLy').textContent = Math.round(performance.now()-t0)+'ms';
    if(!r.ok){ document.getElementById('lyrSync').textContent='— not found —'; return; }
    const data = await r.json();
    let lines = [];
    if(data.synced_lyrics){
      data.synced_lyrics.split('\\n').forEach(line=>{
        const m = line.match(/^\\[(\\d+):(\\d+(?:\\.\\d+)?)\\]\\s*(.*)$/);
        if(m){
          const ms = (parseInt(m[1])*60 + parseFloat(m[2]))*1000;
          if(m[3]) lines.push({ms, text:m[3]});
        }
      });
    } else if(data.plain_lyrics){
      lines = data.plain_lyrics.split('\\n').filter(l=>l.trim()).map((l,i)=>({ms:i*4000,text:l}));
    }
    state.lyrics = lines;
    const syncType = data.synced_lyrics?'synced':'plain';
    renderLyricsList(lines, syncType);
    document.getElementById('lyrProvider').textContent = `LRCLIB · ${syncType} · `;
    if(lines.length) document.getElementById('lyrCur').textContent = lines[0].text;
  } catch(e){ document.getElementById('lyrSync').textContent='— error —'; }
}

function renderLyricsList(lines, syncType){
  const host = document.getElementById('lyricsList');
  host.innerHTML = '';
  lines.forEach((ln,idx)=>{
    const row = document.createElement('div');
    row.className = 'row'; row.dataset.idx = idx;
    row.innerHTML = `<span class="ts">${msToTs(ln.ms)}</span><span class="ln">${ln.text}</span>`;
    host.appendChild(row);
  });
  document.getElementById('lyrSync').textContent = `${syncType} · ${lines.length} lines`;
}

function msToTs(ms){
  const s=(ms/1000)|0; const mm=(s/60)|0; const ss=s%60;
  const cs=Math.floor((ms%1000)/10);
  return `${mm.toString().padStart(2,'0')}:${ss.toString().padStart(2,'0')}.${cs.toString().padStart(2,'0')}`;
}

function updateLyricsOverlay(elapsedMs){
  const lines = state.lyrics;
  if(!lines.length) return;
  let curIdx = 0;
  for(let i=0;i<lines.length;i++){ if(lines[i].ms<=elapsedMs) curIdx=i; }
  const prev = lines[Math.max(0,curIdx-1)];
  const cur  = lines[curIdx];
  const next = lines[Math.min(lines.length-1,curIdx+1)];
  document.getElementById('lyrPrev').textContent = prev&&prev!==cur?prev.text:'';
  document.getElementById('lyrCur').textContent  = cur?cur.text:'';
  document.getElementById('lyrNext').textContent = next&&next!==cur?next.text:'';
  document.getElementById('lyrTs').textContent = msToTs(elapsedMs);
  const rows = document.querySelectorAll('#lyricsList .row');
  rows.forEach((el,i)=>{
    const active = i===curIdx;
    el.classList.toggle('is-cur', active);
    if(active) el.scrollIntoView({block:'nearest',behavior:'smooth'});
  });
}

/* ====== Playback controls ====== */
function updatePlayBtn(){
  document.getElementById('playIcon').innerHTML = state.playing
    ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>'
    : '<path d="M8 5v14l11-7z"/>';
}

function togglePlay(){
  if(state.mode==='browser'){
    if(audioEl.src && audioEl.src !== window.location.href){
      if(audioEl.paused){ audioEl.play().catch(()=>{}); }
      else { audioEl.pause(); }
    }
  } else {
    if(state.playing){ fetch('/api/integrations/openclaw/stop'); state.playing=false; }
    else { fetch('/api/integrations/openclaw/resume'); state.playing=true; }
    updatePlayBtn();
  }
}

document.getElementById('playBtn').addEventListener('click', togglePlay);
document.getElementById('nextBtn').addEventListener('click', ()=>setActiveShader((state.activeIdx+1)%5));
document.getElementById('prevBtn').addEventListener('click', ()=>setActiveShader((state.activeIdx+4)%5));

const scrubBar = document.getElementById('scrubBar');
scrubBar.addEventListener('click', e=>{
  const r = scrubBar.getBoundingClientRect();
  const frac = (e.clientX-r.left)/r.width;
  if(state.mode==='browser'&&audioEl.duration&&!isNaN(audioEl.duration)){
    audioEl.currentTime = frac*audioEl.duration;
  } else {
    state.elapsed = frac*state.duration;
  }
});

/* ====== Health check ====== */
async function checkHealth(){
  try {
    const r = await fetch('/health');
    if(!r.ok) return;
    const d = await r.json();
    document.getElementById('runtimeText').textContent =
      `GET /health · ${d.status||'ok'} · ${d.mode||'browser-first'}`;
    document.getElementById('healthIx').textContent =
      `/health · ${d.status||'ok'}`;
  } catch(e){}
}
checkHealth();

/* ====== Equalizer ====== */
const eqOpts = {style:'bars', bands:32, palette:'lime', scale:'linear', peaks:true};
let eqLevels = new Float32Array(eqOpts.bands);
let eqPeaks  = new Float32Array(eqOpts.bands);
function setBands(n){ if(n===eqLevels.length) return; eqLevels=new Float32Array(n); eqPeaks=new Float32Array(n); }

const eqPalettes = {
  lime:  {base:'rgba(215,255,58,0.06)',  mid:'rgba(215,255,58,0.45)',  hot:'rgba(215,255,58,0.95)',  peak:'rgba(255,255,255,0.75)', solid:'#d7ff3a'},
  ice:   {base:'rgba(122,217,255,0.06)', mid:'rgba(122,217,255,0.45)', hot:'rgba(220,245,255,0.95)', peak:'rgba(255,255,255,0.75)', solid:'#7ad9ff'},
  magma: {base:'rgba(255,106,61,0.06)',  mid:'rgba(255,106,61,0.55)',  hot:'rgba(255,210,120,0.95)', peak:'rgba(255,240,210,0.8)',  solid:'#ff6a3d'},
  mono:  {base:'rgba(244,244,245,0.06)', mid:'rgba(244,244,245,0.40)', hot:'rgba(255,255,255,0.95)', peak:'rgba(255,255,255,0.85)', solid:'#f4f4f5'},
};
const eqOverlayPalettes = {
  lime:  {base:'rgba(215,255,58,0.10)',  mid:'rgba(215,255,58,0.55)',  hot:'rgba(255,255,255,0.95)', peak:'rgba(255,255,255,0.85)'},
  ice:   {base:'rgba(122,217,255,0.12)', mid:'rgba(122,217,255,0.55)', hot:'rgba(255,255,255,0.95)', peak:'rgba(255,255,255,0.85)'},
  magma: {base:'rgba(255,106,61,0.12)',  mid:'rgba(255,106,61,0.60)',  hot:'rgba(255,230,150,0.95)', peak:'rgba(255,240,210,0.85)'},
  mono:  {base:'rgba(244,244,245,0.10)', mid:'rgba(244,244,245,0.45)', hot:'rgba(255,255,255,0.95)', peak:'rgba(255,255,255,0.85)'},
};

function updateEqLevels(t, env){
  const N=eqLevels.length;
  if(analyser && freqData && state.playing){
    /* map 1024 FFT bins → N bands on a log frequency scale (40Hz–18kHz) */
    const binCount=freqData.length;
    const nyquist=audioCtx.sampleRate/2;
    const binHz=nyquist/binCount;
    const logMin=Math.log10(40), logMax=Math.log10(18000);
    for(let i=0;i<N;i++){
      const f0=Math.pow(10,logMin+(i/N)*(logMax-logMin));
      const f1=Math.pow(10,logMin+((i+1)/N)*(logMax-logMin));
      const b0=Math.max(0,Math.floor(f0/binHz));
      const b1=Math.min(binCount-1,Math.ceil(f1/binHz));
      let sum=0,count=0;
      for(let b=b0;b<=b1;b++){sum+=freqData[b];count++;}
      const raw=count>0?sum/count/255:0;
      const v=Math.min(1,raw*(1+state.intensity));
      const prev=eqLevels[i];
      eqLevels[i]=prev+(v-prev)*(v>prev?0.65:0.14);
      eqPeaks[i]=Math.max(eqLevels[i],eqPeaks[i]-0.008);
    }
  } else {
    /* idle: gentle decay to zero */
    for(let i=0;i<N;i++){
      eqLevels[i]*=0.88;
      eqPeaks[i]=Math.max(eqLevels[i],eqPeaks[i]-0.005);
    }
  }
}

function shapeLevel(v){ return eqOpts.scale==='log'?Math.max(0,Math.min(1,Math.log10(1+v*9))):v; }

function drawEq(canvas, levels, peaks, opts){
  const ctx=canvas.getContext('2d');
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const w=canvas.clientWidth*dpr, h=canvas.clientHeight*dpr;
  if(canvas.width!==w||canvas.height!==h){ canvas.width=w; canvas.height=h; }
  ctx.clearRect(0,0,w,h);
  const n=levels.length;
  const style=opts.style||'bars';
  const showPeaks=(opts.peaks!==false)&&eqOpts.peaks;
  const gap=Math.max(1*dpr,w*0.003);
  const bw=(w-gap*(n-1))/n;
  if(style==='wave'||style==='ribbon'||style==='dots'){
    const pts=[];
    for(let i=0;i<n;i++){
      const v=shapeLevel(levels[i]);
      pts.push([i*(bw+gap)+bw/2, h-Math.max(2*dpr,v*h*0.94)]);
    }
    if(style==='wave'){
      ctx.lineWidth=Math.max(1.5*dpr,2*dpr); ctx.strokeStyle=opts.hot;
      ctx.shadowColor=opts.mid; ctx.shadowBlur=6*dpr;
      ctx.beginPath(); pts.forEach((p,i)=>{ if(i===0) ctx.moveTo(p[0],p[1]); else ctx.lineTo(p[0],p[1]); }); ctx.stroke();
      ctx.shadowBlur=0;
      const grad=ctx.createLinearGradient(0,0,0,h); grad.addColorStop(0,opts.mid); grad.addColorStop(1,opts.base);
      ctx.fillStyle=grad; ctx.beginPath(); ctx.moveTo(0,h);
      pts.forEach(p=>ctx.lineTo(p[0],p[1])); ctx.lineTo(w,h); ctx.closePath(); ctx.fill();
    } else if(style==='ribbon'){
      const mid=h/2; ctx.fillStyle=opts.mid; ctx.beginPath();
      pts.forEach((p,i)=>{ const dy=(h-p[1])*0.5; if(i===0) ctx.moveTo(p[0],mid-dy); else ctx.lineTo(p[0],mid-dy); });
      for(let i=pts.length-1;i>=0;i--){ const p=pts[i]; const dy=(h-p[1])*0.5; ctx.lineTo(p[0],mid+dy); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle=opts.hot; ctx.lineWidth=1*dpr;
      ctx.beginPath(); pts.forEach((p,i)=>{ const dy=(h-p[1])*0.5; if(i===0) ctx.moveTo(p[0],mid-dy); else ctx.lineTo(p[0],mid-dy); }); ctx.stroke();
      ctx.beginPath(); pts.forEach((p,i)=>{ const dy=(h-p[1])*0.5; if(i===0) ctx.moveTo(p[0],mid+dy); else ctx.lineTo(p[0],mid+dy); }); ctx.stroke();
    } else {
      ctx.fillStyle=opts.hot; const r=Math.max(1.5*dpr,bw*0.35);
      pts.forEach(p=>{ ctx.beginPath(); ctx.arc(p[0],p[1],r,0,Math.PI*2); ctx.fill(); });
      ctx.fillStyle=opts.base; pts.forEach(p=>{ ctx.fillRect(p[0]-bw/2+gap/2,p[1]+r,bw-gap,h-p[1]-r); });
    }
    return;
  }
  for(let i=0;i<n;i++){
    const v=shapeLevel(levels[i]); const pv=shapeLevel(peaks[i]); const x=i*(bw+gap);
    if(style==='mirror'){
      const mid=h/2; const bh=Math.max(1.5*dpr,v*mid*0.94); const yTop=mid-bh;
      const grad=ctx.createLinearGradient(0,mid,0,0); grad.addColorStop(0,opts.base); grad.addColorStop(0.6,opts.mid); grad.addColorStop(1,opts.hot);
      ctx.fillStyle=grad; ctx.fillRect(x,yTop,bw,bh);
      const grad2=ctx.createLinearGradient(0,mid,0,h); grad2.addColorStop(0,opts.base); grad2.addColorStop(0.6,opts.mid); grad2.addColorStop(1,opts.hot);
      ctx.fillStyle=grad2; ctx.fillRect(x,mid,bw,bh);
      if(showPeaks){ const ph=pv*mid*0.94; ctx.fillStyle=opts.peak; ctx.fillRect(x,mid-ph-1*dpr,bw,1.2*dpr); ctx.fillRect(x,mid+ph,bw,1.2*dpr); }
      continue;
    }
    const bh=Math.max(2*dpr,v*h*0.96); const y=h-bh;
    const grad=ctx.createLinearGradient(0,h,0,y); grad.addColorStop(0,opts.base); grad.addColorStop(0.55,opts.mid); grad.addColorStop(1,opts.hot);
    ctx.fillStyle=grad; ctx.fillRect(x,y,bw,bh);
    if(showPeaks){ const py=h-pv*h*0.96; ctx.fillStyle=opts.peak; ctx.fillRect(x,py-2*dpr,bw,1.5*dpr); }
  }
}

function setEqLabel(){ document.getElementById('eqMode').textContent=`${eqOpts.style} · ${eqLevels.length} · ${eqOpts.palette}`; }
(function wireEqControls(){
  const root=document.getElementById('eqControls'); if(!root) return;
  root.addEventListener('click', e=>{
    const chip=e.target.closest('.eqChip'); if(!chip) return;
    const group=chip.parentElement; const key=group.dataset.key; const v=chip.dataset.v;
    if(key==='peaks'){ eqOpts.peaks=!eqOpts.peaks; chip.classList.toggle('on',eqOpts.peaks); return; }
    group.querySelectorAll('.eqChip').forEach(c=>c.classList.toggle('on',c===chip));
    if(key==='bands'){ const n=parseInt(v,10); eqOpts.bands=n; setBands(n); }
    else { eqOpts[key]=v; }
    setEqLabel();
  });
})();

/* ====== Animation loop ====== */
let lastT=performance.now();
let pulse=0, nextBeat=0;
function fmt(s){ s=Math.max(0,s|0); const m=(s/60)|0,ss=s%60; return m.toString().padStart(2,'0')+':'+ss.toString().padStart(2,'0'); }

function loop(now){
  const dt=Math.min(0.05,(now-lastT)/1000); lastT=now;
  const t=now/1000;

  /* sync audio state */
  if(state.mode==='browser' && audioEl.duration && !isNaN(audioEl.duration)){
    state.elapsed = audioEl.currentTime;
    state.duration = audioEl.duration;
    if(!audioEl.paused && !audioEl.ended) state.playing = true;
  }
  if(state.mode!=='browser' && state.playing) state.elapsed=Math.min(state.duration,state.elapsed+dt);

  /* ---- real audio feature extraction ---- */
  let bass,treble,energy;
  if(analyser && freqData && state.playing){
    if(audioCtx.state==='suspended') audioCtx.resume().catch(()=>{});
    analyser.getByteFrequencyData(freqData);
    const binCount=freqData.length;
    const binHz=(audioCtx.sampleRate/2)/binCount;
    const bEnd =Math.floor(250/binHz);
    const tStart=Math.floor(3500/binHz), tEnd=Math.floor(12000/binHz);
    let bSum=0,bN=0, tSum=0,tN=0, eSum=0;
    for(let i=1;i<binCount;i++){
      const v=freqData[i]/255;
      if(i<bEnd){bSum+=v;bN++;}
      if(i>=tStart&&i<tEnd){tSum+=v;tN++;}
      eSum+=v*v;
    }
    const rawBass  =bN>0?Math.min(1,(bSum/bN)*2.8):0;
    const rawTreble=tN>0?Math.min(1,(tSum/tN)*4.2):0;
    const rawEnergy=Math.min(1,Math.sqrt(eSum/binCount)*4.8);
    /* asymmetric envelope — moderate attack so spikes don't overdrive shaders */
    sBass  +=( rawBass   - sBass  )*(rawBass   > sBass  ? 0.45 : 0.18);
    sTreble+=( rawTreble - sTreble)*(rawTreble > sTreble? 0.45 : 0.18);
    sEnergy+=( rawEnergy - sEnergy)*(rawEnergy > sEnergy? 0.45 : 0.20);
    /* gentle compression: pow(x, 1.3) tames mid-range without flattening peaks */
    bass  = Math.pow(sBass,   1.3);
    treble= Math.pow(sTreble, 1.3);
    energy= Math.pow(sEnergy, 1.3);
    /* onset / beat detection: bass spike above running average */
    beatHistory[beatIdx%beatHistory.length]=rawBass;
    beatIdx++;
    let avg=0; for(let i=0;i<beatHistory.length;i++) avg+=beatHistory[i]; avg/=beatHistory.length;
    if(rawBass>avg*1.4 && rawBass>0.08 && t-lastBeatT>0.18){ pulse=1.0; lastBeatT=t; }
  } else {
    /* no analyser — BPM-locked metronome fallback; decay smooth envelopes */
    sBass*=0.92; sTreble*=0.92; sEnergy*=0.92;
    if(state.playing){
      const bi=60/state.bpm;
      if(t>=nextBeat){ pulse=1.0; nextBeat=t+bi; }
    }
    bass  =state.playing?0.15:0.04;
    treble=state.playing?0.10:0.03;
    energy=state.playing?0.13:0.04;
  }
  pulse=Math.max(0,pulse-dt*3.0);

  const heart=document.getElementById('bpmHeart');
  heart.style.transform=`scale(${1+pulse*0.6})`; heart.style.opacity=String(0.6+0.4*pulse);

  document.getElementById('elapsed').textContent=fmt(state.elapsed);
  document.getElementById('duration').textContent=fmt(state.duration);
  const pct=state.duration>0?state.elapsed/state.duration:0;
  document.getElementById('scrubFill').style.width=(pct*100).toFixed(2)+'%';
  document.getElementById('scrubHead').style.left=(pct*100).toFixed(2)+'%';

  updateLyricsOverlay(state.elapsed*1000);

  const env={t,dt,pulse,bass,treble,energy};
  updateEqLevels(t,env);

  /* smooth hue transition toward album-art target */
  const hueDiff = state.targetHue - state.hue;
  if(Math.abs(hueDiff) > 0.05){
    state.hue += hueDiff * Math.min(1, dt * 1.5);
    document.getElementById('kHue').textContent = (state.hue>=0?'+':'')+state.hue.toFixed(0)+'°';
    document.getElementById('tHue').style.width = (100*(state.hue+180)/360).toFixed(1)+'%';
  }

  const pOv=eqOverlayPalettes[eqOpts.palette]||eqOverlayPalettes.lime;
  const pSd=eqPalettes[eqOpts.palette]||eqPalettes.lime;
  drawEq(document.getElementById('eqCanvas'),eqLevels,eqPeaks,{...pOv,segments:(eqOpts.style==='bars'),style:eqOpts.style});
  drawEq(document.getElementById('eqSideCanvas'),eqLevels,eqPeaks,{...pSd,segments:false,style:eqOpts.style});

  const mini=document.getElementById('miniEq').children;
  const N=eqLevels.length;
  const samples=[eqLevels[Math.floor(N*0.06)],eqLevels[Math.floor(N*0.28)],eqLevels[Math.floor(N*0.55)],eqLevels[Math.floor(N*0.84)]];
  const miniColor=pSd.solid;
  for(let i=0;i<4;i++){
    mini[i].style.background=miniColor;
    mini[i].style.transform=`scaleY(${Math.max(0.08,samples[i])})`;
    mini[i].style.opacity=String(0.55+0.45*samples[i]);
  }
  let peak=0; for(let i=0;i<N;i++) peak=Math.max(peak,eqPeaks[i]);
  const db=peak>0.001?(20*Math.log10(peak)).toFixed(1):'−∞';
  document.getElementById('eqPeak').textContent=db;

  mainR.draw(env);
  previewRenderers.forEach((r,i)=>{
    r.localMouse.x=0.5+0.15*Math.sin(t*0.4+i);
    r.localMouse.y=0.5+0.15*Math.cos(t*0.3+i*1.3);
    r.draw({...env,t:t+i*1.7});
  });
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
setActiveShader(0);

/* ====== MCP Server Panel (real API) ====== */
const MCP_TOOLS = [
  {n:'music_health_check',   d:'Ping the music backend and return version info.',        a:0},
  {n:'music_search',         d:'MusicBrainz-first autocomplete with YouTube fallback.',  a:1},
  {n:'music_get_stream_url', d:'Resolve a playable audio URL for a track id.',           a:1},
  {n:'music_get_metadata',   d:'Return release year, album art source, durations.',      a:1},
  {n:'music_get_lyrics',     d:'Fetch LRCLIB synced lyrics for the current track.',      a:1},
  {n:'music_play',           d:'Start terminal playback via ffplay.',                    a:1},
  {n:'music_stop',           d:'Halt the active ffplay stream.',                         a:0},
  {n:'music_resume',         d:'Resume from the last persisted position.',               a:0},
];

const mcp = { state:'stopped', pid:null, startedAt:null, calloutDismissed:false };

function fmtUptime(ms){
  if(!ms||ms<0) return '—';
  const s=Math.floor(ms/1000), m=Math.floor(s/60), h=Math.floor(m/60);
  if(h>=1) return h+'h '+(m%60)+'m';
  if(m>=1) return m+'m '+(s%60)+'s';
  return s+'s';
}
function nowHMS(){
  const d=new Date(),p=n=>String(n).padStart(2,'0');
  return p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());
}

function renderMcpDrawer(target, st){
  const {state:s, pid, startedAt} = st;
  const labels={stopped:'Stopped',starting:'Starting…',running:'Running'};
  const uptime=s==='running'?fmtUptime(Date.now()-startedAt):null;
  const toolsHtml=s==='running'
    ?MCP_TOOLS.map(t=>`<div class="mcpTool"><div class="name">${t.n}</div><div class="arity ${t.a===0?'':'has'}">${t.a===0?'no params':t.a+' param'+(t.a>1?'s':'')}</div><div class="desc">${t.d}</div></div>`).join('')
    :`<div class="mcpToolsEmpty">${s==='starting'?'— initializing —':'— tools register on start —'}</div>`;
  const calloutHtml=st.calloutDismissed?'':`
    <div class="mcpSection"><div class="mcpCallout">
      <span class="ic">!</span>
      <span class="tx"><b>Restart Claude Code</b> after toggling to reload the tool list.</span>
      <button data-act="dismiss-callout" aria-label="Dismiss">×</button>
    </div></div>`;
  target.innerHTML=`
    <div class="mcpHead">
      <div><div class="crumb">dev-music-service · integrations</div><h2>MCP Server</h2></div>
      <button class="mcpClose" data-act="close" aria-label="Close">×</button>
    </div>
    <div class="mcpBody">
      <div class="mcpSection">
        <div class="mcpStatus ${s}">
          <div class="big"><span class="mcpDot ${s}"></span></div>
          <div>
            <div class="lbl">${labels[s]}</div>
            <div class="meta">
              ${pid?`<span><b>pid</b> ${pid}</span><span class="sep">·</span>`:''}
              ${uptime?`<span><b>up</b> ${uptime}</span>`:(s==='starting'?'<span>spawning…</span>':'<span>not running</span>')}
            </div>
          </div>
        </div>
        <div class="mcpCtrls">
          ${s==='running'
            ?`<button class="mcpBtn stop" data-act="stop">Stop</button><button class="mcpBtn" data-act="restart">Restart</button>`
            :`<button class="mcpBtn start" data-act="start" ${s==='starting'?'disabled':''}>${s==='starting'?'Starting…':'Start server'}</button><button class="mcpBtn" data-act="restart" disabled>Restart</button>`}
        </div>
      </div>
      <div class="mcpSection">
        <div class="h"><span>Connection</span><span>stdio</span></div>
        <dl class="mcpKv">
          <dt>transport</dt><dd>stdio <span class="tag">local</span></dd>
          <dt>config</dt><dd>.mcp.json</dd>
          <dt>entry</dt><dd>mcp-server/dist/index.js</dd>
        </dl>
      </div>
      <div class="mcpSection">
        <div class="h"><span>Tools</span><span>${s==='running'?MCP_TOOLS.length+' registered':'—'}</span></div>
        <div class="mcpTools">${toolsHtml}</div>
      </div>
      ${calloutHtml}
    </div>`;
}

function syncMcpPill(){
  const dot=document.getElementById('mcpPillDot');
  const stat=document.getElementById('mcpPillStat');
  dot.className='mcpDot '+mcp.state;
  stat.textContent=mcp.state==='running'?`running · ${fmtUptime(Date.now()-mcp.startedAt)}`:(mcp.state==='starting'?'starting…':'stopped');
}

async function mcpStart(){
  if(mcp.state!=='stopped') return;
  mcp.state='starting'; syncMcpPill(); renderMcpDrawer(mcpDrawerEl, mcp);
  try {
    const r=await fetch('/api/mcp/start',{method:'POST'});
    const d=await r.json();
    if(d.running){ mcp.state='running'; mcp.pid=d.pid; mcp.startedAt=Date.now(); }
    else { mcp.state='stopped'; }
  } catch(e){ mcp.state='stopped'; }
  syncMcpPill(); renderMcpDrawer(mcpDrawerEl, mcp);
}

async function mcpStop(){
  if(mcp.state!=='running') return;
  try { await fetch('/api/mcp/stop',{method:'POST'}); } catch(e){}
  mcp.state='stopped'; mcp.pid=null; mcp.startedAt=null;
  syncMcpPill(); renderMcpDrawer(mcpDrawerEl, mcp);
}

async function mcpRestart(){ await mcpStop(); setTimeout(()=>mcpStart(),200); }

async function pollMcpStatus(){
  try {
    const r=await fetch('/api/mcp/status');
    const d=await r.json();
    if(d.running&&mcp.state!=='running'){
      mcp.state='running'; mcp.pid=d.pid; if(!mcp.startedAt) mcp.startedAt=Date.now();
      syncMcpPill(); renderMcpDrawer(mcpDrawerEl, mcp);
    } else if(!d.running&&mcp.state==='running'){
      mcp.state='stopped'; mcp.pid=null; mcp.startedAt=null;
      syncMcpPill(); renderMcpDrawer(mcpDrawerEl, mcp);
    }
  } catch(e){}
}

const mcpDrawerEl=document.getElementById('mcpDrawer');
const mcpScrim=document.getElementById('mcpScrim');
renderMcpDrawer(mcpDrawerEl, mcp);
syncMcpPill();
pollMcpStatus();
setInterval(pollMcpStatus, 15000);
setInterval(()=>{ if(mcp.state==='running') syncMcpPill(); }, 1000);

document.getElementById('mcpOpen').addEventListener('click', ()=>{
  mcpDrawerEl.classList.add('open'); mcpScrim.classList.add('open');
});
mcpScrim.addEventListener('click', ()=>{ mcpDrawerEl.classList.remove('open'); mcpScrim.classList.remove('open'); });
mcpDrawerEl.addEventListener('click', e=>{
  const b=e.target.closest('[data-act]'); if(!b) return;
  const act=b.dataset.act;
  if(act==='close'){ mcpDrawerEl.classList.remove('open'); mcpScrim.classList.remove('open'); }
  else if(act==='start') mcpStart();
  else if(act==='stop')  mcpStop();
  else if(act==='restart') mcpRestart();
  else if(act==='dismiss-callout'){ mcp.calloutDismissed=true; renderMcpDrawer(mcpDrawerEl,mcp); }
});
document.addEventListener('keydown', e=>{
  if(e.key==='Escape'&&mcpDrawerEl.classList.contains('open')){
    mcpDrawerEl.classList.remove('open'); mcpScrim.classList.remove('open');
  }
});
</script>
</body>
</html>
"""
