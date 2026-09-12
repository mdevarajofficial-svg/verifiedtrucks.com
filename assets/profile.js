import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { auth, db, signInGoogle, signOutUser } from "./firebase.js";
import {
  VEHICLES,
  formatMmSs,
  loopRemaining,
  vehicleSrc,
  vehiclesFor,
} from "./booking-common.js";

export const PENDING_CUSTOMER = "vtPendingCustomer";
export const PENDING_TRANSPORTER = "vtPendingTransporter";

const params = new URLSearchParams(location.search);
const gate = document.getElementById("profile-gate");
const app = document.getElementById("profile-app");
const gateTitle = document.getElementById("gate-title");
const gateCopy = document.getElementById("gate-copy");
const googleBtn = document.getElementById("profile-google");
const gateErr = document.getElementById("gate-error");
const signOutBtn = document.getElementById("profile-signout");
const sizeFilter = document.getElementById("size-filter");

let currentUser = null;
let profile = null;
let customerUnsub = null;
let openLoadsUnsub = null;
let wonLoadsUnsub = null;
let openLoads = [];
let wonLoads = [];
const loadTimers = new Map();

function readPending(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function pendingCustomer() {
  return readPending(PENDING_CUSTOMER);
}

function pendingTransporter() {
  return readPending(PENDING_TRANSPORTER);
}

function showGate(title, copy) {
  gate.hidden = false;
  app.hidden = true;
  gateTitle.textContent = title;
  gateCopy.textContent = copy;
}

function showApp() {
  gate.hidden = true;
  app.hidden = false;
}

function vehicleMeta(bodyType, sizeFt) {
  const list = vehiclesFor(sizeFt, bodyType);
  const v = list[0];
  if (!v) return { name: "Truck", image: "/assets/truck-open-medium.png" };
  return { name: v.name, image: vehicleSrc(v, bodyType) };
}

function bodyLabel(type) {
  return type === "container" ? "Container" : "Open";
}

function formatInr(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return "₹" + Number(n).toLocaleString("en-IN");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function startLoadTimer(el, endsAt, booked) {
  if (loadTimers.has(el)) clearInterval(loadTimers.get(el));
  const tick = () => {
    if (booked) {
      el.textContent = "Booked";
      el.classList.add("is-booked");
      return;
    }
    el.textContent = formatMmSs(loopRemaining(endsAt).remaining);
    el.classList.remove("is-booked");
  };
  tick();
  loadTimers.set(el, setInterval(tick, 250));
}

function fillSizeFilter() {
  const sizes = [...new Set(VEHICLES.flatMap((v) => v.feet))].sort((a, b) => a - b);
  const current = sizeFilter.value || "all";
  sizeFilter.innerHTML = `<option value="all">All sizes</option>` +
    sizes.map((ft) => `<option value="${ft}">${ft} ft</option>`).join("");
  sizeFilter.value = [...sizeFilter.options].some((o) => o.value === current) ? current : "all";
}

async function mergeProfile(uid, extra) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const prev = snap.exists() ? snap.data() : {};
  const next = {
    email: extra.email || prev.email || "",
    displayName: extra.displayName || prev.displayName || "",
    photoURL: extra.photoURL || prev.photoURL || "",
    name: extra.name || prev.name || extra.displayName || prev.displayName || "",
    phone: extra.phone || prev.phone || "",
    updatedAt: serverTimestamp(),
  };
  if (!prev.createdAt) next.createdAt = serverTimestamp();
  if (extra.role === "transporter" || prev.kycComplete) {
    next.role = "transporter";
    next.dlNumber = extra.dlNumber || prev.dlNumber || "";
    next.totalVehicles = extra.totalVehicles ?? prev.totalVehicles ?? "";
    next.kycComplete = true;
  } else if (extra.role === "customer" || prev.role === "customer") {
    next.role = prev.role === "transporter" ? "transporter" : "customer";
  } else if (extra.role) {
    next.role = extra.role;
  }
  if (prev.kycComplete) {
    next.role = "transporter";
    next.kycComplete = true;
  }
  await setDoc(ref, next, { merge: true });
}

async function publishPendingCustomer(user) {
  const pending = pendingCustomer();
  if (!pending) return;
  await mergeProfile(user.uid, {
    role: "customer",
    name: pending.contactName,
    phone: pending.contactPhone,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  });
  const loadRef = await addDoc(collection(db, "loads"), {
    customerUid: user.uid,
    leadId: pending.leadId || null,
    loadingLocation: pending.loadingLocation,
    unloadingLocation: pending.unloadingLocation,
    sizeFt: Number(pending.sizeFt),
    bodyType: pending.bodyType,
    tonnage: pending.tonnage,
    contactName: pending.contactName,
    vehicleName: pending.vehicleName || "",
    timerEndsAt: pending.timerEndsAt,
    booked: false,
    status: "open",
    bidCount: 0,
    lowestBidAmount: null,
    lowestBidderUid: null,
    lowestBidId: null,
    acceptedBidderUid: null,
    acceptedBidId: null,
    contactReleased: false,
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, "loadPrivate", loadRef.id), {
    customerUid: user.uid,
    contactPhone: pending.contactPhone,
  });
  sessionStorage.removeItem(PENDING_CUSTOMER);
}

async function publishPendingTransporter(user) {
  const pending = pendingTransporter();
  if (!pending) return;
  await mergeProfile(user.uid, {
    role: "transporter",
    name: pending.name,
    phone: pending.phone,
    dlNumber: pending.dlNumber,
    totalVehicles: pending.totalVehicles,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  });
  sessionStorage.removeItem(PENDING_TRANSPORTER);
}

function paintLoggedOutGate() {
  const hasC = !!pendingCustomer();
  const hasT = !!pendingTransporter();
  if (params.get("next") === "transporter" && hasT) {
    showGate(
      "Complete Verify truck with Google",
      "Your KYC details are ready. Continue with Google to save them and start seeing loads."
    );
  } else if (hasC || params.get("next") === "customer") {
    showGate(
      "Save this booking to your profile",
      "Continue with Google to store your load. Track bids, accept the lowest amount, and confirm the vehicle from this profile."
    );
  } else if (hasT) {
    showGate(
      "Complete Verify truck with Google",
      "Your KYC details are ready. Continue with Google to save them and start seeing loads."
    );
  } else if (params.get("next") === "transporter") {
    showGate(
      "Complete Verify truck first",
      "Fill name, contact, DL number and vehicles owned on the home page, then return here to sign in with Google."
    );
  } else {
    showGate(
      "Sign in to open your profile",
      "Book a truck or complete Verify truck first, then continue with Google. Details you filled stay on this profile."
    );
  }
}

googleBtn.addEventListener("click", async () => {
  gateErr.hidden = true;
  try {
    await signInGoogle();
  } catch (err) {
    gateErr.hidden = false;
    gateErr.textContent = err.message || "Google sign-in failed.";
  }
});

signOutBtn.addEventListener("click", () => signOutUser());

sizeFilter.addEventListener("change", () => {
  renderBoard();
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) {
    if (customerUnsub) customerUnsub();
    if (openLoadsUnsub) openLoadsUnsub();
    if (wonLoadsUnsub) wonLoadsUnsub();
    paintLoggedOutGate();
    return;
  }

  try {
    if (pendingTransporter()) await publishPendingTransporter(user);
    if (pendingCustomer()) await publishPendingCustomer(user);
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) {
      await mergeProfile(user.uid, {
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        name: user.displayName,
      });
    }
    profile = (await getDoc(doc(db, "users", user.uid))).data() || {};
    if (params.get("next") === "transporter" && !profile.kycComplete) {
      showGate(
        "Complete Verify truck first",
        "Fill your transporter details on the home page before Google login. Sign out and complete KYC, then return."
      );
      return;
    }
    renderShell();
    showApp();
  } catch (err) {
    showGate("Could not open profile", err.message || "Try again.");
  }
});

