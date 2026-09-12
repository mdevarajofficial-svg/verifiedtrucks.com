import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { isAdminUser } from "./admin.js";
import { auth, db, signInGoogle, signOutUser, completeGoogleRedirect, explainAuthError } from "./firebase.js";
import {
  VEHICLES,
  formatMmSs,
  remainingUntil,
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
let loadsUnsub = null;
let myBidsUnsub = null;
let allBidsUnsub = null;
let loadsById = new Map();
let myBids = [];
let myLoads = new Map();
let bidsByLoad = new Map();
const loadTimers = new Map();
let expireSweep = null;
let adminUnsubs = [];
let adminLoads = [];
let adminBids = [];
let adminPrivate = {};
let adminLeads = [];

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

function bodyLabel(type) {
  return type === "container" ? "Container" : "Open";
}

function loadLine(data) {
  const size = data.sizeFt || data.sizeFeet || "—";
  return `${escapeHtml(String(size))} ft · ${bodyLabel(data.bodyType)} · ${escapeHtml(String(data.tonnage || "—"))} T`;
}

function loadRoute(data) {
  return `${escapeHtml(data.loadingLocation || "—")} → ${escapeHtml(data.unloadingLocation || "—")}`;
}

function isLiveLoad(load) {
  if (!load) return false;
  if (load.status === "withdrawn" || load.status === "deleted") return false;
  return remainingUntil(load.timerEndsAt) > 0;
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

function startLoadTimer(el, endsAt) {
  if (loadTimers.has(el)) clearInterval(loadTimers.get(el));
  const tick = () => {
    const rem = remainingUntil(endsAt);
    el.textContent = rem > 0 ? formatMmSs(rem) : "0:00";
    el.classList.toggle("is-heartbeat", rem > 0);
    if (rem <= 0) {
      clearInterval(loadTimers.get(el));
      loadTimers.delete(el);
    }
  };
  tick();
  if (remainingUntil(endsAt) > 0) loadTimers.set(el, setInterval(tick, 250));
}

function bindTimers(root, docs) {
  docs.forEach((d) => {
    const timerEl = root.querySelector(`[data-timer="${d.id}"]`);
    if (timerEl) startLoadTimer(timerEl, d.timerEndsAt);
  });
}

function refreshLists() {
  paintMyLoads(document.getElementById("customer-loads"));
  paintMyBids();
  renderBoard();
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
  showGate(
    "Login with Google",
    "Sign in with Google. This device stays signed in until you tap Sign out. See live loads you posted, bids you placed, and the 30-minute market."
  );
}

function showGateError(err) {
  gateErr.hidden = false;
  gateErr.className = "form-message error";
  gateErr.textContent = err?.friendlyMessage || explainAuthError(err) || "Google sign-in failed.";
}

googleBtn.addEventListener("click", async () => {
  gateErr.hidden = true;
  gateErr.className = "form-message";
  googleBtn.disabled = true;
  try {
    await signInGoogle();
  } catch (err) {
    showGateError(err);
  } finally {
    googleBtn.disabled = false;
  }
});

signOutBtn.addEventListener("click", () => signOutUser());

sizeFilter.addEventListener("change", () => {
  renderBoard();
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) {
    if (loadsUnsub) loadsUnsub();
    if (myBidsUnsub) myBidsUnsub();
    if (allBidsUnsub) allBidsUnsub();
    if (expireSweep) clearInterval(expireSweep);
    expireSweep = null;
    loadTimers.forEach((id) => clearInterval(id));
    loadTimers.clear();
    stopAdmin();
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
    renderShell();
    showApp();
  } catch (err) {
    showGate("Could not open profile", explainAuthError(err));
    showGateError(err);
  }
});

function renderShell() {
  const admin = isAdminUser(currentUser, profile);
  document.getElementById("profile-name").textContent =
    profile.name || currentUser.displayName || "Member";
  document.getElementById("profile-role").textContent = admin ? "Admin" : "Member";
  document.getElementById("profile-email").textContent = currentUser.email || "";
  document.getElementById("customer-panel").hidden = false;
  document.getElementById("my-bids-panel").hidden = false;
  document.getElementById("transporter-panel").hidden = false;
  document.getElementById("admin-panel").hidden = !admin;
  const phoneInput = document.getElementById("profile-phone");
  if (phoneInput) phoneInput.value = profile.phone || "";
  renderDetails();
  listenLoads();
  listenAllBids();
  listenMyBids();
  fillSizeFilter();
  if (expireSweep) clearInterval(expireSweep);
  expireSweep = setInterval(() => {
    const expired = [...document.querySelectorAll("[data-ends]")].some(
      (el) => Number(el.getAttribute("data-ends")) <= Date.now()
    );
    if (expired) refreshLists();
  }, 1000);
  if (admin) listenAdmin();
  else stopAdmin();
}

function renderDetails() {
  const box = document.getElementById("profile-details");
  box.innerHTML = `
      <div class="detail-grid">
        <div><span>Name</span><strong>${escapeHtml(profile.name || currentUser.displayName || "")}</strong></div>
        <div><span>Contact</span><strong>${escapeHtml(profile.phone || "")}</strong></div>
        <div><span>Email</span><strong>${escapeHtml(profile.email || currentUser.email || "")}</strong></div>
      </div>`;
}

function listenLoads() {
  const list = document.getElementById("customer-loads");
  const panel = document.getElementById("customer-panel");
  panel.hidden = false;
  if (loadsUnsub) loadsUnsub();
  loadsUnsub = onSnapshot(collection(db, "loads"), (snap) => {
    loadsById = new Map();
    snap.docs.forEach((d) => loadsById.set(d.id, { id: d.id, ...d.data() }));
    myLoads = new Map();
    loadsById.forEach((load, id) => {
      if (load.posterUid === currentUser.uid || load.customerUid === currentUser.uid) {
        myLoads.set(id, load);
      }
    });
    paintMyLoads(list);
    paintMyBids();
    renderBoard();
  }, () => {
    paintMyLoads(list);
    paintMyBids();
    renderBoard();
  });
}

function listenAllBids() {
  if (allBidsUnsub) allBidsUnsub();
  allBidsUnsub = onSnapshot(collection(db, "bids"), (snap) => {
    bidsByLoad = new Map();
    snap.docs.forEach((d) => {
      const b = { id: d.id, ...d.data() };
      if (b.status === "rejected") return;
      const arr = bidsByLoad.get(b.loadId) || [];
      arr.push(b);
      bidsByLoad.set(b.loadId, arr);
    });
    bidsByLoad.forEach((arr) => arr.sort((a, b) => Number(a.amount) - Number(b.amount)));
    refreshLists();
  });
}

function paintMyLoads(list) {
  if (!list) return;
  const docs = [...myLoads.values()]
    .filter(isLiveLoad)
    .sort((a, b) => (b.createdAt?.seconds || b.createdAtMs || 0) - (a.createdAt?.seconds || a.createdAtMs || 0));
  if (!docs.length) {
    list.innerHTML = `<p class="empty-note">No live loads on this Google account. Login, then book a truck on Home. Expired posts leave this list when the 30 minutes end.</p>`;
    return;
  }
  list.innerHTML = docs.map((d) => customerLoadCard(d.id, d)).join("");
  bindTimers(list, docs);
  list.querySelectorAll("[data-accept]").forEach((btn) => {
    btn.addEventListener("click", () => acceptBid(btn.getAttribute("data-accept"), btn.getAttribute("data-bid")));
  });
  list.querySelectorAll("[data-reject]").forEach((btn) => {
    btn.addEventListener("click", () => rejectBid(btn.getAttribute("data-accept"), btn.getAttribute("data-bid")));
  });
  list.querySelectorAll("[data-delete-load]").forEach((btn) => {
    btn.addEventListener("click", () => deleteLoad(btn.getAttribute("data-delete-load")));
  });
}

function listenMyBids() {
  const list = document.getElementById("my-bids");
  const panel = document.getElementById("my-bids-panel");
  if (!list || !panel) return;
  panel.hidden = false;
  const q = query(collection(db, "bids"), where("bidderUid", "==", currentUser.uid));
  if (myBidsUnsub) myBidsUnsub();
  myBidsUnsub = onSnapshot(q, (snap) => {
    myBids = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((b) => b.status !== "rejected")
      .sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0));
    paintMyBids();
  }, (err) => {
    list.innerHTML = `<p class="empty-note">Could not load your bids. ${escapeHtml(err.message || "")}</p>`;
  });
}

