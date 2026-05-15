/* global React, ReactDOM, HamlayaScene, HAMLAYA_PROJECTS, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakSlider, TweakToggle, TweakColor */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "shaderMode": "aurora",
  "palette": "midnight",
  "intensity": 65,
  "day": false,
  "sound": true
}/*EDITMODE-END*/;

const SHADER_MODES = [
  { value: 'mountains', label: 'Mountains', code: 0 },
  { value: 'aurora',    label: 'Aurora',    code: 1 },
  { value: 'stardust',  label: 'Stardust',  code: 2 },
  { value: 'fractal',   label: 'Fractal',   code: 3 },
];

const PALETTES = {
  midnight: {
    label: 'Midnight',
    swatch: ['#0b1124', '#d4a04c', '#4a4e60'],
    skyTop: '#070912', skyBottom: '#1a1d2c',
    mountain: '#0a0c14', fog: '#4a4e60', accent: '#d4a04c',
  },
  sage: {
    label: 'Sage',
    swatch: ['#1a2620', '#a8c4a2', '#5a6b62'],
    skyTop: '#0e1814', skyBottom: '#1c2a25',
    mountain: '#0a0f0d', fog: '#5a6b62', accent: '#a8c4a2',
  },
  ember: {
    label: 'Ember',
    swatch: ['#1c1014', '#e08a5a', '#6b4a4e'],
    skyTop: '#120709', skyBottom: '#2a161c',
    mountain: '#140808', fog: '#6b4a4e', accent: '#e08a5a',
  },
};