function renderShell() {
  const kyc = Boolean(profile.kycComplete || profile.role === "transporter");
  document.getElementById("profile-name").textContent =
    profile.name || currentUser.displayName || "Member";
  document.getElementById("profile-role").textContent = kyc
    ? "Verified transporter"
    : "Load party";
  document.getElementById("profile-email").textContent = currentUser.email || "";
  document.getElementById("customer-panel").hidden = kyc && !pendingCustomer();
  document.getElementById("transporter-panel").hidden = !kyc;
  renderDetails(kyc);
  listenCustomerLoads();
  if (kyc) {
    fillSizeFilter();
    listenBoard();
  } else if (openLoadsUnsub) {
    openLoadsUnsub();
    openLoadsUnsub = null;
    if (wonLoadsUnsub) wonLoadsUnsub();
    wonLoadsUnsub = null;
  }
}

function renderDetails(kyc) {
  const box = document.getElementById("profile-details");
  if (kyc) {
    box.innerHTML = `
      <div class="detail-grid">
        <div><span>Name</span><strong>${escapeHtml(profile.name || "")}</strong></div>
        <div><span>Contact</span><strong>${escapeHtml(profile.phone || "")}</strong></div>
        <div><span>DL number</span><strong>${escapeHtml(profile.dlNumber || "")}</strong></div>
        <div><span>Vehicles owned</span><strong>${escapeHtml(String(profile.totalVehicles ?? ""))}</strong></div>
      </div>`;
  } else {
    box.innerHTML = `
      <div class="detail-grid">
        <div><span>Name</span><strong>${escapeHtml(profile.name || "")}</strong></div>
        <div><span>Contact</span><strong>${escapeHtml(profile.phone || "")}</strong></div>
        <div><span>Email</span><strong>${escapeHtml(profile.email || currentUser.email || "")}</strong></div>
      </div>`;
  }
}

