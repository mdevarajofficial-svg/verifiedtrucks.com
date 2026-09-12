import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { setStopwatch, showerConfetti, TEN_MIN, MEASURE_MAX_FT, loopRemaining, vehiclesFor, vehicleSrc, vehicleCaption, sizeClass } from "/assets/booking-common.js";

const firebaseConfig = await fetch("/firebase-config.json").then((r) => r.json());
const db = getFirestore(initializeApp(firebaseConfig));

const form = document.getElementById("lead-form");
const submitBtn = document.getElementById("submit-btn");
const formMessage = document.getElementById("form-message");
const statusCard = document.getElementById("status-card");
const statusTitle = document.getElementById("status-title");
const statusCopy = document.getElementById("status-copy");
const truckImage = document.getElementById("truck-image");
const truckCaption = document.getElementById("truck-caption");
const stopwatch = document.getElementById("live-timer");
const sizeInput = document.getElementById("size-feet");
const bodyInput = document.getElementById("body-type");
const measureFill = document.getElementById("measure-fill");
const measureValue = document.getElementById("measure-value");
const measureSlider = document.getElementById("measure-slider");
const modelSelect = document.getElementById("vehicle-model");
const modelPicks = document.getElementById("model-picks");
const truckPreview = document.getElementById("truck-preview");
const tonnageInput = document.getElementById("tonnage");
let lastAutoTonnage = null;

const STEPS = [
  { id: "loading-location", ready: (v) => v.length >= 2 },
  { id: "unloading-location", ready: (v) => v.length >= 2 },
  { id: "size-feet", ready: (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 7 && n <= 40;
  } },
  { id: "body-type", ready: (v) => v === "open" || v === "container" },
  { id: "vehicle-model", ready: (v) => Boolean(v) },
  { id: "tonnage", ready: (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 && n <= 100;
  } },
  { id: "contact-phone", ready: (v) => /^\d{10}$/.test(v) },
];

const stepTimers = new Map();

function stepEl(id) {
  return document.querySelector(`[data-step="${id}"]`);
}

function fieldReady(step) {
  return step.ready(value(step.id));
}

function openStep(id, focus) {
  const wrap = stepEl(id);
  if (!wrap) return;
  const wasClosed = !wrap.classList.contains("is-open");
  wrap.classList.add("is-open");
  if (id === "size-feet" && truckPreview) truckPreview.classList.remove("is-waiting");
  if (focus && wasClosed) {
    const field = document.getElementById(id);
    requestAnimationFrame(() => field?.focus());
  }
}

function refreshSteps(focusNext) {
  openStep("loading-location", false);
  openStep("unloading-location", false);
  const routeReady = fieldReady(STEPS[0]) && fieldReady(STEPS[1]);
  if (!routeReady) {
    submitBtn.hidden = true;
    return;
  }
  let blocked = false;
  STEPS.slice(2).forEach((step) => {
    if (blocked) return;
    openStep(step.id, focusNext);
    if (!fieldReady(step)) blocked = true;
  });
  submitBtn.hidden = !STEPS.every(fieldReady);
}

function scheduleAdvance(id) {
  clearTimeout(stepTimers.get(id));
  const step = STEPS.find((s) => s.id === id);
  if (!step || !fieldReady(step)) return;
  const delay = id === "body-type" || id === "vehicle-model" || id === "contact-phone" ? 80 : 450;
  const timer = setTimeout(() => refreshSteps(true), delay);
  stepTimers.set(id, timer);
}

function advanceNow(id) {
  clearTimeout(stepTimers.get(id));
  refreshSteps(true);
}

let tickId = null;
let leadUnsub = null;
let timerEndsAt = null;
let booked = false;
let celebrated = false;
let frozenRemaining = 0;
let postedLive = false;

function showMessage(text, type) {
  formMessage.textContent = text;
  formMessage.className = `form-message ${type}`;
}

function value(id) {
  return document.getElementById(id).value.trim();
}

function selectedVehicle(list) {
  return list.find((v) => v.id === modelSelect.value) || list[0];
}