function paintMyBids() {
  const list = document.getElementById("my-bids");
  if (!list) return;
  const rows = myBids
    .map((bid) => ({ bid, load: loadsById.get(bid.loadId) }))
    .filter(({ load }) => isLiveLoad(load));
  if (!rows.length) {
    list.innerHTML = `<p class="empty-note">No live bids. Place a bid from the market below, or wait — ended loads leave this list.</p>`;
    return;
  }
  list.innerHTML = rows.map(({ bid, load }) => myBidCard(bid, load)).join("");
  bindTimers(list, rows.map((r) => r.load));
  list.querySelectorAll("[data-delete-bid]").forEach((btn) => {
    btn.addEventListener("click", () => deleteBid(btn.getAttribute("data-delete-bid"), btn.getAttribute("data-load")));
  });
}

function myBidStatus(bid, load) {
  if (!load) return "Load unavailable";
  if (load.acceptedBidderUid === currentUser.uid && (load.booked || load.contactReleased || load.status === "confirmed")) {
    return "Your bid was booked";
  }
  if (load.acceptedBidderUid === currentUser.uid) return "Load party accepted your bid";
  if (load.booked || load.status === "confirmed") return "Another vehicle was booked";
  if (load.lowestBidderUid === currentUser.uid) return "Leading";
  if (load.lowestBidAmount != null && Number(bid.amount) > Number(load.lowestBidAmount)) {
    return `Behind lowest ${formatInr(load.lowestBidAmount)}`;
  }
  return "Waiting";
}

