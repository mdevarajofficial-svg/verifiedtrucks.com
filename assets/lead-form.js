import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { truckSrc, sizeClass, setStopwatch, showerConfetti } from "/assets/booking-common.js";

const TEN_MIN = 10 * 60 * 1000;
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

let tickId = null;
let leadUnsub = null;
let timerEndsAt = null;
let booked = false;
let celebrated = false;

function showMessage(text, type) {
  formMessage.textContent = text;
  formMessage.className = `form-message ${type}`;
}

function value(id) {
  return document.getElementById(id).value.trim();
}

function updateTruckPreview() {
  const bodyType = bodyInput.value || "container";
  const feet = sizeInput.value || 20;
  truckImage.src = truckSrc(bodyType, feet);
  const labelType = bodyType === "open" ? "Open" : "Container";
  truckCaption.textContent = `${feet} ft · ${labelType}`;
}

function stopTick() {
  if (tickId) {
    clearInterval(tickId);
    tickId = null;
  }
}

function paintTimer() {
  if (booked) {
    setStopwatch(stopwatch, Math.max(0, timerEndsAt - Date.now()), false);
    return;
  }
  const remaining = timerEndsAt - Date.now();
  setStopwatch(stopwatch, remaining, remaining > 0);
}

function celebrateBooked() {
  if (celebrated) return;
  celebrated = true;
  booked = true;
  stopTick();
  paintTimer();
  statusCard.hidden = false;
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

  if (!loadingLocation || !unloadingLocation || !sizeFeet || !bodyType || !tonnage || !contactName || !contactPhone) {
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