function updateTruckPreview() {
  const bodyType = bodyInput.value || "open";
  const typedSize = Number(sizeInput.value);
  const hasSize = Number.isFinite(typedSize) && typedSize >= 7;
  const feet = Math.max(7, Math.min(MEASURE_MAX_FT, hasSize ? typedSize : 10));
  if (hasSize) sizeInput.value = String(feet);
  if (measureSlider) measureSlider.value = String(feet);
  const list = vehiclesFor(feet, bodyType);
  const prev = modelSelect.value;
  modelSelect.innerHTML = `<option value="" disabled>Select a vehicle</option>` +
    list.map((v) => `<option value="${v.id}">${v.name}</option>`).join("");
  if (list.some((v) => v.id === prev)) modelSelect.value = prev;
  else if (list.length === 1) modelSelect.value = list[0].id;
  else modelSelect.value = "";
  const vehicle = selectedVehicle(list);
  if (!vehicle) return;
  truckImage.src = vehicleSrc(vehicle, bodyType);
  truckCaption.textContent = vehicleCaption(vehicle, feet, bodyType);
  if (vehicle.defaultTonnage != null) {
    const cur = tonnageInput.value.trim();
    if (!cur || cur === String(lastAutoTonnage)) {
      tonnageInput.value = String(vehicle.defaultTonnage);
      lastAutoTonnage = vehicle.defaultTonnage;
    }
  } else if (tonnageInput.value.trim() === String(lastAutoTonnage)) {
    tonnageInput.value = "";
    lastAutoTonnage = null;
  }
  modelPicks.innerHTML = list.map((v) => (
    `<button type="button" class="model-pick${v.id === vehicle.id ? " is-active" : ""}" data-id="${v.id}">${v.name}</button>`
  )).join("");
  if (measureFill) {
    measureFill.style.width = `${(feet / MEASURE_MAX_FT) * 100}%`;
  }
  if (measureValue) {
    measureValue.textContent = `${feet} ft`;
  }
}

function stopTick() {
  if (tickId) {
    clearInterval(tickId);
    tickId = null;
  }
}

function paintTimer() {
  if (!timerEndsAt) return;
  if (booked) {
    setStopwatch(stopwatch, frozenRemaining, false, false);
    const kicker = stopwatch.querySelector("[data-kicker]");
    if (kicker) kicker.textContent = "Vehicle booked";
    return;
  }
  const { remaining, cycle } = loopRemaining(timerEndsAt);
  const waiting = postedLive && cycle >= 1;
  setStopwatch(stopwatch, remaining, true, waiting);
  if (waiting) {
    statusCard.hidden = false;
    statusCard.classList.add("is-waiting");
    statusTitle.textContent = "Unable to find — still looking";
    statusCopy.textContent = "Kindly wait. We are searching again for a matching truck.";
  }
}

function celebrateBooked() {
  if (celebrated) return;
  celebrated = true;
  booked = true;
  frozenRemaining = timerEndsAt ? loopRemaining(timerEndsAt).remaining : 0;
  stopTick();
  paintTimer();
  statusCard.hidden = false;
  statusCard.classList.remove("is-waiting");
  statusTitle.textContent = "Vehicle booked successfully";
  statusCopy.textContent = "Your truck is confirmed. We will share vehicle details on your number.";
  showerConfetti();
}

function startCountdown(endsAt) {
  timerEndsAt = endsAt;
  booked = false;
  stopTick();
  paintTimer();
  tickId = setInterval(paintTimer, 250);
}

function watchLead(id) {
  if (leadUnsub) leadUnsub();
  leadUnsub = onSnapshot(doc(db, "leads", id), (snap) => {
    const data = snap.data();
    if (!data) return;
    if (data.booked) celebrateBooked();
  });
}

sizeInput.addEventListener("input", () => {
  updateTruckPreview();
  scheduleAdvance("size-feet");
});
sizeInput.addEventListener("blur", () => advanceNow("size-feet"));
bodyInput.addEventListener("change", () => {
  updateTruckPreview();
  advanceNow("body-type");
});
modelSelect.addEventListener("change", () => {
  updateTruckPreview();
  advanceNow("vehicle-model");
});
modelPicks.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-id]");
  if (!btn) return;
  modelSelect.value = btn.dataset.id;
  updateTruckPreview();
  advanceNow("vehicle-model");
});
measureSlider.addEventListener("input", () => {
  sizeInput.value = measureSlider.value;
  updateTruckPreview();
  openStep("size-feet", false);
  scheduleAdvance("size-feet");
});

