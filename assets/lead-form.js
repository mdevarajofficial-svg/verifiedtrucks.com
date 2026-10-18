import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  collection,
  addDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { auth, db } from "/assets/firebase.js";
import { showerConfetti, MARKET_MS, MEASURE_MAX_FT, vehiclesFor, vehicleSrc, vehicleCaption, sizeClass, paradeVehicles } from "/assets/booking-common.js";
import { attachPlaceSearch, drivingRoute, formatTravelTime, searchPlaces } from "/assets/mappls.js";
import { initRouteMap, paintRouteMap, revealRouteMap } from "/assets/route-map.js";
let signedInUser = null;
onAuthStateChanged(auth, (user) => {
  signedInUser = user;
});

const form = document.getElementById("lead-form");
const submitBtn = document.getElementById("submit-btn");
const formMessage = document.getElementById("form-message");
const statusCard = document.getElementById("status-card");
const statusTitle = document.getElementById("status-title");
const statusCopy = document.getElementById("status-copy");
const truckImage = document.getElementById("truck-image");
const truckCaption = document.getElementById("truck-caption");
const sizeInput = document.getElementById("size-feet");
const bodyInput = document.getElementById("body-type");
const measureFill = document.getElementById("measure-fill");
const measureValue = document.getElementById("measure-value");
const measureSlider = document.getElementById("measure-slider");
const modelSelect = document.getElementById("vehicle-model");
const modelPicks = document.getElementById("model-picks");
const truckPreview = document.getElementById("truck-preview");
const routePreview = document.getElementById("route-preview");
const bookingStage = document.getElementById("booking-stage");
const tonnageInput = document.getElementById("tonnage");
const routeStats = document.getElementById("route-stats");
const routeKmEl = document.getElementById("route-km");
const routeTimeEl = document.getElementById("route-time");
const routeBufferNote = document.getElementById("route-buffer-note");
let lastAutoTonnage = null;
let pickupPlace = null;
let dropPlace = null;
let routeKm = null;

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

let lastTruckSrc = truckImage?.getAttribute("src") || "";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function playTruckDrive() {
  if (!truckImage || prefersReducedMotion()) return;
  const stage = truckImage.closest(".truck-stage");
  truckImage.classList.remove("is-driving");
  stage?.classList.remove("is-driving");
  void truckImage.offsetWidth;
  truckImage.classList.add("is-driving");
  stage?.classList.add("is-driving");
  truckImage.addEventListener("animationend", () => {
    truckImage.classList.remove("is-driving");
    stage?.classList.remove("is-driving");
  }, { once: true });
}

function mountVehicleParade() {
  const track = document.getElementById("truck-parade-track");
  if (!track || track.childElementCount) return;
  const items = paradeVehicles();
  const slide = items.map((it) => (
    `<figure class="truck-parade-item">
      <img src="${it.src}" alt="" width="320" height="180" decoding="async" />
    </figure>`
  )).join("");
  track.innerHTML = slide + slide;
}

function hasTypedSize() {
  const n = Number(sizeInput?.value);
  return Number.isFinite(n) && n >= 7 && n <= MEASURE_MAX_FT;
}

function syncRightPane() {
  const showVehicle = hasTypedSize();
  const showMap = !showVehicle && routeKm?.km != null;
  if (truckPreview) {
    truckPreview.hidden = showMap;
    truckPreview.classList.toggle("is-waiting", !showVehicle);
    truckPreview.classList.toggle("has-pick", showVehicle);
  }
  if (routePreview) {
    const wasHidden = routePreview.hidden;
    routePreview.hidden = !showMap;
    if (showMap) {
      paintRouteMap(pickupPlace, dropPlace, routeKm?.coordinates || []);
      if (wasHidden) revealRouteMap();
    }
  }
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
  if (!vehicle) {
    syncRightPane();
    return;
  }
  const hasBody = bodyInput.value === "open" || bodyInput.value === "container";
  if (truckImage) truckImage.hidden = !hasSize;
  if (hasSize) {
    const nextSrc = vehicleSrc(vehicle, bodyType);
    if (lastTruckSrc !== nextSrc) {
      lastTruckSrc = nextSrc;
      truckImage.src = nextSrc;
      playTruckDrive();
    }
  }
  if (truckCaption) {
    if (hasSize) {
      truckCaption.hidden = false;
      truckCaption.textContent = vehicleCaption(vehicle, feet, hasBody ? bodyType : vehicle.bodies[0]);
    } else {
      truckCaption.hidden = true;
      truckCaption.textContent = "";
    }
  }
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
  if (modelPicks) modelPicks.innerHTML = "";
  if (measureFill) {
    measureFill.style.width = `${(feet / MEASURE_MAX_FT) * 100}%`;
  }
  if (measureValue) {
    measureValue.textContent = `${feet} ft`;
  }
  syncRightPane();
}

function stopTick() {
  if (tickId) {
    clearInterval(tickId);
    tickId = null;
  }
}

