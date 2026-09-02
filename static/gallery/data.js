// Wallpaper metadata — extracted verbatim.
const ALTS = [
  {
    id:'drift', name:'Drift', n:'01',
    preset:'Flow', bpm:76, a11y:'low', pairFrom:'Pulse',
    desc:'Soft drifting fog with sage and coral washes. Cursor pulls the field; beats puff coral light at your pointer. Replaces Pulse\u2019s hard rings with weather.',
    palette:['#10141a','#1d2c35','#7aa091','#f48d68','#1a2227'],
    track:{
      title:'Eight Miles Inland', artist:'Slo Roth', album:'Letterboxes',
      year:2024, src:'mb', conf:'cover-art-archive'
    },
    lyric:'we drove until the radio gave up its station of weather'
  },
  {
    id:'vellum', name:'Vellum', n:'02',
    preset:'Rest', bpm:60, a11y:'low', pairFrom:'Tide',
    desc:'Watercolor-on-paper: slow sepia ink bleeds into a warm cream field. The cursor draws fresh bloom; the page breathes once per minute. Daylight, not aquatic.',
    palette:['#ebd9b6','#9d6a3e','#3d220f','#c19a6a','#f1e5c8'],
    track:{
      title:'Letterpress Hours', artist:'Anya Coro', album:'Press, Tile',
      year:2023, src:'mb', conf:'release-group'
    },
    lyric:'the page took the ink the way the morning takes the sun'
  },
  {
    id:'halftone', name:'Halftone', n:'03',
    preset:'Flow', bpm:92, a11y:'medium', pairFrom:'Cells',
    desc:'Rotating dot lattice with a warm-red ink. Dots shrink under your cursor and brighten on beat \u2014 a print-shop response to Cells\u2019 voronoi.',
    palette:['#0c0c10','#1a1014','#f06a4e','#ffc88c','#171518'],
    track:{
      title:'Foreman\u2019s Margin', artist:'Press Halford', album:'Setline',
      year:2024, src:'yt', conf:'video-thumbnail'
    },
    lyric:'every dot a count the floor already kept'
  },
  {
    id:'caustics', name:'Caustics', n:'04',
    preset:'Spark', bpm:100, a11y:'medium', pairFrom:'Mercury',
    desc:'Pool light read from underwater \u2014 bright ribbons crawl across deep navy. Cursor distorts the surface; clicks send a ripple. The opposite end of Mercury\u2019s chrome.',
    palette:['#040c1a','#0e2a4a','#3aa3e3','#cbefff','#08182a'],
    track:{
      title:'Pool Memory', artist:'Lex Ramone', album:'Tile, Underexposed',
      year:2025, src:'mb', conf:'cover-art-archive'
    },
    lyric:'the chlorine remembered every hour of August'
  },
  {
    id:'stria', name:'Stria', n:'05',
    preset:'Drive', bpm:132, a11y:'high', pairFrom:'Lattice',
    desc:'Vertical plasma sheets in lime and cyan, magenta on every beat. Reads as the curtain you\u2019d see if Lattice had a more analog cousin. CRT scrim baked in.',
    palette:['#04060a','#0b1c12','#4dff8d','#5cd9ff','#ff52d6'],
    track:{
      title:'Soft Magnetics', artist:'Beren Vahl', album:'Coil',
      year:2025, src:'pl', conf:'generated'
    },
    lyric:'sheets and sheets, every sheet a step the room agreed to take'
  },
  {
    id:'ember', name:'Ember', n:'06',
    preset:'Flow', bpm:74, a11y:'low', pairFrom:'Pulse',
    desc:'Heat haze rising off coals — warm plumes climb a near-black field and brighten on beat. A second take on Pulse that trades rings for slow convection.',
    palette:['#0d0708','#421210','#f4661f','#ffd474','#1a0d0a'],
    track:{
      title:'Coalsmoke County', artist:'Vale Brun', album:'Banked Fires',
      year:2024, src:'mb', conf:'cover-art-archive'
    },
    lyric:'the fire kept its own slow time all night'
  },
  {
    id:'marble', name:'Marble', n:'07',
    preset:'Rest', bpm:58, a11y:'low', pairFrom:'Tide',
    desc:'Liquid stone: cool grey marbling threaded with mineral veins that drift almost imperceptibly. The cursor warms a bloom into the surface. Stiller than Vellum.',
    palette:['#1d2026','#474d56','#9ea7b0','#8bb8c0','#2b3038'],
    track:{
      title:'Quarry Light', artist:'Ostor Hale', album:'Sediment',
      year:2023, src:'mb', conf:'release-group'
    },
    lyric:'the vein in the stone was a river that forgot how to move'
  },
  {
    id:'weave', name:'Weave', n:'08',
    preset:'Flow', bpm:94, a11y:'low', pairFrom:'Cells',
    desc:'Two thread fields crossed into a living moiré — the weave angle bends toward your cursor, crossings flare gold on beat. A textile answer to Cells.',
    palette:['#0a0c0f','#16202b','#8cc6f2','#ffd98c','#13171c'],
    track:{
      title:'Warp & Weft', artist:'Niamh Coll', album:'Loomwork',
      year:2025, src:'yt', conf:'video-thumbnail'
    },
    lyric:'over, under, over — the cloth learned to hold the light'
  },
  {
    id:'prism', name:'Prism', n:'09',
    preset:'Spark', bpm:104, a11y:'medium', pairFrom:'Mercury',
    desc:'A fan of refracted light split into chromatic spokes that wheel around the cursor. Clicks send a clean ring outward. Mercury’s glare, decomposed into color.',
    palette:['#050308','#2a1340','#5ad0ff','#ff6ad0','#fff2c8'],
    track:{
      title:'Refraction Index', artist:'Soli Vant', album:'Spectra',
      year:2025, src:'mb', conf:'cover-art-archive'
    },
    lyric:'one white light, and the wall gave back every color it owed'
  },
  {
    id:'tunnel', name:'Tunnel', n:'10',
    preset:'Drive', bpm:130, a11y:'high', pairFrom:'Lattice',
    desc:'A neon grid receding to a vanishing point, rings and spokes strobing forward on every beat. The cursor steers the bore. Lattice with somewhere to go.',
    palette:['#04050a','#0c2018','#4dffb3','#6699ff','#ff59cc'],
    track:{
      title:'Vanishing Point', artist:'Ketra Ido', album:'Bore',
      year:2025, src:'pl', conf:'generated'
    },
    lyric:'the road kept its zero just ahead, mile after mile'
  },
  {
    id:'pulse', name:'Pulse', n:'11',
    preset:'Flow', bpm:72, a11y:'medium', pairFrom:'original',
    desc:'The original orb: concentric rings bloom from the beat while the cursor warps the field. Bass swells the core, treble shimmers the halo.',
    palette:['#0d0f1e','#2e1438','#ff6a4d','#ffd9a8','#13111f'],
    track:{ title:'First Light', artist:'A世 Solenne', album:'Origin Set', year:2023, src:'mb', conf:'cover-art-archive' },
    lyric:'every pulse a ring the dark agreed to keep'
  },
  {
    id:'tide', name:'Tide', n:'12',
    preset:'Rest', bpm:64, a11y:'low', pairFrom:'original',
    desc:'Layered teal waves rolling on a low swell; bass lifts the crests, treble glints the spray. The calmest of the founding set.',
    palette:['#050a0c','#0d5060','#8cf2dd','#f2da8c','#0a1418'],
    track:{ title:'Slack Water', artist:'Maren Quay', album:'Origin Set', year:2023, src:'mb', conf:'release-group' },
    lyric:'the tide kept time the way the moon taught it'
  },
  {
    id:'cells', name:'Cells', n:'13',
    preset:'Flow', bpm:96, a11y:'medium', pairFrom:'original',
    desc:'A living voronoi of warm amber cells that drift and flare on the beat; the cursor pulls the lattice toward your pointer.',
    palette:['#160d08','#ff8c2e','#ffe680','#ffb84d','#1a120a'],
    track:{ title:'Honeycomb Hours', artist:'Del Rooke', album:'Origin Set', year:2024, src:'yt', conf:'video-thumbnail' },
    lyric:'the floor divided into rooms of light'
  },
  {
    id:'mercury', name:'Mercury', n:'14',
    preset:'Spark', bpm:108, a11y:'medium', pairFrom:'original',
    desc:'Chrome metaballs merging and splitting in a cool blue field, specular highlights warming on treble. Liquid metal on a beat.',
    palette:['#0a0b10','#5a6f9e','#eaf0ff','#7fb0ff','#15171f'],
    track:{ title:'Quicksilver', artist:'Ione Vask', album:'Origin Set', year:2024, src:'mb', conf:'cover-art-archive' },
    lyric:'two drops met and forgot they were ever apart'
  },
  {
    id:'lattice', name:'Lattice', n:'15',
    preset:'Drive', bpm:128, a11y:'high', pairFrom:'original',
    desc:'A magenta triangular grid that fattens and sparks on every beat, nodes flaring hot. The fastest, most electric original.',
    palette:['#0a0712','#5a2e8c','#ff5ad6','#ffb0f0','#120a1a'],
    track:{ title:'Node Voltage', artist:'Kessler Pry', album:'Origin Set', year:2025, src:'pl', conf:'generated' },
    lyric:'the grid agreed to light on the downbeat, every time'
  },
  {
    id:'aurora', name:'Aurora', n:'16',
    preset:'Flow', bpm:70, a11y:'low', pairFrom:'Phase \u00b7 Field',
    desc:'Waving sky curtains in green and violet drift over a faint starfield, brightening on beat. The cursor leans the bands sideways. Pulse’s rings, opened up into weather over the pole.',
    palette:['#03060f','#0a1f2a','#3ef0a0','#9d5cff','#06121c'],
    track:null, lyric:null
  },
  {
    id:'silk', name:'Silk', n:'17',
    preset:'Rest', bpm:62, a11y:'low', pairFrom:'Phase \u00b7 Field',
    desc:'Folded satin catching a slow light — cool indigo ridges roll across the frame with a soft sheen. The cursor warms a bloom into the cloth. Quieter and more tactile than Tide.',
    palette:['#0a0b14','#1b1f33','#7e86c4','#cfd2ec','#13141f'],
    track:null, lyric:null
  },
  {
    id:'contour', name:'Contour', n:'18',
    preset:'Flow', bpm:90, a11y:'low', pairFrom:'Phase \u00b7 Field',
    desc:'A topographic map that never stops being surveyed — isolines crawl across a drifting height field, going gold where your cursor passes. A cartographer’s answer to Cells.',
    palette:['#08100e','#13201c','#52c9a6','#e6c074','#0c1512'],
    track:null, lyric:null
  },
  {
    id:'solar', name:'Solar', n:'19',
    preset:'Spark', bpm:106, a11y:'medium', pairFrom:'Phase \u00b7 Field',
    desc:'A churning plasma surface — granulation and flares turning over a hot core, whitening on beat. The cursor drags the photosphere; clicks throw a coronal ripple. Mercury’s heat, not its chrome.',
    palette:['#0a0301','#3a0d04','#ff6a1e','#ffd27a','#160603'],
    track:null, lyric:null
  },
  {
    id:'circuit', name:'Circuit', n:'20',
    preset:'Drive', bpm:126, a11y:'high', pairFrom:'Phase \u00b7 Field',
    desc:'A backplane of glowing traces with data packets running the rows and columns, solder nodes flaring on beat. The cursor offsets the whole board. Lattice, routed and powered on.',
    palette:['#020605','#06140f','#2bd99a','#7afff0','#04100b'],
    track:null, lyric:null
  },
  {
    id:'cmyk', name:'CMYK', n:'21',
    preset:'Flow', bpm:92, a11y:'low', pairFrom:'Phase \u00b7 Field',
    desc:'Halftone, decomposed into process plates and screened additively in a rich green register — emerald, lime and teal dots glow over a deep forest gradient, black knocking them back. Cursor and beat ink up the press.',
    palette:['#04100a','#24f088','#9dff33','#16c79e','#06160d'],
    track:null, lyric:null
  },
  {
    id:'riso', name:'Riso', n:'22',
    preset:'Flow', bpm:90, a11y:'low', pairFrom:'Phase \u00b7 Field',
    desc:'A two-drum risograph pull on black stock in a rich red register — a scarlet-to-orange screen over a crimson-to-rose one, deliberately out of register so the luminous dots fringe and overlap. The cursor nudges the misregistration.',
    palette:['#100303','#ff2e29','#ff7520','#cf0a2c','#160405'],
    track:null, lyric:null
  },
  {
    id:'newsprint', name:'Newsprint', n:'23',
    preset:'Flow', bpm:88, a11y:'low', pairFrom:'Phase \u00b7 Field',
    desc:'A coarse photo screen inverted onto dark stock in a rich blue register — big dots glow from deep blue up to bright cyan across the frame, tone built from dot size alone. The cursor lifts the local exposure; the press thumps on beat.',
    palette:['#03060f','#2a6cff','#5cd6ff','#0c1f4a','#08122a'],
    track:null, lyric:null
  },
  {
    id:'benday', name:'Ben-Day', n:'24',
    preset:'Flow', bpm:94, a11y:'medium', pairFrom:'Phase \u00b7 Field',
    desc:'Pop-art panel logic — flat fields of red and yellow, Ben-Day dots filling the mid-tones, heavy black contours between zones. The cursor shoves the colour regions around. Halftone, shouting.',
    palette:['#f5f0e0','#e22d2d','#ffcf2e','#0a0810','#f0c0b0'],
    track:null, lyric:null
  },
  {
    id:'linescreen', name:'Line Screen', n:'25',
    preset:'Flow', bpm:90, a11y:'medium', pairFrom:'Phase \u00b7 Field',
    desc:'The engraver’s halftone — parallel lines that swell and thin with tone, bending like a banknote portrait. The cursor warps the burin path; beats deepen the cut. Dots traded for line weight.',
    palette:['#edeae0','#11141f','#3a4a6a','#9aa6c0','#0a0c12'],
    track:null, lyric:null
  },
  {
    id:'codex', name:'Codex', n:'26',
    preset:'Mono', bpm:100, a11y:'low', pairFrom:'OpenAI · the blossom knot',
    desc:'OpenAI’s monochrome restraint: an interwoven six-fold knot rotating against near-black, drawn only in greys and warm white. Loudness lifts the ink toward pure white; each beat flares the strands and nudges the rotation.',
    palette:['#050506','#3a3a40','#e8e8ea','#b8b8bc','#0e0e12'],
    track:null,
    lyric:'no colour, just the way the lines pass over and under'
  },
  {
    id:'qwen', name:'Qwen', n:'27',
    preset:'Bloom', bpm:92, a11y:'medium', pairFrom:'Alibaba · translucent bloom',
    desc:'Qwen’s violet identity as a breathing bloom — six translucent petals orbiting a luminous core, overlapping into magenta where they cross. Energy saturates the glass; the beat opens the flower and brightens its heart.',
    palette:['#120726','#5a24c0','#9a4cf0','#d96cf5','#1a0830'],
    track:null,
    lyric:'every petal a little more see-through than the last'
  },
  {
    id:'grok', name:'Grok', n:'28',
    preset:'Void', bpm:120, a11y:'medium', pairFrom:'xAI · the cosmic slash',
    desc:'A black hole hangs dead centre, its photon halo bending the starfield while the diagonal slash continues through it as an edge-on accretion disk. Bass thickens the horizon; onsets tear chromatic glitches through the disk.',
    palette:['#000000','#0a0a14','#ffffff','#3a4a7a','#06060a'],
    track:null,
    lyric:'one white line drawn straight through all that dark'
  },
  {
    id:'base44', name:'Base44', n:'29',
    preset:'Build', bpm:128, a11y:'high', pairFrom:'foundation blocks',
    desc:'Base44’s orange poured into foundations: an isometric field of amber blocks that build and settle in waves, top faces catching the light. The beat snaps whole ranks into place.',
    palette:['#1a0d02','#e8770f','#ffb43c','#c2540a','#0e0700'],
    track:null,
    lyric:'lay the base, then watch the rest stack itself'
  },
  {
    id:'replit', name:'Replit', n:'30',
    preset:'Run', bpm:112, a11y:'medium', pairFrom:'the coral terminal',
    desc:'Replit’s coral terminal is now a continuously scrolling buffer: fresh lines type themselves token by token, with a luminous caret riding the active line. Tempo controls the scroll and onsets strike the cursor.',
    palette:['#0c0e12','#f26207','#ff8a3c','#1c2230','#f0a55a'],
    track:null,
    lyric:'the cursor kept blinking like it had more to say'
  },
  {
    id:'innerspeaker', name:'Innerspeaker', n:'31',
    preset:'Flow', bpm:92, a11y:'medium', pairFrom:'Tame Impala · Innerspeaker',
    desc:'A procedural woodland mirage drawn from the supplied Innerspeaker wallpaper: mirrored tree columns ripple through a sunlit green valley while bass bends the horizon and highs wash the sky violet.',
    palette:['#08150e','#315f33','#a7ca68','#9f8ed8','#132519'],
    track:null,
    lyric:'the trees kept folding the afternoon back into itself'
  },
  {
    id:'redroom-sand', name:'Red Room Sand', n:'32',
    preset:'Rest', bpm:84, a11y:'medium', pairFrom:'Tame Impala · red room',
    desc:'Layered crimson dunes flow through a dark red room. Bass rolls the sand, mids open the far doorway, and treble sends a narrow hot shimmer across its edge.',
    palette:['#170504','#641612','#d45324','#ffb05c','#2b0907'],
    track:null,
    lyric:'the room was red enough to make the sand remember heat'
  },
  {
    id:'currents-sphere', name:'Currents Sphere', n:'33',
    preset:'Spark', bpm:108, a11y:'medium', pairFrom:'Tame Impala · Currents',
    desc:'A liquid chrome sphere holds a field of warped current lines. Bass swells its gravity, mids pull the bands around its surface, and bright onsets split cyan into coral.',
    palette:['#050711','#1b3f73','#66cce8','#e46876','#10182c'],
    track:null,
    lyric:'every current curved when it reached the centre'
  },
  {
    id:'tame-triptych', name:'Tame Impala Triptych', n:'34',
    preset:'Drive', bpm:104, a11y:'high', pairFrom:'Tame Impala · three-panel study',
    desc:'The supplied combined concept rebuilt as one procedural shader: Innerspeaker woodland, red-room dunes, and the Currents sphere share a three-panel audio-reactive field.',
    palette:['#07130d','#9dc35f','#b82f20','#56bde0','#171025'],
    track:null,
    lyric:'three rooms, one pulse moving through all of them'
  },
];
