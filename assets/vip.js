import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { formatMmSs, showerConfetti, truckSrc, loopRemaining, vehicleSrc, VEHICLES } from "/assets/booking-common.js";

const VIP_CODE = "Deva@2001";
const firebaseConfig = await fetch("/firebase-config.json").then((r) => r.json());
const db = getFirestore(initializeApp(firebaseConfig));

const gate = document.getElementById("vip-gate");
const app = document.getElementById("vip-app");
const list = document.getElementById("vip-list");
const gateForm = document.getElementById("vip-login");
const gateError = document.getElementById("vip-error");

const timers = new Map();
const celebrated = new Set();
const bidsByLoad = new Map();
let listening = false;

function showApp() {
  gate.hidden = true;
  app.hidden = false;
  listen();
}

gateForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = document.getElementById("vip-code").value;
  if (code !== VIP_CODE) {
    gateError.hidden = false;
    return;
  }
  showApp();
});

function leadImage(lead) {
  const v = VEHICLES.find((x) => x.id === lead.vehicleId);
  return v ? vehicleSrc(v, lead.bodyType || "open") : truckSrc(lead.bodyType, lead.sizeFeet);
}

function remaining(lead) {
  if (!lead.timerEndsAt) return 0;
  return loopRemaining(lead.timerEndsAt).remaining;
}

function looking(lead) {
  if (lead.booked || !lead.timerEndsAt) return false;
  return loopRemaining(lead.timerEndsAt).cycle >= 1;
}

function bidLines(loadId) {
  const bids = bidsByLoad.get(loadId) || [];
  if (!bids.length) return "<p>No bids yet.</p>";
  return `<ul class="bid-rank">${bids.map((b) => (
    `<li>₹${Number(b.amount).toLocaleString("en-IN")} · ${escapeHtml(b.phone || "")} · ${escapeHtml(b.vehicleNumber || "")}</li>`
  )).join("")}</ul>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderLead(id, lead) {
  let card = list.querySelector(`[data-id="${id}"]`);
  if (!card) {
    card = document.createElement("article");
    card.className = "vip-card";
    card.dataset.id = id;
    list.prepend(card);
  }
  const booked = Boolean(lead.booked);
  const ms = remaining(lead);
  card.classList.toggle("is-booked", booked);
  card.innerHTML = `
    <img src="${leadImage(lead)}" alt="" class="vip-truck" />
    <div class="vip-card-body">
      <p class="vip-timer" data-timer>${booked ? "Stopped" : formatMmSs(ms)}</p>
      ${looking(lead) && !booked ? `<p class="vip-wait">Unable to find — still looking, kindly wait</p>` : ""}
      <p><strong>${escapeHtml(lead.loadingLocation || "—")}</strong> → <strong>${escapeHtml(lead.unloadingLocation || "—")}</strong></p>
      <p>${escapeHtml(lead.vehicleName || "Truck")} · ${escapeHtml(String(lead.sizeFeet || "—"))} ft · ${escapeHtml(lead.bodyType || "—")} · ${escapeHtml(String(lead.tonnage || "—"))} T</p>
      <p>${escapeHtml(lead.contactName || "")} · ${escapeHtml(lead.contactPhone || "")}</p>
      ${bidLines(lead.loadId || "")}
      ${booked
        ? `<p class="vip-ok">Vehicle booked successfully</p>`
        : `<button type="button" class="submit-btn" data-book>Mark booked</button>`}
    </div>
  `;
  const btn = card.querySelector("[data-book]");
  if (btn) {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await updateDoc(doc(db, "leads", id), {
          booked: true,
          status: "booked",
          bookedAt: serverTimestamp(),
        });
        if (lead.loadId) {
          await updateDoc(doc(db, "loads", lead.loadId), {
            booked: true,
            status: "booked",
            bookedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.error(err);
        btn.disabled = false;
      }
    });
  }
}

function listen() {
  if (listening) return;
  listening = true;
  onSnapshot(collection(db, "bids"), (snap) => {
    bidsByLoad.clear();
    snap.docs.forEach((d) => {
      const b = { id: d.id, ...d.data() };
      const arr = bidsByLoad.get(b.loadId) || [];
      arr.push(b);
      bidsByLoad.set(b.loadId, arr);
    });
    bidsByLoad.forEach((arr) => arr.sort((a, b) => Number(a.amount) - Number(b.amount)));
    timers.forEach((lead, id) => renderLead(id, lead));
  });
  onSnapshot(collection(db, "leads"), (snap) => {
    snap.docChanges().forEach((change) => {
      const lead = change.doc.data();
      const id = change.doc.id;
      if (change.type === "removed") {
        list.querySelector(`[data-id="${id}"]`)?.remove();
        timers.delete(id);
        return;
      }
      const wasBooked = Boolean(timers.get(id)?.booked);
      timers.set(id, lead);
      renderLead(id, lead);
      if (lead.booked && !wasBooked && !celebrated.has(id)) {
        celebrated.add(id);
        showerConfetti();
      }
    });
  });
}

setInterval(() => {
  timers.forEach((lead, id) => {
    if (lead.booked) return;
    const el = list.querySelector(`[data-id="${id}"] [data-timer]`);
    if (el) el.textContent = formatMmSs(remaining(lead));
    const wait = list.querySelector(`[data-id="${id}"] .vip-wait`);
    if (looking(lead) && !wait) {
      el?.insertAdjacentHTML("afterend", `<p class="vip-wait">Unable to find — still looking, kindly wait</p>`);
    }
  });
}, 250);
