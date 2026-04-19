const canvas = document.querySelector(".frost-canvas");
const context = canvas.getContext("2d");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const flecks = [];
let width = 0;
let height = 0;
let animationFrame = 0;
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
  depth.currentX += (depth.targetX - depth.currentX) * 0.08;
  depth.currentY += (depth.targetY - depth.currentY) * 0.08;
  setDepthVariables(depth.currentX, depth.currentY);
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

  flecks.length = 0;
  const count = Math.round(Math.min(90, Math.max(34, width / 18)));
  for (let index = 0; index < count; index += 1) {
    flecks.push({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 2.4 + 0.6,
      drift: Math.random() * 0.45 + 0.12,
      sway: Math.random() * 0.8 + 0.2,
      phase: Math.random() * Math.PI * 2,
      alpha: Math.random() * 0.34 + 0.12,
    });
  }
}

function draw(time = 0) {
  updateDepth();
  context.clearRect(0, 0, width, height);

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "rgba(199, 238, 231, 0.02)");
  gradient.addColorStop(0.5, "rgba(216, 195, 106, 0.055)");
  gradient.addColorStop(1, "rgba(247, 242, 220, 0.018)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  flecks.forEach((fleck) => {
    const sway = Math.sin(time * 0.00045 + fleck.phase) * fleck.sway;
    fleck.y -= fleck.drift;
    fleck.x += sway * 0.08;

    if (fleck.y < -10) {
      fleck.y = height + 10;
      fleck.x = Math.random() * width;
    }

    context.beginPath();
    context.fillStyle = `rgba(247, 242, 220, ${fleck.alpha})`;
    context.arc(fleck.x, fleck.y, fleck.size, 0, Math.PI * 2);
    context.fill();
  });

  animationFrame = window.requestAnimationFrame(draw);
}

function start() {
  resize();
  if (!prefersReducedMotion.matches) {
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

prefersReducedMotion.addEventListener("change", () => {
  window.cancelAnimationFrame(animationFrame);
  context.clearRect(0, 0, width, height);
  depth.targetX = 0;
  depth.targetY = 0;
  depth.currentX = 0;
  depth.currentY = 0;
  setDepthVariables(0, 0);
  if (!prefersReducedMotion.matches) {
    animationFrame = window.requestAnimationFrame(draw);
  }
});

start();
