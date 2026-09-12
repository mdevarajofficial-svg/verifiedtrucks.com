export function sizeClass(feet) {
  const n = Number(feet);
  if (!n || Number.isNaN(n)) return "medium";
  if (n <= 16) return "small";
  if (n <= 24) return "medium";
  return "large";
}

export function truckSrc(bodyType, feet) {
  const type = bodyType === "open" ? "open" : "container";
  return `/assets/truck-${type}-${sizeClass(feet)}.png`;
}

export function formatMmSs(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function setStopwatch(root, remainingMs, running) {
  const text = root.querySelector("[data-time]");
  const hand = root.querySelector("[data-hand]");
  if (text) text.textContent = formatMmSs(remainingMs);
  if (hand) {
    const span = 10 * 60 * 1000;
    const elapsed = Math.min(span, Math.max(0, span - remainingMs));
    const deg = (elapsed / span) * 360;
    hand.style.transform = `rotate(${deg}deg)`;
    hand.style.animation = "none";
  }
  root.classList.toggle("is-running", Boolean(running) && remainingMs > 0);
  root.classList.toggle("is-stopped", !running);
}

export function showerConfetti() {
  const canvas = document.getElementById("confetti");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const pieces = [];
  const colors = ["#0f766e", "#111111", "#f97316", "#22c55e", "#e11d48", "#2563eb", "#facc15"];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  canvas.classList.add("is-on");

  for (let i = 0; i < 180; i += 1) {
    pieces.push({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height,
      w: 6 + Math.random() * 8,
      h: 8 + Math.random() * 12,
      vx: -2 + Math.random() * 4,
      vy: 3 + Math.random() * 5,
      rot: Math.random() * 360,
      vr: -8 + Math.random() * 16,
      color: colors[i % colors.length],
    });
  }

  const start = performance.now();
  function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (t < 4500) requestAnimationFrame(frame);
    else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.classList.remove("is-on");
    }
  }
  requestAnimationFrame(frame);
}
