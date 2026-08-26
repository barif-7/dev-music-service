/* Wallpaper palette → reader surface colours.

   The shell and the embedded reader each used to carry their own copy of this
   maths with the same constants (base [7,13,17], mix 0.42) — one in hex, one
   in normalized floats. They agreed only by hand. This is the single source;
   the reader now receives the resolved values in its scene. */
const WallpaperPalette = {
  base: [7, 13, 17],           // near-black the palette is pulled towards
  mix:  .42,                   // how much of the source colour survives
  hex:  /^#([0-9a-f]{6})$/i,

  /* Parse '#rrggbb' → [r,g,b] 0-255, or null when it isn't a hex colour. */
  parse(value){
    const match = this.hex.exec(String(value || ''));
    if(!match) return null;
    const numeric = Number.parseInt(match[1], 16);
    return [(numeric >> 16) & 255, (numeric >> 8) & 255, numeric & 255];
  },

  /* Pull a palette entry towards the reader's dark base. */
  soften(value, fallback){
    const source = this.parse(value);
    if(!source) return fallback;
    const blended = source.map((channel, i)=>Math.round(this.base[i] + (channel - this.base[i]) * this.mix));
    return `#${blended.map(c=>c.toString(16).padStart(2, '0')).join('')}`;
  },

  /* Softened palette entry as normalized [r,g,b], for shader uniforms. */
  rgb01(value, fallback){
    const source = this.parse(this.soften(value, null));
    return source ? source.map(channel=>channel / 255) : fallback;
  },

  /* The three stops the reader background is built from. */
  stops(wallpaper){
    const palette = wallpaper?.palette || [];
    return [
      this.soften(palette[0], '#142426'),
      this.soften(palette[1], '#171715'),
      this.soften(palette[2], '#18211b'),
    ];
  },

  /* The reader's soft background gradient. */
  gradient(wallpaper){
    const [first, second, third] = this.stops(wallpaper);
    return `radial-gradient(circle at 18% 8%, ${first} 0%, transparent 48%), `
         + `radial-gradient(circle at 84% 88%, ${third} 0%, transparent 52%), `
         + `linear-gradient(145deg, ${first}, ${second})`;
  },
};