["loading-location", "unloading-location", "tonnage", "contact-phone"].forEach((id) => {
  const el = document.getElementById(id);
  el.addEventListener("input", () => scheduleAdvance(id));
  el.addEventListener("blur", () => advanceNow(id));
});

form.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.target.tagName === "TEXTAREA") return;
  const id = e.target.id;
  const step = STEPS.find((s) => s.id === id);
  if (!step) return;
  if (id !== "contact-phone" || !fieldReady(step)) {
    e.preventDefault();
    advanceNow(id);
  }
});

function showPosted(endsAt, leadId) {
  postedLive = true;
  form.hidden = true;
  document.getElementById("form-heading").hidden = true;
  statusCard.hidden = false;
  statusCard.classList.remove("is-waiting");
  statusCard.classList.add("is-premium");
  statusTitle.textContent = "Load Posted";
  statusCopy.textContent = "Best Possible Quote will be Given within 10 Min";
  startCountdown(endsAt);
  if (leadId) watchLead(leadId);
}

function postedParams() {
  const q = new URLSearchParams(location.search);
  return { leadId: q.get("posted"), loadId: q.get("load") };
}

updateTruckPreview();
refreshSteps(false);
startCountdown(Date.now() + TEN_MIN);

const existing = postedParams();
if (existing.leadId) {
  getDoc(doc(db, "leads", existing.leadId)).then((snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    showPosted(Number(data.timerEndsAt) || Date.now() + TEN_MIN, snap.id);
    if (data.booked) celebrateBooked();
  }).catch((err) => console.error(err));
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formMessage.className = "form-message";

  const loadingLocation = value("loading-location");
  const unloadingLocation = value("unloading-location");
  const sizeFeet = value("size-feet");
  const bodyType = value("body-type");
  const tonnage = value("tonnage");
  const contactPhone = value("contact-phone");
  const vehicle = selectedVehicle(vehiclesFor(sizeFeet, bodyType));

  if (!loadingLocation || !unloadingLocation || !sizeFeet || !bodyType || !tonnage || !contactPhone || !vehicle) {
    showMessage("Please fill in all details.", "error");
    return;
  }

  if (!/^\d{10}$/.test(contactPhone)) {
    showMessage("Please enter a valid 10-digit phone number.", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Posting…";
  const endsAt = Date.now() + TEN_MIN;

  try {
    const loadRef = await addDoc(collection(db, "loads"), {
      loadingLocation,
      unloadingLocation,
      sizeFt: Number(sizeFeet),
      sizeFeet,
      bodyType,
      tonnage,
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      vehicleMake: vehicle.make,
      timerEndsAt: endsAt,
      booked: false,
      status: "open",
      bidCount: 0,
      lowestBidAmount: null,
      lowestBidderUid: null,
      lowestBidId: null,
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
    });
    const leadRef = await addDoc(collection(db, "leads"), {
      loadId: loadRef.id,
      loadingLocation,
      unloadingLocation,
      sizeFeet,
      bodyType,
      tonnage,
      contactPhone,
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      vehicleMake: vehicle.make,
      sizeClass: sizeClass(sizeFeet),
      source: "home-book-truck",
      page: window.location.pathname,
      booked: false,
      status: "searching",
      timerEndsAt: endsAt,
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
    });
    const url = new URL(location.href);
    url.searchParams.set("posted", leadRef.id);
    url.searchParams.set("load", loadRef.id);
    url.hash = "book";
    history.replaceState(null, "", url);
    showPosted(endsAt, leadRef.id);
  } catch (err) {
    console.error(err);
    showMessage(err.message || "Could not post this load. Check Firestore rules.", "error");
    submitBtn.disabled = false;
    submitBtn.textContent = "Book now";
  }
});