function myBidCard(bid, load) {
  return `
    <article class="load-card load-card-simple">
      <div class="load-card-head">
        <div>
          <strong>${loadRoute(load)}</strong>
          <p>${loadLine(load)}</p>
        </div>
        <div class="load-timer" data-timer="${load.id}" data-ends="${Number(load.timerEndsAt) || 0}">30:00</div>
      </div>
      <dl class="bid-stats">
        <div><dt>Your bid</dt><dd>${formatInr(bid.amount)}</dd></div>
        <div><dt>Vehicle no.</dt><dd>${escapeHtml(bid.vehicleNumber || "—")}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(myBidStatus(bid, load))}</dd></div>
      </dl>
      <button class="text-btn delete-btn" type="button" data-delete-bid="${bid.id}" data-load="${load.id}">Delete bid</button>
    </article>`;
}

function customerLoadCard(id, data) {
  const liveBids = (bidsByLoad.get(id) || []).filter((b) => b.status !== "rejected");
  const best = liveBids[0] || null;
  const lowest = best ? best.amount : data.lowestBidAmount;
  let actions = "";
  if (data.contactReleased && data.acceptedBidId) {
    const won = liveBids.find((b) => b.id === data.acceptedBidId) || best;
    const phone = won?.bidderPhone || won?.phone || "";
    actions = `<div class="contact-reveal">
      <p class="success-copy">Bid accepted — bidder contact</p>
      <p><strong>${escapeHtml(won?.bidderName || "Bidder")}</strong><br>${escapeHtml(phone)}<br>Vehicle ${escapeHtml(won?.vehicleNumber || "—")}</p>
    </div>`;
  } else if (best && data.status === "open") {
    actions = `<p class="field-hint">Best bid (lowest): ${formatInr(best.amount)} · ${escapeHtml(best.vehicleNumber || "")}</p>
      <div class="cta-row">
        <button class="submit-btn" type="button" data-accept="${id}" data-bid="${best.id}">Accept lowest bid</button>
        <button class="text-btn" type="button" data-accept="${id}" data-bid="${best.id}" data-reject>Reject lowest bid</button>
      </div>`;
  } else {
    actions = `<p class="field-hint">Waiting for bids.</p>`;
  }
  return `
    <article class="load-card load-card-simple">
      <div class="load-card-head">
        <div>
          <strong>${loadRoute(data)}</strong>
          <p>${loadLine(data)}</p>
        </div>
        <div class="load-timer" data-timer="${id}" data-ends="${Number(data.timerEndsAt) || 0}">30:00</div>
      </div>
      <dl class="bid-stats">
        <div><dt>Bids</dt><dd>${liveBids.length || data.bidCount || 0}</dd></div>
        <div><dt>Best</dt><dd>${lowest == null ? "None yet" : formatInr(lowest)}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(statusLabel(data))}</dd></div>
      </dl>
      ${actions}
      <button class="text-btn delete-btn" type="button" data-delete-load="${id}">Delete load</button>
    </article>`;
}