function celebrateBooked() {
  if (celebrated) return;
  celebrated = true;
  booked = true;
  stopTick();
  if (statusCard) {
    statusCard.hidden = false;
    statusCard.classList.remove("is-waiting");
    statusCard.classList.add("is-premium", "is-confirmed");
  }
  if (statusTitle) statusTitle.textContent = "Vehicle booked successfully";
  if (statusCopy) statusCopy.textContent = "Your truck is confirmed. We will share vehicle details on your number.";
  showerConfetti();
}

function startCountdown(endsAt) {
  timerEndsAt = endsAt;
  booked = false;
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
measureSlider?.addEventListener("input", () => {
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

attachPlaceSearch(document.getElementById("loading-location"), (place) => {
  pickupPlace = place;
  refreshRoute();
  scheduleAdvance("loading-location");
});
attachPlaceSearch(document.getElementById("unloading-location"), (place) => {
  dropPlace = place;
  refreshRoute();
  scheduleAdvance("unloading-location");
});

async function resolveTypedPlace(id, current) {
  if (current && Number.isFinite(current.lat) && Number.isFinite(current.lng)) return current;
  const typed = value(id);
  if (typed.length < 2) return null;
  return (await searchPlaces(typed))[0] || null;
}

document.getElementById("loading-location")?.addEventListener("blur", async () => {
  pickupPlace = await resolveTypedPlace("loading-location", pickupPlace);
  refreshRoute();
});
document.getElementById("unloading-location")?.addEventListener("blur", async () => {
  dropPlace = await resolveTypedPlace("unloading-location", dropPlace);
  refreshRoute();
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

function paintRouteFacts() {
  const hasTrip = routeKm?.km != null;
  if (routeStats) routeStats.hidden = !hasTrip;
  if (routeBufferNote) routeBufferNote.hidden = !hasTrip;
  if (routeKmEl) routeKmEl.textContent = hasTrip ? `${routeKm.km} km` : "—";
  if (routeTimeEl) {
    const time = formatTravelTime(routeKm?.durationSec);
    routeTimeEl.textContent = time || "—";
  }
  if (hasTrip) paintRouteMap(pickupPlace, dropPlace, routeKm?.coordinates || []);
  syncRightPane();
}

async function refreshRoute() {
  if (!pickupPlace || !dropPlace) {
    routeKm = null;
    paintRouteFacts();
    return;
  }
  routeKm = await drivingRoute(pickupPlace, dropPlace);
  paintRouteFacts();
}

function setPostedFact(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text || "—";
}

function fillPostedFacts(details = {}) {
  const km = details.km ?? details.distanceKm;
  const durationSec = details.durationSec;
  const size = details.sizeFeet ?? details.sizeFt;
  const weight = details.tonnage;
  setPostedFact("posted-from", details.from || details.loadingLocation);
  setPostedFact("posted-to", details.to || details.unloadingLocation);
  setPostedFact("posted-distance", km != null && km !== "" ? `${km} km` : "—");
  setPostedFact("posted-time", details.travelTime || formatTravelTime(durationSec) || "—");
  setPostedFact("posted-size", size != null && size !== "" ? `${size} ft` : "—");
  setPostedFact("posted-weight", weight != null && weight !== "" ? `${weight} T` : "—");
}

function showPosted(endsAt, leadId, details) {
  postedLive = true;
  form.hidden = true;
  document.getElementById("form-heading").hidden = true;
  if (routePreview) routePreview.hidden = true;
  if (truckPreview) truckPreview.hidden = true;
  if (bookingStage) bookingStage.hidden = true;
  document.querySelector(".booking")?.classList.add("is-posted");
  fillPostedFacts(details || {});
  if (statusCard) {
    statusCard.hidden = false;
    statusCard.classList.remove("is-waiting", "is-confirmed");
    statusCard.classList.add("is-premium");
  }
  if (statusTitle) statusTitle.textContent = "Preparing Quote";
  if (statusCopy) statusCopy.textContent = "Vehicle will be assigned shortly post Confirmation";
  if (leadId) watchLead(leadId);
}

function postedParams() {
  const q = new URLSearchParams(location.search);
  return { leadId: q.get("posted"), loadId: q.get("load") };
}

function escapeMail(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function loadAlertHtml(details) {
  const rows = [
    ["Pickup location", details.loadingLocation],
    ["Drop location", details.unloadingLocation],
    ["Vehicle type", `${details.sizeFeet} ft · ${details.bodyType} · ${details.vehicleName}`],
    ["Weight", `${details.tonnage} T`],
    ["Contact number", details.contactPhone],
    ["Total distance", details.distanceKm != null ? `${details.distanceKm} km` : "—"],
    ["Travel time", details.travelTime || "—"],
    ["Load ID", details.loadId],
  ];
  const bodyRows = rows.map(([label, value]) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e7e7e7;color:#555;width:38%;font-size:14px;">${escapeMail(label)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e7e7e7;color:#111;font-weight:600;font-size:14px;">${escapeMail(value)}</td>
    </tr>`).join("");
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#f6f7f8;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #ececec;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="padding:20px 24px;background:#0284c7;color:#fff;">
        <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;opacity:0.85;">Verified Trucks</div>
        <div style="font-size:20px;font-weight:700;margin-top:6px;">New load posted</div>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 12px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${bodyRows}</table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendLoadAlert(details) {
  await addDoc(collection(db, "mail"), {
    to: ["nivinnya@gmail.com"],
    message: {
      subject: `New load: ${details.loadingLocation} → ${details.unloadingLocation}`,
      text: [
        `Pickup: ${details.loadingLocation}`,
        `Drop: ${details.unloadingLocation}`,
        `Vehicle: ${details.sizeFeet} ft · ${details.bodyType} · ${details.vehicleName}`,
        `Weight: ${details.tonnage} T`,
        `Contact: ${details.contactPhone}`,
        `Distance: ${details.distanceKm != null ? `${details.distanceKm} km` : "—"}`,
        `Travel time: ${details.travelTime || "—"}`,
        `Load ID: ${details.loadId}`,
      ].join("\n"),
      html: loadAlertHtml(details),
    },
  });
}

mountVehicleParade();
initRouteMap(document.getElementById("route-map"));
updateTruckPreview();
refreshSteps(false);
syncRightPane();

const existing = postedParams();
if (existing.leadId) {
  getDoc(doc(db, "leads", existing.leadId)).then((snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    showPosted(Number(data.timerEndsAt) || Date.now() + MARKET_MS, snap.id, {
      from: data.loadingLocation,
      to: data.unloadingLocation,
      km: data.distanceKm ?? null,
      durationSec: data.durationSec ?? null,
      travelTime: data.travelTime,
      sizeFeet: data.sizeFeet ?? data.sizeFt,
      tonnage: data.tonnage,
    });
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
  const endsAt = Date.now() + MARKET_MS;
  if (!pickupPlace) {
    pickupPlace = (await searchPlaces(loadingLocation))[0] || { name: loadingLocation, address: loadingLocation };
  }
  if (!dropPlace) {
    dropPlace = (await searchPlaces(unloadingLocation))[0] || { name: unloadingLocation, address: unloadingLocation };
  }
  if (!routeKm) {
    routeKm = await drivingRoute(pickupPlace, dropPlace);
    paintRouteFacts();
  }

  try {
    const distanceKm = routeKm?.km ?? null;
    const distanceMeters = routeKm?.meters ?? null;
    const durationSec = Number.isFinite(routeKm?.durationSec) ? routeKm.durationSec : null;
    const travelTime = formatTravelTime(durationSec);
    const loadRef = await addDoc(collection(db, "loads"), {
      loadingLocation,
      unloadingLocation,
      pickupAddress: pickupPlace?.address || loadingLocation,
      dropAddress: dropPlace?.address || unloadingLocation,
      pickupLat: pickupPlace?.lat ?? null,
      pickupLng: pickupPlace?.lng ?? null,
      dropLat: dropPlace?.lat ?? null,
      dropLng: dropPlace?.lng ?? null,
      pickupEloc: pickupPlace?.eloc || null,
      dropEloc: dropPlace?.eloc || null,
      distanceKm,
      distanceMeters,
      durationSec,
      travelTime,
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
      posterUid: signedInUser?.uid || null,
      customerUid: signedInUser?.uid || null,
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
    });
    const leadRef = await addDoc(collection(db, "leads"), {
      loadId: loadRef.id,
      posterUid: signedInUser?.uid || null,
      loadingLocation,
      unloadingLocation,
      sizeFeet,
      bodyType,
      tonnage,
      contactPhone,
      pickupLat: pickupPlace?.lat ?? null,
      pickupLng: pickupPlace?.lng ?? null,
      dropLat: dropPlace?.lat ?? null,
      dropLng: dropPlace?.lng ?? null,
      distanceKm,
      distanceMeters,
      durationSec,
      travelTime,
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
    try {
      await sendLoadAlert({
        loadingLocation,
        unloadingLocation,
        sizeFeet,
        bodyType,
        vehicleName: vehicle.name,
        tonnage,
        contactPhone,
        distanceKm,
        travelTime,
        loadId: loadRef.id,
      });
    } catch (mailErr) {
      console.error(mailErr);
    }
    const url = new URL(location.href);
    url.searchParams.set("posted", leadRef.id);
    url.searchParams.set("load", loadRef.id);
    url.hash = "book";
    history.replaceState(null, "", url);
    showPosted(endsAt, leadRef.id, {
      from: loadingLocation,
      to: unloadingLocation,
      km: distanceKm,
      durationSec,
      travelTime,
      sizeFeet,
      tonnage,
    });
  } catch (err) {
    console.error(err);
    showMessage(err.message || "Could not post this load. Check Firestore rules.", "error");
    submitBtn.disabled = false;
    submitBtn.textContent = "Book now";
  }
});
