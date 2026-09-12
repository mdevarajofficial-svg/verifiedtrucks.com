import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { setStopwatch, showerConfetti, TEN_MIN, MEASURE_MAX_FT, loopRemaining, vehiclesFor, vehicleSrc, sizeClass } from "/assets/booking-common.js";

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
const stopwatch = document.getElementById("stopwatch");
const sizeInput = document.getElementById("size-feet");
const bodyInput = document.getElementById("body-type");
const measureFill = document.getElementById("measure-fill");
const measureValue = document.getElementById("measure-value");
const measureSlider = document.getElementById("measure-slider");
const modelSelect = document.getElementById("vehicle-model");
const modelPicks = document.getElementById("model-picks");

let tickId = null;
let leadUnsub = null;
let timerEndsAt = null;
let booked = false;
let celebrated = false;
let frozenRemaining = 0;

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
  const feet = Math.max(7, Math.min(MEASURE_MAX_FT, Number(sizeInput.value) || 10));
  sizeInput.value = String(feet);
  if (measureSlider) measureSlider.value = String(feet);
  const list = vehiclesFor(feet, bodyType);
  const prev = modelSelect.value;
  modelSelect.innerHTML = list.map((v) => `<option value="${v.id}">${v.name}</option>`).join("");
  if (list.some((v) => v.id === prev)) modelSelect.value = prev;
  const vehicle = selectedVehicle(list);
  if (!vehicle) return;
  truckImage.src = vehicleSrc(vehicle, bodyType);
  const labelType = bodyType === "open" ? "Open" : "Container";
  truckCaption.textContent = `${feet} ft · ${vehicle.name} · ${labelType}`;
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
    return;
  }
  const { remaining, cycle } = loopRemaining(timerEndsAt);
  const waiting = cycle >= 1;
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

sizeInput.addEventListener("input", updateTruckPreview);
bodyInput.addEventListener("change", updateTruckPreview);
modelSelect.addEventListener("change", updateTruckPreview);
modelPicks.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-id]");
  if (!btn) return;
  modelSelect.value = btn.dataset.id;
  updateTruckPreview();
});
measureSlider.addEventListener("input", () => {
  sizeInput.value = measureSlider.value;
  updateTruckPreview();
});
updateTruckPreview();

const savedId = sessionStorage.getItem("vtLeadId");
const savedEnds = Number(sessionStorage.getItem("vtTimerEndsAt") || 0);
if (savedId && savedEnds) {
  form.hidden = true;
  document.getElementById("form-heading").hidden = true;
  statusCard.hidden = false;
  startCountdown(savedEnds);
  watchLead(savedId);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formMessage.className = "form-message";

  const loadingLocation = value("loading-location");
  const unloadingLocation = value("unloading-location");
  const sizeFeet = value("size-feet");
  const bodyType = value("body-type");
  const tonnage = value("tonnage");
  const contactName = value("contact-name");
  const contactPhone = value("contact-phone");
  const vehicle = selectedVehicle(vehiclesFor(sizeFeet, bodyType));

  if (!loadingLocation || !unloadingLocation || !sizeFeet || !bodyType || !tonnage || !contactName || !contactPhone || !vehicle) {
    showMessage("Please fill in all details.", "error");
    return;
  }

  if (!/^\d{10}$/.test(contactPhone)) {
    showMessage("Please enter a valid 10-digit phone number.", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Booking…";
  const endsAt = Date.now() + TEN_MIN;

  try {
    const ref = await addDoc(collection(db, "leads"), {
      loadingLocation,
      unloadingLocation,
      sizeFeet,
      bodyType,
      tonnage,
      contactName,
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
    sessionStorage.setItem("vtLeadId", ref.id);
    sessionStorage.setItem("vtTimerEndsAt", String(endsAt));
    form.hidden = true;
    document.getElementById("form-heading").hidden = true;
    statusCard.hidden = false;
    statusTitle.textContent = "Truck will be found within 10 minutes";
    statusCopy.textContent = "Stay on this number. The timer is counting down while we assign a vehicle.";
    startCountdown(endsAt);
    watchLead(ref.id);
  } catch (err) {
    console.error(err);
    showMessage("Something went wrong. Please try again.", "error");
    submitBtn.disabled = false;
    submitBtn.textContent = "Book truck";
  }
});