// ── Audio: tiny Web Audio synth for hover ticks / whooshes. ──────────────
const audio = (() => {
  let ctx = null;
  let enabled = true;
  const ensure = () => {
    if (!ctx && typeof AudioContext !== 'undefined') {
      try { ctx = new AudioContext(); } catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  const tick = () => {
    if (!enabled) return;
    const c = ensure(); if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = 1800 + Math.random() * 400;
    g.gain.setValueAtTime(0.00001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.04, c.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.00001, c.currentTime + 0.07);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.08);
  };
  const whoosh = () => {
    if (!enabled) return;
    const c = ensure(); if (!c) return;
    const buf = c.createBuffer(1, c.sampleRate * 0.4, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const env = Math.pow(1 - i / d.length, 2);
      d[i] = (Math.random() * 2 - 1) * env * 0.18;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(400, c.currentTime);
    filt.frequency.exponentialRampToValueAtTime(2200, c.currentTime + 0.3);
    filt.Q.value = 1.4;
    src.connect(filt).connect(c.destination);
    src.start();
  };
  return {
    tick, whoosh,
    set: (v) => { enabled = !!v; if (v) ensure(); },
  };
})();

// ── Custom cursor (dual ring + dot, follows pointer, magnetic targets). ──
function useCustomCursor() {
  React.useEffect(() => {
    const dot = document.getElementById('cursor-dot');
    const ring = document.getElementById('cursor-ring');
    if (!dot || !ring) return undefined;

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let dx = mx, dy = my;
    let rx = mx, ry = my;
    let hover = 0, hoverTarget = 0;

    const move = (e) => { mx = e.clientX; my = e.clientY; };
    const onOver = (e) => {
      const t = e.target.closest('[data-cursor]');
      hoverTarget = t ? 1 : 0;
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseover', onOver);

    let raf;
    const tick = () => {
      dx += (mx - dx) * 0.5;
      dy += (my - dy) * 0.5;
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      hover += (hoverTarget - hover) * 0.15;
      dot.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      const ringScale = 1 + hover * 1.6;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) scale(${ringScale})`;
      ring.style.opacity = 0.5 + hover * 0.5;
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseover', onOver);
    };
  }, []);
}

// ── Magnetic hover hook: shifts target element toward cursor. ──────────
function useMagnetic(strength = 0.35) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    let raf, cx = 0, cy = 0, tx = 0, ty = 0, inside = false;
    const onMove = (e) => {
      if (!inside) return;
      const r = el.getBoundingClientRect();
      tx = (e.clientX - (r.left + r.width / 2)) * strength;
      ty = (e.clientY - (r.top + r.height / 2)) * strength;
    };
    const onEnter = () => { inside = true; audio.tick(); };
    const onLeave = () => { inside = false; tx = 0; ty = 0; };
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    window.addEventListener('mousemove', onMove);
    const animate = () => {
      cx += (tx - cx) * 0.18;
      cy += (ty - cy) * 0.18;
      el.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      raf = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('mousemove', onMove);
    };
  }, [strength]);
  return ref;
}

// ── Progressive text reveal: split text into spans, stagger opacity in. ─
// `children` may arrive as a string OR as a React element (the host wraps
// editable text in its own component when direct-edit is enabled). Walk the
// tree to collect the underlying string.
function reactChildrenToString(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(reactChildrenToString).join('');
  if (React.isValidElement(node)) return reactChildrenToString(node.props.children);
  return '';
}
function RevealText({ children, delay = 0, by = 'word', as: Tag = 'span', className }) {
  const text = reactChildrenToString(children);
  const parts = by === 'word' ? text.split(/(\s+)/) : Array.from(text);
  return (
    <Tag className={`reveal-text ${className || ''}`}>
      {parts.map((p, i) => p.match(/^\s+$/) ? p : (
        <span key={i} className="reveal-token" style={{ animationDelay: `${delay + i * 0.04}s` }}>
          <span className="reveal-inner">{p}</span>
        </span>
      ))}
    </Tag>
  );
}

// ── Magnetic anchor / button — accepts children, applies magnetic hook. ─
function Magnetic({ as: Tag = 'a', strength = 0.35, className = '', children, ...rest }) {
  const ref = useMagnetic(strength);
  return (
    <Tag ref={ref} className={`magnetic ${className}`} data-cursor="link" {...rest}>
      {children}
    </Tag>
  );
}

// ── Top nav. ───────────────────────────────────────────────────────────
function TopNav({ onAbout }) {
  return (
    <nav className="topnav">
      <Magnetic as="a" href="#" className="navlink" strength={0.28}>
        <span className="navdot" /> hamlaya
      </Magnetic>
      <div className="navlinks">
        <Magnetic as="a" href="#projects" className="navlink" strength={0.28}>Projects</Magnetic>
        <Magnetic as="a" href="#about" className="navlink" strength={0.28} onClick={(e) => { e.preventDefault(); onAbout(); }}>About</Magnetic>
        <Magnetic as="a" href="mailto:hello@hamlaya.studio" className="navlink" strength={0.28}>Contact</Magnetic>
      </div>
    </nav>
  );
}

// ── Hero with logo (which already contains the wordmark). Entry animation
// is a circular reveal + ping ring; once revealed, the logo gently follows
// the cursor in a parallax-like motion.
function Hero() {
  const followRef = React.useRef(null);
  React.useEffect(() => {
    const el = followRef.current;
    if (!el) return undefined;
    let raf;
    let tx = 0, ty = 0, cx = 0, cy = 0;
    let trz = 0, crz = 0;       // subtle rotate-Z based on horizontal drift
    const onMove = (e) => {
      const nx = e.clientX / window.innerWidth  - 0.5;   // -0.5..0.5
      const ny = e.clientY / window.innerHeight - 0.5;
      tx = nx * 32;
      ty = ny * 22;
      trz = nx * 1.8;            // gentle tilt
    };
    window.addEventListener('mousemove', onMove);
    const tick = () => {
      cx  += (tx  - cx ) * 0.05;
      cy  += (ty  - cy ) * 0.05;
      crz += (trz - crz) * 0.05;
      el.style.transform =
        `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0) rotate(${crz.toFixed(3)}deg)`;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);
  return (
    <header className="hero">
      <div className="hero-glyph" data-cursor="link">
        <div className="hero-glyph-follow" ref={followRef}>
          <div className="hero-glyph-mask">
            <img src="logo.png" alt="Hamlaya — mountain and moon" />
          </div>
        </div>
      </div>
    </header>
  );
}

// ── Constellation overlay: HTML bubbles anchored to 3D node positions.
// The bubble is BOTH the visual circle AND the hover/click target —
// raycasting a bobbing 3D sphere is fiddly, an HTML element is rock-solid.
// On hover, it expands and the project name appears INSIDE the circle.
// On click, opens the project's link in a new tab.
function ConstellationOverlay({ scene, projects, hoveredId, onHoverChange }) {
  const [positions, setPositions] = React.useState([]);
  React.useEffect(() => {
    if (!scene) return undefined;
    let raf;
    const update = () => {
      setPositions(scene.getNodeScreenPositions());
      raf = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(raf);
  }, [scene]);

  const byId = React.useMemo(() => {
    const m = {};
    for (const p of projects) m[p.id] = p;
    return m;
  }, [projects]);

  const openLink = (p) => {
    audio.whoosh();
    if (p.link) window.open(p.link, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="constellation-overlay">
      {positions.map((pos) => {
        const p = byId[pos.id];
        if (!p) return null;
        const isHover = hoveredId === pos.id;
        return (
          <div
            key={pos.id}
            className="node-anchor"
            style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, 0)` }}
          >
            <button
              type="button"
              className={`node-bubble ${isHover ? 'is-hover' : ''}`}
              style={{ '--node-color': p.color }}
              data-cursor="link"
              aria-label={`${p.title} — ${p.tagline}`}
              onMouseEnter={() => { audio.tick(); onHoverChange(p.id); }}
              onMouseLeave={() => onHoverChange(null)}
              onFocus={() => onHoverChange(p.id)}
              onBlur={() => onHoverChange(null)}
              onClick={() => openLink(p)}
            >
              <span className="node-bubble-disc">
                <span className="node-bubble-content">
                  <span className="node-bubble-meta">{p.year} · {p.status}</span>
                  <span className="node-bubble-title">{p.title}</span>
                  <span className="node-bubble-tagline">{p.tagline}</span>
                  <span className="node-bubble-cta">Visit ↗</span>
                </span>
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Project detail drawer. ────────────────────────────────────────────
function ProjectDrawer({ project, onClose }) {
  React.useEffect(() => {
    if (!project) return undefined;
    audio.whoosh();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [project, onClose]);

  return (
    <>
      <div className={`drawer-scrim ${project ? 'is-open' : ''}`} onClick={onClose} />
      <aside className={`drawer ${project ? 'is-open' : ''}`}>
        {project && (
          <div className="drawer-inner">
            <button className="drawer-close" data-cursor="link" onClick={onClose} aria-label="Close">✕</button>
            <div className="drawer-meta">
              <span className="drawer-dot" style={{ background: project.color }} />
              <span>{project.year}</span>
              <span>· {project.status}</span>
              <span>· {project.role}</span>
            </div>
            <h2 className="drawer-title">{project.title}</h2>
            <p className="drawer-tagline">{project.tagline}</p>
            <div className="drawer-placeholder" aria-label="Screenshot placeholder">
              <span>screenshot · 16:9</span>
            </div>
            <p className="drawer-body">{project.description}</p>
            <div className="drawer-techrow">
              {project.tech.map((t) => <span key={t} className="drawer-tech">{t}</span>)}
            </div>
            <div className="drawer-actions">
              <Magnetic as="button" className="btn btn-primary" strength={0.28}
                onClick={() => audio.tick()}>Visit project →</Magnetic>
              <Magnetic as="button" className="btn btn-ghost" strength={0.28}
                onClick={() => audio.tick()}>Devlog</Magnetic>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

// ── About drawer (simple). ─────────────────────────────────────────────
function AboutDrawer({ open, onClose }) {
  React.useEffect(() => {
    if (!open) return undefined;
    audio.whoosh();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <>
      <div className={`drawer-scrim ${open ? 'is-open' : ''}`} onClick={onClose} />
      <aside className={`drawer drawer-left ${open ? 'is-open' : ''}`}>
        {open && (
          <div className="drawer-inner">
            <button className="drawer-close" data-cursor="link" onClick={onClose} aria-label="Close">✕</button>
            <div className="drawer-meta"><span className="drawer-dot" />— about</div>
            <h2 className="drawer-title">A small studio.</h2>
            <p className="drawer-body">
              Hamlaya is a one-person game studio working at the intersection of slow narrative,
              hand-crafted simulation, and the quiet feeling of being somewhere very high up.
              The name means <em>my mountains</em>.
            </p>
            <p className="drawer-body">
              I write, design, code, and occasionally compose. I work from a small flat above the
              treeline and ship when the games are ready, not before.
            </p>
            <div className="drawer-actions">
              <Magnetic as="a" href="mailto:hello@hamlaya.studio" className="btn btn-primary" strength={0.28}>
                Say hello →
              </Magnetic>
              <Magnetic as="a" href="#" className="btn btn-ghost" strength={0.28}>Devlog feed</Magnetic>
            </div>
            <div className="drawer-foot">
              <span>Newsletter · @hamlaya · itch.io</span>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

// ── Status / hint corner pieces. ───────────────────────────────────────
function Footnotes({ hoveredId, project }) {
  return (
    <>
      <div className="cornerL">
        <span className="cornerL-dot" />
        <span>online · {new Date().getFullYear()}</span>
      </div>
      <div className="cornerR">
        <span>
          {project
            ? <>focused · <em>{project.title}</em></>
            : hoveredId
              ? <>hover · click to open</>
              : <>drift the cursor · click a node</>
          }
        </span>
      </div>
    </>
  );
}

// ── Root app. ───────────────────────────────────────────────────────────
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [scene, setScene] = React.useState(null);
  const [hoveredId, setHoveredId] = React.useState(null);

  useCustomCursor();

  // Init scene once.
  React.useEffect(() => {
    const canvas = document.getElementById('bg');
    const s = new window.HamlayaScene(canvas);
    s.setProjects(HAMLAYA_PROJECTS);
    s.start();
    setScene(s);
    return () => s.stop();
  }, []);

  // Push hover state into the scene so the shader can tint to the project color.
  React.useEffect(() => {
    if (!scene) return;
    const p = HAMLAYA_PROJECTS.find((x) => x.id === hoveredId);
    scene.setHoveredProject(hoveredId, p ? p.color : null);
  }, [scene, hoveredId]);

  // Scroll → drive shader + constellation parallax.
  React.useEffect(() => {
    if (!scene) return undefined;
    const onScroll = () => {
      const max = Math.max(1, document.body.scrollHeight - window.innerHeight);
      scene.setScroll(Math.min(1, Math.max(0, window.scrollY / max)));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [scene]);

  // Apply tweaks to scene.
  React.useEffect(() => {
    if (!scene) return;
    const mode = SHADER_MODES.find((m) => m.value === t.shaderMode) || SHADER_MODES[0];
    scene.setMode(mode.code);
  }, [scene, t.shaderMode]);
  React.useEffect(() => {
    if (!scene) return;
    scene.setIntensity(t.intensity / 100);
  }, [scene, t.intensity]);
  React.useEffect(() => {
    if (!scene) return;
    scene.setDay(t.day);
    document.documentElement.dataset.theme = t.day ? 'day' : 'night';
  }, [scene, t.day]);
  React.useEffect(() => {
    if (!scene) return;
    const pal = PALETTES[t.palette] || PALETTES.midnight;
    scene.setPalette(pal);
    document.documentElement.style.setProperty('--accent', pal.accent);
    document.documentElement.style.setProperty('--fog', pal.fog);
  }, [scene, t.palette]);
  React.useEffect(() => { audio.set(t.sound); }, [t.sound]);

  return (
    <>
      <Hero />
      <ConstellationOverlay scene={scene} projects={HAMLAYA_PROJECTS}
        hoveredId={hoveredId} onHoverChange={setHoveredId} />

      <TweaksPanel title="Hamlaya · Tweaks">
        <TweakSection label="Shader">
          <TweakRadio label="Style" value={t.shaderMode}
            options={SHADER_MODES.map((m) => ({ value: m.value, label: m.label }))}
            onChange={(v) => setTweak('shaderMode', v)} />
          <TweakSlider label="Intensity" value={t.intensity} min={20} max={100} unit="%"
            onChange={(v) => setTweak('intensity', v)} />
        </TweakSection>
        <TweakSection label="Mood">
          <TweakRadio label="Palette" value={t.palette}
            options={Object.entries(PALETTES).map(([k, v]) => ({ value: k, label: v.label }))}
            onChange={(v) => setTweak('palette', v)} />
          <TweakToggle label="Day mode" value={t.day} onChange={(v) => setTweak('day', v)} />
        </TweakSection>
        <TweakSection label="Audio">
          <TweakToggle label="Subtle sounds" value={t.sound} onChange={(v) => setTweak('sound', v)} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