function statusLabel(data) {
  if (data.contactReleased || data.status === "confirmed" || data.status === "accepted") return "Bid accepted";
  if (data.booked) return "Booked";
  return "Open";
}

async function acceptBid(loadId, bidId) {
  const load = myLoads.get(loadId) || (await getDoc(doc(db, "loads", loadId))).data();
  const chosenId = bidId || load?.lowestBidId;
  if (!chosenId) return;
  const bidSnap = await getDoc(doc(db, "bids", chosenId));
  const bid = bidSnap.exists() ? bidSnap.data() : {};
  await updateDoc(doc(db, "loads", loadId), {
    status: "accepted",
    acceptedBidId: chosenId,
    acceptedBidderUid: bid.bidderUid || load.lowestBidderUid || null,
    booked: true,
    contactReleased: true,
    bookedAt: serverTimestamp(),
  });
  if (load?.leadId) {
    try {
      await updateDoc(doc(db, "leads", load.leadId), {
        booked: true,
        status: "booked",
        bookedAt: serverTimestamp(),
      });
    } catch {
      /* VIP may already have marked it */
    }
  }
}

async function rejectBid(loadId, bidId) {
  if (!bidId) return;
  await updateDoc(doc(db, "bids", bidId), { status: "rejected" });
  const rest = (bidsByLoad.get(loadId) || []).filter((b) => b.id !== bidId && b.status !== "rejected");
  const next = rest[0];
  await updateDoc(doc(db, "loads", loadId), {
    lowestBidAmount: next ? Number(next.amount) : null,
    lowestBidderUid: next?.bidderUid || null,
    lowestBidId: next ? next.id : null,
    bidCount: rest.length,
  });
}

async function deleteLoad(loadId) {
  if (!loadId || !currentUser) return;
  if (!window.confirm("Delete this load? It will leave the market for everyone.")) return;
  try {
    await deleteDoc(doc(db, "loads", loadId));
  } catch (err) {
    window.alert(err.message || "Could not delete this load.");
    return;
  }
  try {
    await deleteDoc(doc(db, "loadPrivate", loadId));
  } catch {
    /* optional private record */
  }
}

async function deleteBid(bidId, loadId) {
  if (!bidId || !currentUser) return;
  if (!window.confirm("Delete this bid?")) return;
  try {
    await deleteDoc(doc(db, "bids", bidId));
  } catch (err) {
    window.alert(err.message || "Could not delete this bid.");
    return;
  }
  const rest = (bidsByLoad.get(loadId) || []).filter((b) => b.id !== bidId && b.status !== "rejected");
  const next = rest[0];
  const load = loadsById.get(loadId);
  if (!load || !isLiveLoad(load)) return;
  try {
    await updateDoc(doc(db, "loads", loadId), {
      lowestBidAmount: next ? Number(next.amount) : null,
      lowestBidderUid: next?.bidderUid || null,
      lowestBidId: next ? next.id : null,
      bidCount: rest.length,
    });
  } catch {
    /* load may already be gone */
  }
}

function isOwnLoad(load) {
  return Boolean(currentUser && (
    load.posterUid === currentUser.uid || load.customerUid === currentUser.uid
  ));
}

function renderBoard() {
  const list = document.getElementById("load-board");
  if (!list || !sizeFilter) return;
  const size = sizeFilter.value;
  const docs = [...loadsById.values()]
    .filter((d) => isLiveLoad(d) && d.status === "open" && !d.booked && !isOwnLoad(d))
    .filter((d) => size === "all" || Number(d.sizeFt || d.sizeFeet) === Number(size))
    .sort((a, b) => (b.createdAt?.seconds || b.createdAtMs || 0) - (a.createdAt?.seconds || a.createdAtMs || 0));
  if (!docs.length) {
    list.innerHTML = `<p class="empty-note">No live loads in this 30-minute window.</p>`;
    return;
  }
  list.innerHTML = docs.map((d) => renderMarketCard(d)).join("");
  bindTimers(list, docs);
  list.querySelectorAll(".bid-form").forEach((form) => {
    form.addEventListener("submit", onPlaceBid);
  });
}

