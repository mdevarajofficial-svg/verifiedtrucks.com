import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  addDoc,
  collection,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  doc,
  where,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { formatMmSs } from "/assets/booking-common.js";

const firebaseConfig = await fetch("/firebase-config.json").then((r) => r.json());
const db = getFirestore(initializeApp(firebaseConfig));

const form = document.getElementById("kyc-form");
const submit = document.getElementById("kyc-submit");
const message = document.getElementById("kyc-message");
const board = document.getElementById("load-board");

let kyc = { name: "", phone: "", dlNumber: "", totalVehicles: "" };
let loads = [];

function value(id) {
  return document.getElementById(id).value.trim();
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function remainingMs(load) {
  return Math.max(0, Number(load.timerEndsAt || 0) - Date.now());
}

function isLive(load) {
  return !load.booked && load.status !== "booked" && remainingMs(load) > 0;
}

function renderBoard() {
  const live = loads.filter(isLive).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  if (!live.length) {
    board.innerHTML = `<p class="empty-note">No live loads in this 30-minute window. New bookings from Home appear here immediately.</p>`;
    return;
  }
  board.innerHTML = live.map((load) => `
    <article class="load-card load-card-simple" data-load="${escapeHtml(load.id)}">
      <div class="load-card-head">
        <div>
          <strong>${escapeHtml(load.loadingLocation)} → ${escapeHtml(load.unloadingLocation)}</strong>
          <p>${escapeHtml(String(load.sizeFt || load.sizeFeet || "—"))} ft · ${escapeHtml(load.bodyType || "—")} · ${escapeHtml(String(load.tonnage || "—"))} T</p>
        </div>
        <div class="load-timer is-heartbeat" data-timer="${escapeHtml(load.id)}">${formatMmSs(remainingMs(load))}</div>
      </div>
      <dl class="bid-stats">
        <div><dt>Bids</dt><dd>${escapeHtml(String(load.bidCount || 0))}</dd></div>
        <div><dt>Lowest</dt><dd>${load.lowestBidAmount == null ? "None yet" : `₹${Number(load.lowestBidAmount).toLocaleString("en-IN")}`}</dd></div>
        <div><dt>Window</dt><dd>30 min</dd></div>
      </dl>
      <form class="bid-form" data-bid="${escapeHtml(load.id)}">
        <label>
          <span class="field-label">Phone</span>
          <input type="tel" name="phone" required maxlength="10" inputmode="numeric" pattern="[0-9]{10}" placeholder="10-digit mobile" value="${escapeHtml(kyc.phone)}" />
        </label>
        <label>
          <span class="field-label">Vehicle number</span>
          <input type="text" name="vehicleNumber" required minlength="4" placeholder="KA01AB1234" />
        </label>
        <label>
          <span class="field-label">Bid amount (₹)</span>
          <input type="number" name="amount" required min="1" step="1" inputmode="numeric" placeholder="e.g. 12000" />
        </label>
        <button type="submit" class="submit-btn">Place bid</button>
        <p class="form-message" data-bid-msg hidden></p>
      </form>
    </article>`).join("");

  board.querySelectorAll("[data-bid]").forEach((formEl) => {
    formEl.addEventListener("submit", (e) => placeBid(e, formEl.getAttribute("data-bid")));
  });
}

async function placeBid(e, loadId) {
  e.preventDefault();
  const formEl = e.currentTarget;
  const phone = formEl.phone.value.trim();
  const vehicleNumber = formEl.vehicleNumber.value.trim().toUpperCase();
  const amount = Number(formEl.amount.value);
  const msg = formEl.querySelector("[data-bid-msg]");
  msg.hidden = false;
  msg.className = "form-message";
  const load = loads.find((l) => l.id === loadId);
  if (!load || !isLive(load)) {
    msg.textContent = "This load’s 30 minutes are over.";
    msg.className = "form-message error";
    renderBoard();
    return;
  }
  if (!/^\d{10}$/.test(phone)) {
    msg.textContent = "Enter a 10-digit phone number.";
    msg.className = "form-message error";
    return;
  }
  if (vehicleNumber.length < 4) {
    msg.textContent = "Enter a vehicle number.";
    msg.className = "form-message error";
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    msg.textContent = "Enter a bid amount.";
    msg.className = "form-message error";
    return;
  }
  const btn = formEl.querySelector("button");
  btn.disabled = true;
  try {
    const bidRef = await addDoc(collection(db, "bids"), {
      loadId,
      amount,
      phone,
      vehicleNumber,
      bidderName: kyc.name || "",
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
    });
    const lowest = load.lowestBidAmount;
    const nextCount = Number(load.bidCount || 0) + 1;
    if (lowest == null || amount < Number(lowest)) {
      await updateDoc(doc(db, "loads", loadId), {
        lowestBidAmount: amount,
        lowestBidId: bidRef.id,
        bidCount: nextCount,
      });
    } else {
      await updateDoc(doc(db, "loads", loadId), { bidCount: nextCount });
    }
    msg.textContent = "Bid posted.";
    msg.className = "form-message success";
  } catch (err) {
    console.error(err);
    msg.textContent = err.message || "Could not place bid.";
    msg.className = "form-message error";
    btn.disabled = false;
  }
}

form?.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = value("kyc-name");
  const phone = value("kyc-phone");
  const dlNumber = value("kyc-dl").toUpperCase();
  const totalVehicles = value("kyc-vehicles");
  message.className = "form-message";
  if (!name || !phone || !dlNumber || !totalVehicles) {
    message.textContent = "Please fill in all transporter details.";
    message.className = "form-message error";
    return;
  }
  if (!/^\d{10}$/.test(phone)) {
    message.textContent = "Please enter a valid 10-digit phone number.";
    message.className = "form-message error";
    return;
  }
  kyc = { name, phone, dlNumber, totalVehicles };
  message.textContent = "Details saved on this page. Bid on a live load below — nothing is stored in the browser.";
  message.className = "form-message success";
  renderBoard();
});

const openQ = query(collection(db, "loads"), where("status", "==", "open"));
onSnapshot(openQ, (snap) => {
  loads = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderBoard();
}, (err) => {
  board.innerHTML = `<p class="empty-note">Could not load live loads. ${escapeHtml(err.message || "")}</p>`;
});

setInterval(() => {
  const cards = board.querySelectorAll("[data-load]");
  if (!cards.length && loads.some(isLive)) renderBoard();
  let vanished = false;
  cards.forEach((card) => {
    const id = card.getAttribute("data-load");
    const load = loads.find((l) => l.id === id);
    const timer = card.querySelector("[data-timer]");
    if (!load || !isLive(load)) {
      vanished = true;
      return;
    }
    if (timer) timer.textContent = formatMmSs(remainingMs(load));
  });
  if (vanished) renderBoard();
}, 250);
