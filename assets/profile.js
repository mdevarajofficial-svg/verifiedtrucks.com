import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { isAdminUser } from "./admin.js";
import {
  auth,
  db,
  signInGoogle,
  signOutUser,
  completeGoogleRedirect,
  explainAuthError,
  uploadProfilePhoto,
} from "./firebase.js";
import { formatMmSs, remainingUntil } from "./booking-common.js";

const gate = document.getElementById("profile-gate");
const app = document.getElementById("profile-app");
const gateTitle = document.getElementById("gate-title");
const gateCopy = document.getElementById("gate-copy");
const googleBtn = document.getElementById("profile-google");
const gateErr = document.getElementById("gate-error");
const signOutBtn = document.getElementById("profile-signout");
const photoInput = document.getElementById("profile-photo-file");
const photoBtn = document.getElementById("profile-photo-btn");
const photoErr = document.getElementById("profile-photo-error");

let currentUser = null;
let profile = null;
let adminUnsubs = [];
let adminLoads = [];
let adminBids = [];
let adminPrivate = {};
let adminLeads = [];

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

function paintLoggedOutGate() {
  showGate("Sign in", "Continue with Google to save your number and photo on this device.");
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
  const label = googleBtn.querySelector(".google-btn-label");
  if (label) label.textContent = "Opening Google…";
  try {
    await signInGoogle();
  } catch (err) {
    showGateError(err);
  } finally {
    googleBtn.disabled = false;
    if (label) label.textContent = "Continue with Google";
  }
});

signOutBtn.addEventListener("click", () => signOutUser());

photoBtn?.addEventListener("click", () => photoInput?.click());
photoInput?.addEventListener("change", async () => {
  const file = photoInput.files?.[0];
  photoInput.value = "";
  if (!file || !currentUser) return;
  if (!file.type.startsWith("image/")) {
    showPhotoError("Choose a JPG or PNG photo.");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showPhotoError("Use a photo smaller than 5 MB.");
    return;
  }
  photoBtn.disabled = true;
  showPhotoError("");
  try {
    const url = await uploadProfilePhoto(currentUser.uid, file);
    await mergeProfile(currentUser.uid, { photoURL: url });
    profile = { ...profile, photoURL: url };
    renderShell();
  } catch (err) {
    showPhotoError(err?.friendlyMessage || err?.message || "Could not upload the photo.");
  } finally {
    photoBtn.disabled = false;
  }
});

function showPhotoError(text) {
  if (!photoErr) return;
  photoErr.hidden = !text;
  photoErr.textContent = text;
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) {
    stopAdmin();
    paintLoggedOutGate();
    return;
  }

  try {
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
  if (extra.role) next.role = extra.role;
  await setDoc(ref, next, { merge: true });
}

function renderShell() {
  const admin = isAdminUser(currentUser, profile);
  const name = profile.name || currentUser.displayName || "Account";
  document.getElementById("profile-name").textContent = name;
  document.getElementById("profile-role").textContent = admin ? "Admin" : "Load party";
  document.getElementById("profile-email").textContent = currentUser.email || profile.email || "";
  const avatar = document.getElementById("profile-avatar");
  const photo = profile.photoURL || currentUser.photoURL || "";
  if (photo) {
    avatar.hidden = false;
    avatar.src = photo;
    avatar.alt = name;
  } else {
    avatar.hidden = true;
    avatar.removeAttribute("src");
  }
  document.getElementById("admin-panel").hidden = !admin;
  const phoneInput = document.getElementById("profile-phone");
  if (phoneInput) phoneInput.value = profile.phone || "";
  if (admin) listenAdmin();
  else stopAdmin();
}

document.getElementById("phone-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const phone = document.getElementById("profile-phone").value.trim();
  const msg = document.getElementById("phone-save-msg");
  if (!currentUser) return;
  if (phone && !/^\d{10}$/.test(phone)) {
    if (msg) {
      msg.hidden = false;
      msg.className = "form-message error";
      msg.textContent = "Enter a 10-digit mobile number.";
    }
    return;
  }
  await mergeProfile(currentUser.uid, { phone });
  profile = { ...profile, phone };
  if (msg) {
    msg.hidden = false;
    msg.className = "form-message";
    msg.textContent = "Number saved.";
  }
});

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

completeGoogleRedirect().catch((err) => {
  if (!auth.currentUser) {
    paintLoggedOutGate();
    showGateError(err);
  }
});

paintLoggedOutGate();