function listenCustomerLoads() {
  const list = document.getElementById("customer-loads");
  const panel = document.getElementById("customer-panel");
  const q = query(collection(db, "loads"), where("customerUid", "==", currentUser.uid));
  if (customerUnsub) customerUnsub();
  customerUnsub = onSnapshot(q, (snap) => {
    if (!snap.empty) panel.hidden = false;
    if (snap.empty) {
      if (!panel.hidden && profile.kycComplete) panel.hidden = true;
      else list.innerHTML = `<p class="empty-note">No loads yet. Book a truck on the home page to post one.</p>`;
      if (snap.empty && !profile.kycComplete) {
        panel.hidden = false;
      }
      return;
    }
    const docs = snap.docs.sort(
      (a, b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0)
    );
    list.innerHTML = docs.map((d) => customerLoadCard(d.id, d.data())).join("");
    docs.forEach((d) => {
      const data = d.data();
      const timerEl = list.querySelector(`[data-timer="${d.id}"]`);
      if (timerEl) startLoadTimer(timerEl, data.timerEndsAt, data.booked || data.status === "confirmed");
    });
    list.querySelectorAll("[data-accept]").forEach((btn) => {
      btn.addEventListener("click", () => acceptBid(btn.getAttribute("data-accept")));
    });
    list.querySelectorAll("[data-confirm]").forEach((btn) => {
      btn.addEventListener("click", () => confirmVehicle(btn.getAttribute("data-confirm")));
    });
    docs.forEach((d) => {
      const data = d.data();
      if (data.contactReleased && data.acceptedBidId) {
        loadReleasedContact(d.id, data.acceptedBidId);
      }
    });
  });
}

function customerLoadCard(id, data) {
  const v = vehicleMeta(data.bodyType, Number(data.sizeFt));
  const lowest = data.lowestBidAmount;
  const bids = data.bidCount || 0;
  let actions = "";
  if (data.status === "open" && lowest != null) {
    actions = `<button class="submit-btn" type="button" data-accept="${id}">Accept lowest bid</button>`;
  } else if (data.status === "accepted" && !data.contactReleased) {
    actions = `<button class="submit-btn" type="button" data-confirm="${id}">Confirm vehicle</button>
      <p class="field-hint">Confirm to reveal the transporter’s contact. They will not receive your number.</p>`;
  } else if (data.contactReleased) {
    actions = `<div class="contact-reveal" data-contact-box="${id}">Loading transporter contact…</div>`;
  } else {
    actions = `<p class="field-hint">Waiting for bids. Only the lowest amount will be shown.</p>`;
  }
  return `
    <article class="load-card">
      <div class="load-card-top">
        <img src="${v.image}" alt="" />
        <div>
          <strong>${escapeHtml(data.vehicleName || v.name)}</strong>
          <p>${escapeHtml(data.loadingLocation)} → ${escapeHtml(data.unloadingLocation)}</p>
          <p>${escapeHtml(String(data.sizeFt))} ft · ${bodyLabel(data.bodyType)} · ${escapeHtml(String(data.tonnage))} T</p>
        </div>
        <div class="load-timer" data-timer="${id}">10:00</div>
      </div>
      <dl class="bid-stats">
        <div><dt>Total bids</dt><dd>${bids}</dd></div>
        <div><dt>Lowest bid</dt><dd>${lowest == null ? "None yet" : formatInr(lowest)}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(statusLabel(data))}</dd></div>
      </dl>
      ${actions}
    </article>`;
}

