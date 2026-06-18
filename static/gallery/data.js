// Wallpaper metadata — extracted verbatim.
const ALTS = [
  {
    id:'drift', name:'Drift', n:'01',
    preset:'Flow', bpm:76, pairFrom:'Pulse',
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
    preset:'Rest', bpm:60, pairFrom:'Tide',
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
    preset:'Flow', bpm:92, pairFrom:'Cells',
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
    preset:'Spark', bpm:100, pairFrom:'Mercury',
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
    preset:'Drive', bpm:132, pairFrom:'Lattice',
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
    preset:'Flow', bpm:74, pairFrom:'Pulse',
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
    preset:'Rest', bpm:58, pairFrom:'Tide',
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
    preset:'Flow', bpm:94, pairFrom:'Cells',
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
    preset:'Spark', bpm:104, pairFrom:'Mercury',
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
    preset:'Drive', bpm:130, pairFrom:'Lattice',
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
    preset:'Flow', bpm:72, pairFrom:'original',
    desc:'The original orb: concentric rings bloom from the beat while the cursor warps the field. Bass swells the core, treble shimmers the halo.',
    palette:['#0d0f1e','#2e1438','#ff6a4d','#ffd9a8','#13111f'],
    track:{ title:'First Light', artist:'A世 Solenne', album:'Origin Set', year:2023, src:'mb', conf:'cover-art-archive' },
    lyric:'every pulse a ring the dark agreed to keep'
  },
  {
    id:'tide', name:'Tide', n:'12',
    preset:'Rest', bpm:64, pairFrom:'original',
    desc:'Layered teal waves rolling on a low swell; bass lifts the crests, treble glints the spray. The calmest of the founding set.',
    palette:['#050a0c','#0d5060','#8cf2dd','#f2da8c','#0a1418'],
    track:{ title:'Slack Water', artist:'Maren Quay', album:'Origin Set', year:2023, src:'mb', conf:'release-group' },
    lyric:'the tide kept time the way the moon taught it'
  },
  {
    id:'cells', name:'Cells', n:'13',
    preset:'Flow', bpm:96, pairFrom:'original',
    desc:'A living voronoi of warm amber cells that drift and flare on the beat; the cursor pulls the lattice toward your pointer.',
    palette:['#160d08','#ff8c2e','#ffe680','#ffb84d','#1a120a'],
    track:{ title:'Honeycomb Hours', artist:'Del Rooke', album:'Origin Set', year:2024, src:'yt', conf:'video-thumbnail' },
    lyric:'the floor divided into rooms of light'
  },
  {
    id:'mercury', name:'Mercury', n:'14',
    preset:'Spark', bpm:108, pairFrom:'original',
    desc:'Chrome metaballs merging and splitting in a cool blue field, specular highlights warming on treble. Liquid metal on a beat.',
    palette:['#0a0b10','#5a6f9e','#eaf0ff','#7fb0ff','#15171f'],
    track:{ title:'Quicksilver', artist:'Ione Vask', album:'Origin Set', year:2024, src:'mb', conf:'cover-art-archive' },
    lyric:'two drops met and forgot they were ever apart'
  },
  {
    id:'lattice', name:'Lattice', n:'15',
    preset:'Drive', bpm:128, pairFrom:'original',
    desc:'A magenta triangular grid that fattens and sparks on every beat, nodes flaring hot. The fastest, most electric original.',
    palette:['#0a0712','#5a2e8c','#ff5ad6','#ffb0f0','#120a1a'],
    track:{ title:'Node Voltage', artist:'Kessler Pry', album:'Origin Set', year:2025, src:'pl', conf:'generated' },
    lyric:'the grid agreed to light on the downbeat, every time'
  },
];
