// GLSL shaders for the hamlaya background scene.
// Single fragment shader with 4 modes selectable via u_mode uniform.
//   0 = misty mountains (default — echoes the logo)
//   1 = aurora (volumetric curtains)
//   2 = stardust (nebula + dense star field)
//   3 = fractal (domain-warped FBM)
window.HAMLAYA_SHADERS = {
  vertex: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragment: `
    precision highp float;
    varying vec2 vUv;

    uniform float u_time;
    uniform vec2  u_resolution;
    uniform vec2  u_mouse;        // 0..1
    uniform float u_mouseInfluence;
    uniform int   u_mode;
    uniform float u_intensity;
    uniform float u_day;          // 0 = night, 1 = day
    uniform vec3  u_skyTop;
    uniform vec3  u_skyBottom;
    uniform vec3  u_mountainColor;
    uniform vec3  u_fogColor;
    uniform vec3  u_accent;
    uniform float u_scroll;       // 0..1 scroll progress

    // ─── noise ─────────────────────────────────────────────────────────
    float hash11(float p) { return fract(sin(p * 127.1) * 43758.5453); }
    float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
        u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p *= 2.03;
        a *= 0.5;
      }
      return v;
    }

    // ─── stars helper ───────────────────────────────────────────────────
    vec3 starField(vec2 uv, float density, float speed) {
      vec3 col = vec3(0.0);
      vec2 g = uv * vec2(u_resolution.x, u_resolution.y) / 4.0;
      vec2 gi = floor(g);
      float h = hash21(gi);
      if (h > density) {
        float tw = 0.5 + 0.5 * sin(u_time * speed + h * 30.0);
        float size = hash21(gi + 7.0);
        col += vec3(tw * size);
      }
      return col;
    }

    // ─── mode 0: misty mountains ────────────────────────────────────────
    float ridge(float x, float seed, float scale) {
      return fbm(vec2(x * scale + seed * 13.0, seed));
    }

    vec3 mountainsScene(vec2 uv, vec2 m) {
      float aspect = u_resolution.x / u_resolution.y;
      // Sky vertical gradient.
      vec3 col = mix(u_skyBottom, u_skyTop, smoothstep(0.0, 1.0, uv.y));

      // Soft moon halo top-center-right — echoes the logo crescent.
      vec2 moon = vec2(0.58, 0.78);
      vec2 d = (uv - moon) * vec2(aspect, 1.0);
      float dm = length(d);
      float halo = exp(-dm * 4.0) * 0.45 + exp(-dm * 14.0) * 0.55;
      col += u_accent * halo * 0.55;
      // Moon disk
      float disk = smoothstep(0.055, 0.045, dm);
      col = mix(col, u_accent * 1.3, disk * 0.85);

      // Faint stars in the upper sky.
      col += starField(uv, 0.995, 1.5) * smoothstep(0.35, 1.0, uv.y) * 0.8;

      // Mountain layers, back to front. Parallax with mouse + scroll.
      for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float depth = fi / 4.0;
        float par = (m.x - 0.5) * (0.02 + fi * 0.012) + u_scroll * (0.02 + fi * 0.005);
        float par_y = (m.y - 0.5) * 0.008 * fi - u_scroll * 0.04 * (1.0 - depth);
        float scale = 1.2 + fi * 1.4;
        float amp = 0.16 - fi * 0.018;
        float base = 0.18 + fi * 0.055;
        float r = ridge(uv.x + par, fi * 7.0 + 3.1, scale);
        float horizon = base + r * amp;
        float dist = horizon - (uv.y + par_y);
        float silhouette = smoothstep(0.0, 0.002, dist);

        // Tint each layer toward the fog as it recedes.
        vec3 layerCol = mix(u_mountainColor, u_fogColor, (1.0 - depth) * 0.78);
        // Snow caps on the closer layers — thin streak near the ridge top.
        float snow = smoothstep(0.0, 0.018, dist) - smoothstep(0.018, 0.038, dist);
        snow *= step(0.5, depth) * 0.55;
        layerCol = mix(layerCol, mix(u_fogColor * 1.5, vec3(0.95, 0.92, 0.88), 0.6), snow);

        col = mix(col, layerCol, silhouette);
      }

      // Drifting ground fog.
      float fogN = fbm(uv * vec2(3.0, 6.0) + vec2(u_time * 0.04, u_time * 0.02));
      float groundFog = smoothstep(0.4, 0.0, uv.y) * (0.45 + 0.55 * fogN);
      col = mix(col, u_fogColor, groundFog * 0.5);

      // Water reflection at the very bottom — subtle but visible wave motion.
      float waterLine = 0.22;
      if (uv.y < waterLine) {
        float water = uv.y / waterLine;          // 0 = deep, 1 = shoreline
        // Sample the sky above for a faked reflection by mirroring uv.y.
        vec2 ruv = vec2(uv.x, waterLine + (waterLine - uv.y) * 0.85);
        // Multi-octave ripples drifting horizontally — wider waves further out,
        // tighter ripples near the camera. Subtle vertical UV warp creates
        // the impression of a moving surface.
        float w1 = sin(uv.x * 18.0 + u_time * 0.45) * 0.5 + 0.5;
        float w2 = sin(uv.x * 42.0 - u_time * 0.85 + sin(uv.x * 6.0 + u_time * 0.3) * 1.6) * 0.5 + 0.5;
        float w3 = sin(uv.x * 95.0 + u_time * 1.8) * 0.5 + 0.5;
        float waves = (w1 * 0.55 + w2 * 0.35 + w3 * 0.15);
        // Reflected color: darker, tinted by the sky bottom, with subtle FBM caustic.
        float caustic = fbm(vec2(uv.x * 6.0 + u_time * 0.2, uv.y * 20.0 - u_time * 0.4));
        vec3 reflectCol = mix(u_skyBottom * 0.55, u_fogColor * 0.6, water);
        reflectCol = mix(reflectCol, reflectCol * (0.6 + caustic * 0.8), 0.5);
        // Gold highlights from the moon — concentrated near horizon center.
        float moonReflect = exp(-pow((uv.x - 0.58) * 3.5, 2.0)) * (1.0 - water * 0.6);
        reflectCol += u_accent * waves * moonReflect * 0.55;
        // Long horizontal wave crests catching light across the surface.
        float crest = smoothstep(0.78, 0.92, waves) * (0.4 + 0.6 * (1.0 - water));
        reflectCol += u_accent * crest * 0.18;
        // Blend with original color at the shoreline.
        col = mix(reflectCol, col, smoothstep(0.0, waterLine, uv.y) * 0.25);
      }

      return col;
    }

    // ─── mode 1: aurora ─────────────────────────────────────────────────
    vec3 auroraScene(vec2 uv, vec2 m) {
      vec3 col = mix(u_skyBottom * 0.6, u_skyTop * 0.4, uv.y);
      col += starField(uv, 0.992, 1.2) * 0.9;

      // Three curtains of warped FBM.
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        vec2 p = uv * vec2(1.3, 0.7) + vec2(u_time * (0.025 + fi * 0.015), -fi * 0.4);
        float warp = fbm(p * 1.5 + u_time * 0.08);
        float n = fbm(p + vec2(warp * 2.0, 0.0));
        float curtain = smoothstep(0.46, 0.56, n) * (1.0 - smoothstep(0.56, 0.74, n));
        curtain *= smoothstep(0.1, 0.55, uv.y) * smoothstep(1.05, 0.45, uv.y);
        vec3 ac = mix(u_accent, vec3(0.35, 0.85, 0.7), fi / 2.5);
        col += ac * curtain * 1.1;
      }

      // Distant mountains silhouette at the bottom — sways gently like a slow wave.
      // Three layers, each drifting at a different speed for parallax.
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float depth = fi / 2.0;                    // 0 = back, 1 = front
        float drift = u_time * (0.04 + fi * 0.025);
        float r = fbm(vec2(uv.x * (2.4 + fi * 1.6) + drift, 1.7 + fi * 3.1));
        // Long, slow sine sway across the whole horizon.
        float sway = sin(uv.x * 3.0 + u_time * 0.25 + fi * 1.3) * 0.012
                   + sin(uv.x * 1.4 - u_time * 0.18) * 0.008;
        float horizon = 0.10 + fi * 0.045 + r * (0.035 + fi * 0.015) + sway;
        float mask = smoothstep(0.002, 0.0, uv.y - horizon);
        vec3 mc = mix(u_mountainColor * 0.35, u_mountainColor * 0.7, depth);
        col = mix(col, mc, mask);
      }
      // Subtle water shimmer at the very bottom — same wave language as the silhouette.
      if (uv.y < 0.09) {
        float w = sin(uv.x * 22.0 + u_time * 0.6) * 0.5 + 0.5;
        w *= sin(uv.x * 58.0 - u_time * 1.1) * 0.5 + 0.5;
        col += u_accent * w * 0.05 * (1.0 - uv.y / 0.09);
      }

      return col;
    }

    // ─── mode 2: stardust ───────────────────────────────────────────────
    vec3 stardustScene(vec2 uv, vec2 m) {
      vec3 col = mix(u_skyBottom * 0.5, u_skyTop * 0.3, uv.y);

      // Nebula clouds.
      vec2 p = uv * 2.0 + vec2(u_time * 0.01, 0.0);
      float n = fbm(p + fbm(p + u_time * 0.05));
      n = pow(n, 1.8);
      vec3 neb = mix(u_accent, vec3(0.4, 0.25, 0.7), uv.y);
      col += neb * n * 0.4;

      // Dense fine stars.
      col += starField(uv, 0.93, 2.5) * 1.2;
      // Brighter sparse stars in accent.
      vec2 g2 = uv * vec2(u_resolution.x, u_resolution.y) / 12.0;
      float h = hash21(floor(g2));
      if (h > 0.985) {
        float tw = 0.5 + 0.5 * sin(u_time * 3.0 + h * 50.0);
        col += u_accent * tw * 1.8;
      }
      return col;
    }

    // ─── mode 3: fractal ────────────────────────────────────────────────
    vec3 fractalScene(vec2 uv, vec2 m) {
      vec2 p = (uv - 0.5) * 3.0;
      vec2 q = vec2(fbm(p + u_time * 0.04), fbm(p + vec2(5.2, 1.3) + u_time * 0.04));
      vec2 r = vec2(fbm(p + 2.5 * q + vec2(1.7, 9.2)),
                    fbm(p + 2.5 * q + vec2(8.3, 2.8) + u_time * 0.05));
      float f = fbm(p + 3.0 * r);
      vec3 col = mix(u_skyBottom, u_skyTop, f);
      col = mix(col, u_accent, smoothstep(0.45, 0.85, length(r)));
      col = mix(col, u_mountainColor, smoothstep(0.75, 1.0, f));
      // Tiny stars overlay.
      col += starField(uv, 0.998, 1.0) * 0.5;
      return col;
    }

    // ─── main ───────────────────────────────────────────────────────────
    void main() {
      vec2 uv = vUv;
      vec2 m = u_mouse;
      vec3 col;

      if (u_mode == 0)      col = mountainsScene(uv, m);
      else if (u_mode == 1) col = auroraScene(uv, m);
      else if (u_mode == 2) col = stardustScene(uv, m);
      else                  col = fractalScene(uv, m);

      // Mouse glow / shader distortion on hover.
      float aspect = u_resolution.x / u_resolution.y;
      vec2 mDelta = (uv - m) * vec2(aspect, 1.0);
      float md = length(mDelta);
      col += u_accent * exp(-md * 5.5) * 0.18 * u_mouseInfluence;

      // Day mode: lift values, warm tint.
      vec3 dayCol = col * 1.8 + vec3(0.15, 0.12, 0.08);
      dayCol = mix(col, dayCol, 0.85);
      col = mix(col, dayCol, u_day);

      // Intensity master.
      col *= mix(0.55, 1.25, u_intensity);

      // Subtle vignette.
      float vig = smoothstep(1.4, 0.4, length(uv - 0.5) * 1.8);
      col *= mix(0.85, 1.0, vig);

      // Filmic-ish curve.
      col = col / (col + 0.55);
      col = pow(col, vec3(0.85));

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
