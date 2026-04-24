const canvas = document.querySelector(".frost-canvas");
const context = canvas.getContext("2d");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const PALETTE = [
  { r: 247, g: 242, b: 220 },
  { r: 247, g: 242, b: 220 },
  { r: 216, g: 195, b: 106 },
  { r: 199, g: 238, b: 231 },
  { r: 110, g: 141, b: 122 },
];

const LAYERS = [
  { count: 0.55, sizeMin: 0.4, sizeMax: 1.4, driftMin: 0.05, driftMax: 0.18, parallax: 4, alphaMin: 0.14, alphaMax: 0.38 },
  { count: 0.3, sizeMin: 1.1, sizeMax: 2.6, driftMin: 0.12, driftMax: 0.32, parallax: 10, alphaMin: 0.22, alphaMax: 0.55 },
  { count: 0.15, sizeMin: 2.8, sizeMax: 6.5, driftMin: 0.22, driftMax: 0.5, parallax: 22, alphaMin: 0.08, alphaMax: 0.22 },
];

const particles = [];
let width = 0;
let height = 0;
let animationFrame = 0;
let lastTime = 0;

const depth = {
  currentX: 0,
  currentY: 0,
  targetX: 0,
  targetY: 0,
};

function setDepthVariables(x, y) {
  document.body.style.setProperty("--field-x", `${x * 8}px`);
  document.body.style.setProperty("--field-y", `${y * 8}px`);
  document.body.style.setProperty("--logo-x", `${x * 12}px`);
  document.body.style.setProperty("--logo-y", `${y * 9}px`);
  document.body.style.setProperty("--logo-tilt-x", `${y * -2.2}deg`);
  document.body.style.setProperty("--logo-tilt-y", `${x * 2.4}deg`);
  document.body.style.setProperty("--aurora-x", `${x * -18}px`);
  document.body.style.setProperty("--aurora-y", `${y * -12}px`);
  document.body.style.setProperty("--tile-x", `${x * 5}px`);
  document.body.style.setProperty("--tile-y", `${y * 3}px`);
}

function updateDepth() {
  depth.currentX += (depth.targetX - depth.currentX) * 0.06;
  depth.currentY += (depth.targetY - depth.currentY) * 0.06;
  setDepthVariables(depth.currentX, depth.currentY);
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function spawnParticle(layerIndex, forceY) {
  const layer = LAYERS[layerIndex];
  const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  return {
    layer: layerIndex,
    x: Math.random() * width,
    y: forceY == null ? Math.random() * height : forceY,
    size: randomBetween(layer.sizeMin, layer.sizeMax),
    drift: randomBetween(layer.driftMin, layer.driftMax),
    sway: randomBetween(0.25, 0.9),
    phase: Math.random() * Math.PI * 2,
    alpha: randomBetween(layer.alphaMin, layer.alphaMax),
    twinkle: randomBetween(0.4, 1),
    color,
    isBokeh: layerIndex === 2,
  };
}

function populateParticles() {
  particles.length = 0;
  const density = Math.min(1.2, Math.max(0.55, width / 1600));
  LAYERS.forEach((layer, index) => {
    const base = Math.round((width / 16) * layer.count * density);
    const count = Math.max(10, Math.min(140, base));
    for (let i = 0; i < count; i += 1) {
      particles.push(spawnParticle(index));
    }
  });
}

function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  populateParticles();
}