function statusLabel(data) {
  if (data.contactReleased || data.status === "confirmed") return "Vehicle confirmed";
  if (data.status === "accepted") return "Bid accepted — confirm vehicle";
  if (data.booked) return "Booked";
  return "Finding truck";
}

async function loadReleasedContact(loadId, bidId) {
  if (!bidId) return;
  try {
    const bid = await getDoc(doc(db, "bids", bidId));
    const box = document.querySelector(`[data-contact-box="${loadId}"]`);
    if (!box || !bid.exists()) return;
    const b = bid.data();
    box.innerHTML = `<p class="success-copy">Transporter contact</p>
      <p><strong>${escapeHtml(b.bidderName)}</strong><br>${escapeHtml(b.bidderPhone)}<br>Vehicle ${escapeHtml(b.vehicleNumber)}</p>`;
  } catch {
    /* still locked until confirm */
  }
}

async function acceptBid(loadId) {
  const load = (await getDoc(doc(db, "loads", loadId))).data();
  if (!load?.lowestBidId) return;
  await updateDoc(doc(db, "loads", loadId), {
    status: "accepted",
    acceptedBidId: load.lowestBidId,
    acceptedBidderUid: load.lowestBidderUid,
  });
}

async function confirmVehicle(loadId) {
  const loadSnap = await getDoc(doc(db, "loads", loadId));
  const load = loadSnap.data();
  await updateDoc(doc(db, "loads", loadId), {
    status: "confirmed",
    booked: true,
    contactReleased: true,
  });
  if (load?.leadId) {
    try {
      await updateDoc(doc(db, "leads", load.leadId), {
        booked: true,
        status: "booked",
        bookedAt: serverTimestamp(),
      });
    } catch {
      /* VIP lead may already be booked */
    }
  }
}

function listenBoard() {
  const openQ = query(collection(db, "loads"), where("status", "==", "open"));
  const wonQ = query(collection(db, "loads"), where("acceptedBidderUid", "==", currentUser.uid));
  if (openLoadsUnsub) openLoadsUnsub();
  if (wonLoadsUnsub) wonLoadsUnsub();
  openLoadsUnsub = onSnapshot(openQ, (snap) => {
    openLoads = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderBoard();
  });
  wonLoadsUnsub = onSnapshot(wonQ, (snap) => {
    wonLoads = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderBoard();
  });
}

function renderBoard() {
  const list = document.getElementById("load-board");
  const size = sizeFilter.value;
  const byId = new Map();
  [...openLoads, ...wonLoads].forEach((d) => byId.set(d.id, d));
  const docs = [...byId.values()]
    .filter((d) => size === "all" || Number(d.sizeFt) === Number(size))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  if (!docs.length) {
    list.innerHTML = `<p class="empty-note">No matching loads right now. Try another size.</p>`;
    return;
  }
  Promise.all(docs.map((d) => renderTransporterCard(d))).then((html) => {
    list.innerHTML = html.join("");
    docs.forEach((d) => {
      const timerEl = list.querySelector(`[data-timer="${d.id}"]`);
      if (timerEl) startLoadTimer(timerEl, d.timerEndsAt, d.booked || d.status === "confirmed");
    });
    list.querySelectorAll(".bid-form").forEach((form) => {
      form.addEventListener("submit", onPlaceBid);
    });
  });
}