function renderMarketCard(load) {
  const bidId = `${load.id}_${currentUser.uid}`;
  const myBid = (bidsByLoad.get(load.id) || []).find((b) => b.id === bidId || b.bidderUid === currentUser.uid) || null;
  const lowest = load.lowestBidAmount;
  const iAmLowest = load.lowestBidderUid === currentUser.uid && myBid;
  let rankHtml = "";
  if (myBid && iAmLowest) {
    rankHtml = `<p class="field-hint">Your bid ${formatInr(myBid.amount)} is leading.</p>`;
  } else if (myBid && lowest != null && Number(myBid.amount) > Number(lowest)) {
    rankHtml = `<p class="field-hint">Leading ${formatInr(lowest)} · yours ${formatInr(myBid.amount)}</p>`;
  } else if (lowest != null) {
    rankHtml = `<p class="field-hint">Lowest bid ${formatInr(lowest)}</p>`;
  } else {
    rankHtml = `<p class="field-hint">No bids yet.</p>`;
  }

  return `
    <article class="load-card load-card-simple">
      <div class="load-card-head">
        <div>
          <strong>${loadRoute(load)}</strong>
          <p>${loadLine(load)}</p>
        </div>
        <div class="load-timer" data-timer="${load.id}" data-ends="${Number(load.timerEndsAt) || 0}">30:00</div>
      </div>
      ${rankHtml}
      ${bidFormHtml(load, myBid)}
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
  if (isOwnLoad(load)) return;
  const bidId = `${loadId}_${currentUser.uid}`;
  const bidRef = doc(db, "bids", bidId);
  const prev = await getDoc(bidRef);
  const phone = String(fd.get("bidderPhone")).trim();
  const payload = {
    loadId,
    bidderUid: currentUser.uid,
    bidderName: String(fd.get("bidderName")).trim(),
    bidderPhone: phone,
    phone,
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

function formatStamp(value) {
  if (!value) return "—";
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stopAdmin() {
  adminUnsubs.forEach((unsub) => unsub());
  adminUnsubs = [];
}

function listenAdmin() {
  stopAdmin();
  const board = document.getElementById("admin-board");
  const paint = () => renderAdminBoard();
  adminUnsubs.push(onSnapshot(collection(db, "loads"), (snap) => {
    adminLoads = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    paint();
  }, (err) => { board.innerHTML = `<p class="form-message error">${escapeHtml(err.message)}</p>`; }));
  adminUnsubs.push(onSnapshot(collection(db, "bids"), (snap) => {
    adminBids = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    paint();
  }));
  adminUnsubs.push(onSnapshot(collection(db, "loadPrivate"), (snap) => {
    adminPrivate = {};
    snap.docs.forEach((d) => { adminPrivate[d.id] = d.data(); });
    paint();
  }));
  adminUnsubs.push(onSnapshot(collection(db, "leads"), (snap) => {
    adminLeads = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    paint();
  }));
}

function renderAdminBoard() {
  const board = document.getElementById("admin-board");
  if (!board) return;
  const byLoad = new Map();
  adminBids.forEach((bid) => {
    const list = byLoad.get(bid.loadId) || [];
    list.push(bid);
    byLoad.set(bid.loadId, list);
  });
  const loadCards = adminLoads
    .slice()
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .map((load) => {
      const bids = (byLoad.get(load.id) || []).sort((a, b) => (b.createdAt?.seconds || a.updatedAt?.seconds || 0) - (a.createdAt?.seconds || a.updatedAt?.seconds || 0));
      const phone = adminPrivate[load.id]?.contactPhone || "—";
      const booked = load.booked || load.status === "confirmed";
      const bidHtml = bids.length
        ? bids.map((bid) => `
            <li class="admin-bid">
              <div>
                <strong>${escapeHtml(bid.bidderName || "Bidder")}</strong>
                <p>${escapeHtml(bid.bidderPhone || "—")} · ${escapeHtml(bid.vehicleNumber || "—")} · ${formatInr(bid.amount)}</p>
                <p class="admin-stamp">Bid ${formatStamp(bid.createdAt)} · Updated ${formatStamp(bid.updatedAt)}</p>
              </div>
              ${booked
                ? (load.acceptedBidId === bid.id ? `<span class="admin-ok">Booked</span>` : "")
                : `<button type="button" class="submit-btn" data-admin-book="${load.id}" data-bid="${bid.id}" data-bidder="${escapeHtml(bid.bidderUid || "")}">Mark booked</button>`}
            </li>`).join("")
        : `<li class="admin-bid"><p>No bids yet.</p>${booked ? "" : `<button type="button" class="submit-btn" data-admin-book="${load.id}">Mark booked</button>`}</li>`;
      return `
        <article class="admin-card">
          <div class="admin-card-top">
            <div>
              <strong>${escapeHtml(load.vehicleName || "Load")}</strong>
              <p>${escapeHtml(load.loadingLocation || "—")} → ${escapeHtml(load.unloadingLocation || "—")}</p>
              <p>${escapeHtml(String(load.sizeFt || "—"))} ft · ${bodyLabel(load.bodyType)} · ${escapeHtml(String(load.tonnage || "—"))} T</p>
              <p>Load party phone: <strong>${escapeHtml(phone)}</strong></p>
              <p class="admin-stamp">Posted ${formatStamp(load.createdAt)}${load.bookedAt ? ` · Booked ${formatStamp(load.bookedAt)}` : ""}</p>
            </div>
            <div class="load-timer${booked ? " is-booked" : ""}">${booked ? "Booked" : formatMmSs(remainingUntil(load.timerEndsAt))}</div>
          </div>
          <ul class="admin-bids">${bidHtml}</ul>
        </article>`;
    }).join("");

  const linkedLeadIds = new Set(adminLoads.map((l) => l.leadId).filter(Boolean));
  const looseLeads = adminLeads.filter((lead) => !linkedLeadIds.has(lead.id));
  const leadCards = looseLeads
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
    .map((lead) => `
      <article class="admin-card">
        <div class="admin-card-top">
          <div>
            <strong>${escapeHtml(lead.vehicleName || "Home booking")}</strong>
            <p>${escapeHtml(lead.loadingLocation || "—")} → ${escapeHtml(lead.unloadingLocation || "—")}</p>
            <p>${escapeHtml(String(lead.sizeFeet || "—"))} ft · ${escapeHtml(lead.bodyType || "—")} · ${escapeHtml(String(lead.tonnage || "—"))} T</p>
            <p>Phone: <strong>${escapeHtml(lead.contactPhone || "—")}</strong></p>
            <p class="admin-stamp">Posted ${formatStamp(lead.createdAt || lead.createdAtMs)}${lead.bookedAt ? ` · Booked ${formatStamp(lead.bookedAt)}` : ""}</p>
          </div>
          <div class="load-timer${lead.booked ? " is-booked" : ""}">${lead.booked ? "Booked" : formatMmSs(remainingUntil(lead.timerEndsAt))}</div>
        </div>
        ${lead.booked ? `<p class="admin-ok">Vehicle booked</p>` : `<button type="button" class="submit-btn" data-admin-lead="${lead.id}">Mark booked</button>`}
      </article>`).join("");

  board.innerHTML = (loadCards || "") + (leadCards || "") || `<p class="empty-note">No bookings yet.</p>`;
  board.querySelectorAll("[data-admin-book]").forEach((btn) => {
    btn.addEventListener("click", () => adminMarkLoad(btn.getAttribute("data-admin-book"), btn.getAttribute("data-bid"), btn.getAttribute("data-bidder")));
  });
  board.querySelectorAll("[data-admin-lead]").forEach((btn) => {
    btn.addEventListener("click", () => adminMarkLead(btn.getAttribute("data-admin-lead")));
  });
}

async function adminMarkLoad(loadId, bidId, bidderUid) {
  const loadSnap = await getDoc(doc(db, "loads", loadId));
  const load = loadSnap.data() || {};
  const payload = {
    booked: true,
    status: "confirmed",
    contactReleased: true,
    bookedAt: serverTimestamp(),
  };
  if (bidId) {
    payload.acceptedBidId = bidId;
    payload.acceptedBidderUid = bidderUid || load.lowestBidderUid || null;
  }
  await updateDoc(doc(db, "loads", loadId), payload);
  if (load.leadId) await adminMarkLead(load.leadId);
}

async function adminMarkLead(leadId) {
  if (!leadId) return;
  try {
    await updateDoc(doc(db, "leads", leadId), {
      booked: true,
      status: "booked",
      bookedAt: serverTimestamp(),
    });
  } catch {
    /* already booked */
  }
}

document.getElementById("phone-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const phone = document.getElementById("profile-phone").value.trim();
  if (!currentUser) return;
  if (phone && !/^\d{10}$/.test(phone)) return;
  await mergeProfile(currentUser.uid, { phone });
  profile = { ...profile, phone };
  renderDetails();
});

completeGoogleRedirect().catch((err) => {
  paintLoggedOutGate();
  showGateError(err);
});

paintLoggedOutGate();
