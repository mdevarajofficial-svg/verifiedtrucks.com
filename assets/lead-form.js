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
import { showerConfetti, MARKET_MS, MEASURE_MAX_FT, vehiclesFor, sizeClass } from "/assets/booking-common.js";
import { attachPlaceSearch, drivingRoute, formatTravelTime, searchPlaces } from "/assets/mappls.js";
import { initRouteMap, paintRouteMap } from "/assets/route-map.js";
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
const sizeInput = document.getElementById("size-feet");
const bodyInput = document.getElementById("body-type");
const modelSelect = document.getElementById("vehicle-model");
const routePreview = document.getElementById("route-preview");
const tonnageInput = document.getElementById("tonnage");
const routeEmpty = document.getElementById("route-empty");
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

function selectedVehicle(list) {
  return list.find((v) => v.id === modelSelect.value) || list[0];
}

function updateTruckPreview() {
  const bodyType = bodyInput.value || "open";
  const typedSize = Number(sizeInput.value);
  const hasSize = Number.isFinite(typedSize) && typedSize >= 7;
  const feet = Math.max(7, Math.min(MEASURE_MAX_FT, hasSize ? typedSize : 10));
  if (hasSize) sizeInput.value = String(feet);
  const list = vehiclesFor(feet, bodyType);
  const prev = modelSelect.value;
  modelSelect.innerHTML = `<option value="" disabled>Select a vehicle</option>` +
    list.map((v) => `<option value="${v.id}">${v.name}</option>`).join("");
  if (list.some((v) => v.id === prev)) modelSelect.value = prev;
  else if (list.length === 1) modelSelect.value = list[0].id;
  else modelSelect.value = "";
  const vehicle = selectedVehicle(list);
  if (!vehicle) return;
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
  statusCard.hidden = false;
  statusCard.classList.remove("is-waiting");
  statusCard.classList.add("is-premium");
  statusTitle.textContent = "Vehicle booked successfully";
  statusCopy.textContent = "Your truck is confirmed. We will share vehicle details on your number.";
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
  const hasPin = Number.isFinite(pickupPlace?.lat) || Number.isFinite(dropPlace?.lat);
  if (routeEmpty) {
    routeEmpty.hidden = hasTrip;
    if (!hasTrip) {
      routeEmpty.textContent = hasPin
        ? "Add the other location to see distance and travel time."
        : "Enter loading and unloading to see the road, distance and travel time.";
    }
  }
  if (routeStats) routeStats.hidden = !hasTrip;
  if (routeBufferNote) routeBufferNote.hidden = !hasTrip;
  if (routeKmEl) routeKmEl.textContent = hasTrip ? `${routeKm.km} km` : "—";
  if (routeTimeEl) {
    const time = formatTravelTime(routeKm?.durationSec);
    routeTimeEl.textContent = time || "—";
  }
  paintRouteMap(pickupPlace, dropPlace, routeKm?.coordinates || []);
}

async function refreshRoute() {
  paintRouteMap(pickupPlace, dropPlace, []);
  if (!pickupPlace || !dropPlace) {
    routeKm = null;
    paintRouteFacts();
    return;
  }
  routeKm = await drivingRoute(pickupPlace, dropPlace);
  paintRouteFacts();
}

function showPosted(endsAt, leadId, km) {
  postedLive = true;
  form.hidden = true;
  document.getElementById("form-heading").hidden = true;
  if (routePreview) routePreview.hidden = true;
  document.querySelector(".booking")?.classList.add("is-posted");
  statusCard.hidden = false;
  statusCard.classList.remove("is-waiting");
  statusCard.classList.add("is-premium");
  statusTitle.textContent = "Load Posted";
  const kmLine = km?.km != null ? ` Total distance ${km.km} km.` : "";
  const timeLine = formatTravelTime(km?.durationSec);
  statusCopy.textContent = `We have your load.${kmLine}${timeLine ? ` Travel time about ${timeLine}.` : ""} A quote will be shared on your number.`;
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

initRouteMap(document.getElementById("route-map"));
updateTruckPreview();
refreshSteps(false);
paintRouteFacts();

const existing = postedParams();
if (existing.leadId) {
  getDoc(doc(db, "leads", existing.leadId)).then((snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    showPosted(Number(data.timerEndsAt) || Date.now() + MARKET_MS, snap.id, {
      km: data.distanceKm ?? null,
      durationSec: data.durationSec ?? null,
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
    showPosted(endsAt, leadRef.id, routeKm);
  } catch (err) {
    console.error(err);
    showMessage(err.message || "Could not post this load. Check Firestore rules.", "error");
    submitBtn.disabled = false;
    submitBtn.textContent = "Book now";
  }
});