async function renderTransporterCard(load) {
  const v = vehicleMeta(load.bodyType, Number(load.sizeFt));
  const myBidSnap = await getDoc(doc(db, "bids", `${load.id}_${currentUser.uid}`));
  const myBid = myBidSnap.exists() ? myBidSnap.data() : null;
  const lowest = load.lowestBidAmount;
  const iAmLowest = load.lowestBidderUid === currentUser.uid && myBid;
  let rankHtml = "";
  if (load.acceptedBidderUid === currentUser.uid) {
    rankHtml = `<div class="win-banner">Load party has accepted your bid. They will contact you shortly. You will not receive their phone number.</div>`;
  } else if (myBid && iAmLowest) {
    rankHtml = `<ol class="bid-rank"><li class="is-you"><span>1</span> Your bid ${formatInr(myBid.amount)} — leading</li></ol>`;
  } else if (myBid && lowest != null && Number(myBid.amount) > Number(lowest)) {
    rankHtml = `<ol class="bid-rank">
      <li><span>1</span> Leading bid ${formatInr(lowest)}</li>
      <li class="is-you"><span>2</span> Your bid ${formatInr(myBid.amount)}</li>
    </ol>`;
  } else if (myBid) {
    rankHtml = `<ol class="bid-rank"><li class="is-you"><span>1</span> Your bid ${formatInr(myBid.amount)}</li></ol>`;
  } else {
    rankHtml = `<p class="field-hint">Place a bid. If a competitor undercuts you, their amount shows as #1 and yours as #2.</p>`;
  }

  const canBid = load.status === "open";
  return `
    <article class="load-card">
      <div class="load-card-top">
        <img src="${v.image}" alt="" />
        <div>
          <strong>${escapeHtml(load.vehicleName || v.name)}</strong>
          <p>${escapeHtml(load.loadingLocation)} → ${escapeHtml(load.unloadingLocation)}</p>
          <p>${escapeHtml(String(load.sizeFt))} ft · ${bodyLabel(load.bodyType)} · ${escapeHtml(String(load.tonnage))} T</p>
        </div>
        <div class="load-timer" data-timer="${load.id}">10:00</div>
      </div>
      ${rankHtml}
      ${canBid ? bidFormHtml(load, myBid) : ""}
    </article>`;
}

function bidFormHtml(load, myBid) {
  return `
    <form class="bid-form" data-load="${load.id}">
      <div class="form-row">
        <label>
          <span class="field-label">Your name</span>
          <input name="bidderName" required value="${escapeHtml(myBid?.bidderName || profile.name || "")}" />
        </label>
        <label>
          <span class="field-label">Contact number</span>
          <input name="bidderPhone" type="tel" required maxlength="10" inputmode="numeric" pattern="[0-9]{10}" value="${escapeHtml(myBid?.bidderPhone || profile.phone || "")}" />
        </label>
      </div>
      <div class="form-row">
        <label>
          <span class="field-label">Vehicle number</span>
          <input name="vehicleNumber" required value="${escapeHtml(myBid?.vehicleNumber || "")}" />
        </label>
        <label>
          <span class="field-label">Bid amount (₹)</span>
          <input name="amount" type="number" min="1" required value="${myBid ? escapeHtml(String(myBid.amount)) : ""}" />
        </label>
      </div>
      <button class="submit-btn" type="submit">${myBid ? "Edit / rebid to take #1" : "Place bid"}</button>
    </form>`;
}

async function onPlaceBid(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const loadId = form.getAttribute("data-load");
  const fd = new FormData(form);
  const amount = Number(fd.get("amount"));
  const loadRef = doc(db, "loads", loadId);
  const loadSnap = await getDoc(loadRef);
  const load = loadSnap.data();
  if (!load || load.status !== "open") return;
  const bidId = `${loadId}_${currentUser.uid}`;
  const bidRef = doc(db, "bids", bidId);
  const prev = await getDoc(bidRef);
  const payload = {
    loadId,
    bidderUid: currentUser.uid,
    bidderName: String(fd.get("bidderName")).trim(),
    bidderPhone: String(fd.get("bidderPhone")).trim(),
    vehicleNumber: String(fd.get("vehicleNumber")).trim().toUpperCase(),
    amount,
    updatedAt: serverTimestamp(),
  };
  if (!prev.exists()) payload.createdAt = serverTimestamp();
  await setDoc(bidRef, payload, { merge: true });

  const update = {};
  if (!prev.exists()) update.bidCount = (load.bidCount || 0) + 1;
  const lowest = load.lowestBidAmount;
  const isLower = lowest == null || amount < Number(lowest);
  const wasMine = load.lowestBidderUid === currentUser.uid;
  if (isLower || wasMine) {
    update.lowestBidAmount = amount;
    update.lowestBidderUid = currentUser.uid;
    update.lowestBidId = bidId;
  }
  if (Object.keys(update).length) await updateDoc(loadRef, update);
}

paintLoggedOutGate();
