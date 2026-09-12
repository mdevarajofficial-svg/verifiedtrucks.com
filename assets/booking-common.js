export const TEN_MIN = 10 * 60 * 1000;
export const MEASURE_MAX_FT = 40;

export const VEHICLES = [
  { id: "tata-ace", name: "Tata Ace", make: "Tata", feet: [7], bodies: ["open", "container"], image: "ace" },
  { id: "tata-intra", name: "Tata Intra", make: "Tata", feet: [8, 9], bodies: ["open", "container"], image: "intra" },
  { id: "bolero", name: "Mahindra Bolero Pickup", make: "Mahindra", feet: [8, 9], bodies: ["open"], image: "bolero" },
  { id: "dost", name: "Ashok Leyland Dost", make: "Ashok Leyland", feet: [8, 9], bodies: ["open", "container"], image: "dost" },
  { id: "intra-v70", name: "Tata Intra V70", make: "Tata", feet: [10], bodies: ["open", "container"], image: "v70" },
  { id: "bada-dost", name: "Ashok Leyland Bada Dost", make: "Ashok Leyland", feet: [10], bodies: ["open", "container"], image: "bada-dost" },
  { id: "tata-407", name: "Tata 407", make: "Tata", feet: [14], bodies: ["open", "container"], image: "lcv-small" },
  { id: "eicher-2049", name: "Eicher Pro 2049", make: "Eicher", feet: [14], bodies: ["open", "container"], image: "lcv-small" },
  { id: "al-partner", name: "Ashok Leyland Partner", make: "Ashok Leyland", feet: [14], bodies: ["open", "container"], image: "lcv-small" },
  { id: "tata-1109", name: "Tata 1109", make: "Tata", feet: [17], bodies: ["open", "container"], image: "lcv-mid" },
  { id: "eicher-3015", name: "Eicher Pro 3015", make: "Eicher", feet: [17, 19], bodies: ["open", "container"], image: "lcv-mid" },
  { id: "tata-lpt", name: "Tata LPT 1613", make: "Tata", feet: [19, 20], bodies: ["open", "container"], image: "lcv-mid" },
  { id: "al-1616", name: "Ashok Leyland 1616", make: "Ashok Leyland", feet: [20, 22], bodies: ["open", "container"], image: "lcv-mid" },
  { id: "tata-22", name: "Tata LPT 22 ft", make: "Tata", feet: [22, 24], bodies: ["open", "container"], image: "lcv-mid" },
  { id: "tata-32-open", name: "Tata 32 ft open", make: "Tata", feet: [32], bodies: ["open"], image: "lcv-large" },
  { id: "tata-32-box", name: "Tata 32 ft container", make: "Tata", feet: [32], bodies: ["container"], image: "lcv-large" },
  { id: "al-32", name: "Ashok Leyland 32 ft", make: "Ashok Leyland", feet: [32], bodies: ["open", "container"], image: "lcv-large" },
];

export function sizeClass(feet) {
  const n = Number(feet);
  if (!n || Number.isNaN(n)) return "medium";
  if (n <= 16) return "small";
  if (n <= 24) return "medium";
  return "large";
}

export function vehiclesFor(feet, bodyType) {
  const n = Number(feet);
  const body = bodyType === "open" ? "open" : "container";
  const match = VEHICLES.filter((v) => v.feet.includes(n) && v.bodies.includes(body));
  if (match.length) return match;
  const anyAtSize = VEHICLES.filter((v) => v.feet.includes(n));
  if (anyAtSize.length) return anyAtSize;
  let nearest = 20;
  let best = 99;
  VEHICLES.forEach((v) => {
    v.feet.forEach((f) => {
      const d = Math.abs(f - n);
      if (d < best) {
        best = d;
        nearest = f;
      }
    });
  });
  return VEHICLES.filter((v) => v.feet.includes(nearest) && v.bodies.includes(body));
}

export function vehicleSrc(vehicle, bodyType) {
  const type = vehicle.bodies.includes(bodyType) ? bodyType : vehicle.bodies[0];
  if (vehicle.image === "lcv-small") return `/assets/truck-${type}-small.png`;
  if (vehicle.image === "lcv-mid") return `/assets/truck-${type}-medium.png`;
  if (vehicle.image === "lcv-large") return `/assets/truck-${type}-large.png`;
  return `/assets/vehicles/${vehicle.image}-${type}.png`;
}

export function truckSrc(bodyType, feet) {
  const list = vehiclesFor(feet, bodyType);
  return vehicleSrc(list[0] || VEHICLES[0], bodyType);
}

export function formatMmSs(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function loopRemaining(timerEndsAt, now = Date.now()) {
  const start = timerEndsAt - TEN_MIN;
  const elapsed = Math.max(0, now - start);
  const cycle = Math.floor(elapsed / TEN_MIN);
  const remaining = TEN_MIN - (elapsed % TEN_MIN);
  return { remaining, cycle, elapsed };
}

export function setStopwatch(root, remainingMs, running, waiting = false) {
  const text = root.querySelector("[data-time]");
  const hand = root.querySelector("[data-hand]");
  const sub = root.querySelector("[data-sub]");
  if (text) text.textContent = formatMmSs(remainingMs);
  if (sub) sub.textContent = waiting ? "STILL LOOKING" : "MINUTES";
  if (hand) {
    const elapsed = Math.min(TEN_MIN, Math.max(0, TEN_MIN - remainingMs));
    const deg = (elapsed / TEN_MIN) * 360;
    hand.style.transform = `rotate(${deg}deg)`;
    hand.style.animation = "none";
  }
  root.classList.toggle("is-running", Boolean(running) && remainingMs > 0);
  root.classList.toggle("is-stopped", !running);
  root.classList.toggle("is-waiting", waiting);
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