function drawBokeh(p, parallaxX, parallaxY, alpha) {
  const x = p.x + parallaxX;
  const y = p.y + parallaxY;
  const radius = p.size;
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${alpha})`);
  gradient.addColorStop(0.4, `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${alpha * 0.35})`);
  gradient.addColorStop(1, `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, 0)`);
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function drawFleck(p, parallaxX, parallaxY, alpha) {
  const x = p.x + parallaxX;
  const y = p.y + parallaxY;
  context.fillStyle = `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${alpha})`;
  context.beginPath();
  context.arc(x, y, p.size, 0, Math.PI * 2);
  context.fill();
}

function drawConstellation(points) {
  const maxDist = 110;
  const maxDistSq = maxDist * maxDist;
  context.lineWidth = 0.6;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    for (let j = i + 1; j < points.length; j += 1) {
      const b = points[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < maxDistSq) {
        const fade = 1 - distSq / maxDistSq;
        context.strokeStyle = `rgba(216, 195, 106, ${fade * 0.11})`;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
    }
  }
}

function draw(time) {
  if (!lastTime) {
    lastTime = time;
  }
  const delta = Math.min(50, time - lastTime) / 16.67;
  lastTime = time;

  updateDepth();
  context.clearRect(0, 0, width, height);

  const sheen = context.createLinearGradient(0, 0, width, height);
  sheen.addColorStop(0, "rgba(199, 238, 231, 0.025)");
  sheen.addColorStop(0.45, "rgba(216, 195, 106, 0.05)");
  sheen.addColorStop(1, "rgba(247, 242, 220, 0.02)");
  context.fillStyle = sheen;
  context.fillRect(0, 0, width, height);

  const midLayerPoints = [];

  particles.forEach((p) => {
    const layer = LAYERS[p.layer];
    const sway = Math.sin(time * 0.0005 + p.phase) * p.sway;
    const twinkle = 0.75 + Math.sin(time * 0.0017 + p.phase * 1.4) * 0.25 * p.twinkle;

    p.y -= p.drift * delta;
    p.x += sway * 0.12 * delta;

    if (p.y < -p.size * 2) {
      Object.assign(p, spawnParticle(p.layer, height + p.size * 2));
    }
    if (p.x < -p.size * 2) {
      p.x = width + p.size;
    } else if (p.x > width + p.size * 2) {
      p.x = -p.size;
    }

    const parallaxX = -depth.currentX * layer.parallax;
    const parallaxY = -depth.currentY * layer.parallax;
    const alpha = p.alpha * twinkle;

    if (p.isBokeh) {
      drawBokeh(p, parallaxX, parallaxY, alpha);
    } else {
      drawFleck(p, parallaxX, parallaxY, alpha);
      if (p.layer === 1) {
        midLayerPoints.push({ x: p.x + parallaxX, y: p.y + parallaxY });
      }
    }
  });

  drawConstellation(midLayerPoints);

  animationFrame = window.requestAnimationFrame(draw);
}

function start() {
  resize();
  if (!prefersReducedMotion.matches) {
    lastTime = 0;
    animationFrame = window.requestAnimationFrame(draw);
  }
}

window.addEventListener("resize", resize, { passive: true });

window.addEventListener(
  "pointermove",
  (event) => {
    if (prefersReducedMotion.matches) {
      return;
    }
    depth.targetX = (event.clientX / width - 0.5) * 2;
    depth.targetY = (event.clientY / height - 0.5) * 2;
  },
  { passive: true },
);

window.addEventListener(
  "pointerleave",
  () => {
    depth.targetX = 0;
    depth.targetY = 0;
  },
  { passive: true },
);

window.addEventListener(
  "deviceorientation",
  (event) => {
    if (prefersReducedMotion.matches || event.gamma == null || event.beta == null) {
      return;
    }
    const gx = Math.max(-30, Math.min(30, event.gamma)) / 30;
    const gy = Math.max(-30, Math.min(30, event.beta - 30)) / 30;
    depth.targetX = gx;
    depth.targetY = gy;
  },
  { passive: true },
);

prefersReducedMotion.addEventListener("change", () => {
  window.cancelAnimationFrame(animationFrame);
  context.clearRect(0, 0, width, height);
  depth.targetX = 0;
  depth.targetY = 0;
  depth.currentX = 0;
  depth.currentY = 0;
  setDepthVariables(0, 0);
  if (!prefersReducedMotion.matches) {
    lastTime = 0;
    animationFrame = window.requestAnimationFrame(draw);
  }
});

start();
