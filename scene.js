// Three.js scene: full-screen shader background + floating 3D constellation
// of project nodes. Vanilla JS — the React layer (app.jsx) reads node screen
// positions every frame to anchor HTML labels.

(function () {
  class HamlayaScene {
    constructor(canvas) {
      this.canvas = canvas;
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.autoClear = false;

      // Background shader pass (orthographic, fullscreen quad).
      this.bgScene = new THREE.Scene();
      this.bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.uniforms = {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(1, 1) },
        u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
        u_mouseInfluence: { value: 0.0 },
        u_mode: { value: 0 },
        u_intensity: { value: 0.85 },
        u_day: { value: 0.0 },
        u_skyTop: { value: new THREE.Color('#070912') },
        u_skyBottom: { value: new THREE.Color('#1a1d2c') },
        u_mountainColor: { value: new THREE.Color('#0a0c14') },
        u_fogColor: { value: new THREE.Color('#4a4e60') },
        u_accent: { value: new THREE.Color('#d4a04c') },
        u_scroll: { value: 0 },
      };
      const bgMat = new THREE.ShaderMaterial({
        vertexShader: HAMLAYA_SHADERS.vertex,
        fragmentShader: HAMLAYA_SHADERS.fragment,
        uniforms: this.uniforms,
        depthWrite: false,
        depthTest: false,
      });
      const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
      bg.frustumCulled = false;
      this.bgScene.add(bg);

      // Foreground scene for the 3D constellation.
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      this.camera.position.set(0, 0, 6);

      this.constellation = new THREE.Group();
      this.scene.add(this.constellation);

      this.nodes = [];
      this.lines = null;

      // Mouse tracking — feeds the shader uniform (glow) + constellation tilt.
      // Hover detection is driven from the HTML overlay (more reliable on small
      // bobbing 3D spheres than a raycaster), via setHoveredProject().
      this.mouse = new THREE.Vector2(0.5, 0.5);
      this.mouseTarget = new THREE.Vector2(0.5, 0.5);
      this.mouseInfluence = 0;
      this.mouseInfluenceTarget = 0;

      // Raycaster + hover state. The HTML overlay drives hover via
      // setHoveredProject(); the raycaster instance is still around in case
      // other parts of the app want to query the 3D scene by cursor position.
      this.raycaster = new THREE.Raycaster();
      this.ndc = new THREE.Vector2();
      this.hoveredId = null;
      this.onFrame = null;

      // Color tinting: when a project is hovered, the shader's accent uniform
      // lerps toward that project's color (and the fog picks up some too).
      // baseAccent/baseFog hold the palette-selected values so we can lerp back.
      this.baseAccent = new THREE.Color('#d4a04c');
      this.baseFog    = new THREE.Color('#4a4e60');
      this.targetAccent = this.baseAccent.clone();
      this.targetFog    = this.baseFog.clone();

      this._onResize = this.resize.bind(this);
      this._onMove = this._handleMove.bind(this);
      this._onLeave = this._handleLeave.bind(this);
      window.addEventListener('resize', this._onResize);
      window.addEventListener('mousemove', this._onMove);
      window.addEventListener('mouseleave', this._onLeave);

      this.scrollProgress = 0;
      this._scrollTarget = 0;

      this.resize();
      this.clock = new THREE.Clock();
    }

    setProjects(projects) {
      // Tear down existing nodes.
      for (const n of this.nodes) {
        n.mesh.geometry.dispose();
        n.mesh.material.dispose();
        if (n.glow) {
          n.glow.geometry.dispose();
          n.glow.material.dispose();
        }
        this.constellation.remove(n.mesh);
        if (n.glow) this.constellation.remove(n.glow);
      }
      if (this.lines) {
        this.lines.geometry.dispose();
        this.lines.material.dispose();
        this.constellation.remove(this.lines);
      }
      this.nodes = [];

      for (const p of projects) {
        const color = new THREE.Color(p.color || '#e2b86c');
        // Glass body sphere — ethereal: transparent core, fresnel rim, animated
        // noise drifting inside. The HTML bubble overlays it for the hover menu.
        const geo = new THREE.SphereGeometry(0.18 * (p.size || 1), 48, 32);
        const mat = new THREE.ShaderMaterial({
          uniforms: {
            u_color: { value: color.clone() },
            u_time: { value: 0 },
            u_hover: { value: 0 },
          },
          vertexShader: `
            varying vec3 vNormal;
            varying vec3 vView;
            varying vec3 vPos;
            void main() {
              vNormal = normalize(normalMatrix * normal);
              vec4 mv = modelViewMatrix * vec4(position, 1.0);
              vView = normalize(-mv.xyz);
              vPos = position;
              gl_Position = projectionMatrix * mv;
            }
          `,
          fragmentShader: `
            varying vec3 vNormal;
            varying vec3 vView;
            varying vec3 vPos;
            uniform vec3 u_color;
            uniform float u_time;
            uniform float u_hover;

            float hash(vec3 p) {
              return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
            }
            float vnoise(vec3 p) {
              vec3 i = floor(p);
              vec3 f = fract(p);
              f = f * f * (3.0 - 2.0 * f);
              float n000 = hash(i);
              float n100 = hash(i + vec3(1.0, 0.0, 0.0));
              float n010 = hash(i + vec3(0.0, 1.0, 0.0));
              float n110 = hash(i + vec3(1.0, 1.0, 0.0));
              float n001 = hash(i + vec3(0.0, 0.0, 1.0));
              float n101 = hash(i + vec3(1.0, 0.0, 1.0));
              float n011 = hash(i + vec3(0.0, 1.0, 1.0));
              float n111 = hash(i + vec3(1.0, 1.0, 1.0));
              return mix(
                mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
                mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
                f.z);
            }

            void main() {
              // Fresnel rim — strong at glancing angles, fades to transparent in the middle.
              float ndv = max(dot(vNormal, vView), 0.0);
              float fres = pow(1.0 - ndv, 2.4);

              // Animated cloud inside the sphere — drifts slowly, gives "ether" feel.
              vec3 q = vPos * 3.2 + vec3(u_time * 0.18, u_time * 0.13, u_time * 0.09);
              float n = vnoise(q) * 0.6 + vnoise(q * 2.1) * 0.3 + vnoise(q * 4.3) * 0.15;
              n = smoothstep(0.35, 0.85, n);

              // Inner luminance: brighter at the center, modulated by the cloud.
              float inner = (1.0 - fres) * (0.18 + n * 0.55);

              vec3 col = u_color * (0.55 + fres * 1.8 + inner * 1.4) + vec3(n * 0.04);
              float alpha = fres * (0.72 + u_hover * 0.25) + inner * 0.55;
              alpha = clamp(alpha, 0.0, 0.94);

              gl_FragColor = vec4(col, alpha);
            }
          `,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
        mesh.userData = { project: p, basePos: mesh.position.clone(), phase: Math.random() * Math.PI * 2 };
        this.constellation.add(mesh);

        // Soft outer halo — back-facing fresnel sphere for the bloom-around-it look.
        const glowGeo = new THREE.SphereGeometry(0.55 * (p.size || 1), 32, 20);
        const glowMat = new THREE.ShaderMaterial({
          uniforms: {
            u_color: { value: color.clone() },
            u_intensity: { value: 0.38 },
            u_hover: { value: 0 },
          },
          vertexShader: `
            varying vec3 vNormal;
            varying vec3 vView;
            void main() {
              vNormal = normalize(normalMatrix * normal);
              vec4 mv = modelViewMatrix * vec4(position, 1.0);
              vView = normalize(-mv.xyz);
              gl_Position = projectionMatrix * mv;
            }
          `,
          fragmentShader: `
            varying vec3 vNormal;
            varying vec3 vView;
            uniform vec3 u_color;
            uniform float u_intensity;
            uniform float u_hover;
            void main() {
              float fres = pow(1.0 - max(dot(vNormal, vView), 0.0), 3.2);
              float a = fres * (u_intensity + u_hover * 0.55);
              gl_FragColor = vec4(u_color * (1.0 + u_hover * 0.5), a);
            }
          `,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.BackSide,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.copy(mesh.position);
        this.constellation.add(glow);

        this.nodes.push({ project: p, mesh, glow, hover: 0 });
      }

      // Connecting lines — connect each node to its 2 nearest neighbours.
      const positions = [];
      const colors = [];
      const linkColor = new THREE.Color('#c9b48a');
      const used = new Set();
      for (let i = 0; i < this.nodes.length; i++) {
        const a = this.nodes[i].mesh.position;
        const dists = this.nodes
          .map((n, j) => ({ j, d: a.distanceTo(n.mesh.position) }))
          .filter((x) => x.j !== i)
          .sort((x, y) => x.d - y.d);
        for (let k = 0; k < Math.min(2, dists.length); k++) {
          const j = dists[k].j;
          const key = i < j ? `${i}-${j}` : `${j}-${i}`;
          if (used.has(key)) continue;
          used.add(key);
          const b = this.nodes[j].mesh.position;
          positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
          colors.push(linkColor.r, linkColor.g, linkColor.b, linkColor.r, linkColor.g, linkColor.b);
        }
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      lg.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const lm = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.lines = new THREE.LineSegments(lg, lm);
      this.constellation.add(this.lines);
    }

    setMode(mode) { this.uniforms.u_mode.value = mode | 0; }
    setIntensity(v) { this.uniforms.u_intensity.value = v; }
    setDay(v) { this.uniforms.u_day.value = v ? 1 : 0; }

    setPalette(p) {
      this.uniforms.u_skyTop.value.set(p.skyTop);
      this.uniforms.u_skyBottom.value.set(p.skyBottom);
      this.uniforms.u_mountainColor.value.set(p.mountain);
      this.uniforms.u_fogColor.value.set(p.fog);
      this.uniforms.u_accent.value.set(p.accent);
      // Remember the palette base so hover-tinting can lerp back to it.
      this.baseAccent.set(p.accent);
      this.baseFog.set(p.fog);
      if (!this.hoveredId) {
        this.targetAccent.copy(this.baseAccent);
        this.targetFog.copy(this.baseFog);
      }
    }

    // Externally-driven hover state. Pass a project id (or null) and its
    // color; the shader will tint toward that color over the next few frames.
    setHoveredProject(id, colorHex) {
      this.hoveredId = id;
      if (id && colorHex) {
        const c = new THREE.Color(colorHex);
        // Blend the project color with the base accent so it doesn't fully
        // dominate — keeps the scene from looking like a single flat hue.
        this.targetAccent.copy(this.baseAccent).lerp(c, 0.75);
        this.targetFog.copy(this.baseFog).lerp(c, 0.35);
      } else {
        this.targetAccent.copy(this.baseAccent);
        this.targetFog.copy(this.baseFog);
      }
    }

    setScroll(p) { this._scrollTarget = p; }

    _handleMove(e) {
      const x = e.clientX / window.innerWidth;
      const y = 1 - e.clientY / window.innerHeight;
      this.mouseTarget.set(x, y);
      this.mouseInfluenceTarget = 1;
    }
    _handleLeave() { this.mouseInfluenceTarget = 0; }

    resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.uniforms.u_resolution.value.set(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }

    project3DToScreen(vec3, out) {
      const v = vec3.clone().project(this.camera);
      out.x = (v.x * 0.5 + 0.5) * window.innerWidth;
      out.y = (-v.y * 0.5 + 0.5) * window.innerHeight;
      out.z = v.z;
      return out;
    }

    getNodeScreenPositions() {
      const out = [];
      const proj = { x: 0, y: 0, z: 0 };
      const tmp = new THREE.Vector3();
      // Use the WORLD position so the constellation group's rotation (driven
      // by mouse tilt) is reflected in the bubble's screen coordinates.
      // Without this the HTML bubbles drift off the visible 3D dot.
      this.constellation.updateMatrixWorld();
      for (const n of this.nodes) {
        n.mesh.getWorldPosition(tmp);
        this.project3DToScreen(tmp, proj);
        out.push({
          id: n.project.id,
          x: proj.x,
          y: proj.y,
          z: proj.z,
          hover: n.hover,
        });
      }
      return out;
    }

    start() {
      const tick = () => {
        this._raf = requestAnimationFrame(tick);
        this.render();
      };
      tick();
    }

    stop() {
      if (this._raf) cancelAnimationFrame(this._raf);
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('mousemove', this._onMove);
      window.removeEventListener('mouseleave', this._onLeave);
    }

    render() {
      const t = this.clock.getElapsedTime();
      const dt = Math.min(0.05, this.clock.getDelta() || 0.016);

      // Smooth mouse follow.
      this.mouse.lerp(this.mouseTarget, 0.08);
      this.mouseInfluence += (this.mouseInfluenceTarget - this.mouseInfluence) * 0.06;
      this.uniforms.u_mouse.value.copy(this.mouse);
      this.uniforms.u_mouseInfluence.value = this.mouseInfluence;
      this.uniforms.u_time.value = t;

      // Smooth scroll follow.
      this.scrollProgress += (this._scrollTarget - this.scrollProgress) * 0.08;
      this.uniforms.u_scroll.value = this.scrollProgress;

      // Lerp shader accent + fog toward target (project hover tint).
      this.uniforms.u_accent.value.lerp(this.targetAccent, 0.06);
      this.uniforms.u_fogColor.value.lerp(this.targetFog, 0.06);

      // Constellation: gentle drift + mouse tilt + scroll dolly.
      const tilt = (this.mouse.x - 0.5) * 0.25;
      const tiltY = (this.mouse.y - 0.5) * 0.18;
      this.constellation.rotation.y += (tilt - this.constellation.rotation.y) * 0.04;
      this.constellation.rotation.x += (-tiltY - this.constellation.rotation.x) * 0.04;
      this.constellation.position.y = -this.scrollProgress * 0.8;

      // Each node bobs and pulses; hover scales it up.
      const hoveredId = this.hoveredId;
      for (const n of this.nodes) {
        const base = n.mesh.userData.basePos;
        const ph = n.mesh.userData.phase;
        const bob = Math.sin(t * 0.6 + ph) * 0.06;
        const sway = Math.cos(t * 0.4 + ph * 1.3) * 0.04;
        n.mesh.position.set(base.x + sway, base.y + bob, base.z);
        n.glow.position.copy(n.mesh.position);

        n.mesh.material.uniforms.u_time.value = t + ph;

        const want = (hoveredId === n.project.id) ? 1 : 0;
        n.hover += (want - n.hover) * 0.12;
        const s = 1 + n.hover * 0.6;
        n.mesh.scale.setScalar(s);
        n.glow.scale.setScalar(1 + n.hover * 0.4);
        n.glow.material.uniforms.u_hover.value = n.hover;
        n.mesh.material.uniforms.u_hover.value = n.hover;
      }

      // Render: background first (no depth), then constellation.
      this.renderer.clear();
      this.renderer.render(this.bgScene, this.bgCamera);
      this.renderer.clearDepth();
      this.renderer.render(this.scene, this.camera);

      if (this.onFrame) this.onFrame();
    }
  }

  window.HamlayaScene = HamlayaScene;
})();
