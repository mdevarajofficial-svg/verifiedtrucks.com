import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { digits, detailsAreLocked, isAdminUser } from "./admin.js";
import {
  auth,
  db,
  signInGoogle,
  signOutUser,
  completeGoogleRedirect,
  explainAuthError,
  uploadProfilePhoto,
} from "./firebase.js";

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
let adminUnsub = null;
let myLeadsUnsub = null;

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

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function paintLoggedOutGate() {
  showGate("Sign in", "Continue with Google to open your dashboard. Load parties see their posts. Admin sees the lead leaderboard.");
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
    stopMyLeads();
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
  const locked = detailsAreLocked(prev) || prev.detailsLocked === true;
  const next = {
    email: extra.email || prev.email || "",
    displayName: extra.displayName || prev.displayName || "",
    photoURL: extra.photoURL || prev.photoURL || "",
    updatedAt: serverTimestamp(),
  };
  if (!prev.createdAt) next.createdAt = serverTimestamp();
  if (extra.role) next.role = extra.role;
  if (!locked) {
    if (extra.name != null) next.name = String(extra.name).trim();
    else if (prev.name) next.name = prev.name;
    if (extra.phone != null) next.phone = digits(extra.phone);
    else if (prev.phone) next.phone = prev.phone;
    if (extra.detailsLocked) next.detailsLocked = true;
  } else {
    next.name = prev.name || "";
    next.phone = prev.phone || "";
    next.detailsLocked = true;
  }
  await setDoc(ref, next, { merge: true });
}

function renderShell() {
  const admin = isAdminUser(currentUser, profile);
  const locked = detailsAreLocked(profile) || profile.detailsLocked === true;
  const name = profile.name || currentUser.displayName || "Account";
  document.getElementById("profile-name").textContent = admin ? "Admin dashboard" : `Hi, ${name.split(" ")[0]}`;
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

  const userDash = document.getElementById("user-dashboard");
  const adminPanel = document.getElementById("admin-panel");
  if (userDash) userDash.hidden = admin;
  if (adminPanel) adminPanel.hidden = !admin;

  paintDetailsForm(locked);
  if (admin) {
    stopMyLeads();
    listenAdmin();
  } else {
    stopAdmin();
    listenMyLeads();
  }
}

function paintDetailsForm(locked) {
  const form = document.getElementById("details-form");
  const box = document.getElementById("profile-details");
  const hint = document.getElementById("details-hint");
  const nameInput = document.getElementById("profile-fullname");
  const phoneInput = document.getElementById("profile-phone");
  if (locked) {
    if (form) form.hidden = true;
    if (hint) hint.textContent = "Name and mobile are locked on this account.";
    if (box) {
      box.hidden = false;
      box.innerHTML = `
        <div class="locked-grid">
          <div><span>Name</span><strong>${escapeHtml(profile.name || "—")}</strong></div>
          <div><span>Mobile</span><strong>${escapeHtml(profile.phone || "—")}</strong></div>
        </div>`;
    }
    return;
  }
  if (form) form.hidden = false;
  if (box) box.hidden = true;
  if (hint) {
    hint.textContent = "Fill your name and 10-digit mobile once. After you save, these cannot be changed.";
  }
  if (nameInput) nameInput.value = profile.name || currentUser.displayName || "";
  if (phoneInput) phoneInput.value = profile.phone || "";
}

document.getElementById("details-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("details-message");
  const name = document.getElementById("profile-fullname")?.value.trim() || "";
  const phone = digits(document.getElementById("profile-phone")?.value);
  const showMsg = (text, type) => {
    if (!msg) return;
    msg.hidden = false;
    msg.className = `form-message ${type || ""}`;
    msg.textContent = text;
  };
  if (!currentUser) return;
  if (detailsAreLocked(profile) || profile.detailsLocked) {
    showMsg("Name and mobile are already locked.", "error");
    return;
  }
  if (name.length < 2) {
    showMsg("Enter your name.", "error");
    return;
  }
  if (!/^\d{10}$/.test(phone)) {
    showMsg("Enter a 10-digit mobile number.", "error");
    return;
  }
  try {
    await mergeProfile(currentUser.uid, { name, phone, detailsLocked: true });
    profile = { ...profile, name, phone, detailsLocked: true };
    showMsg("Details saved. They cannot be edited later.", "success");
    renderShell();
  } catch (err) {
    showMsg(err?.message || "Could not save details.", "error");
  }
});

function postedMs(row) {
  if (Number.isFinite(row?.createdAtMs)) return row.createdAtMs;
  if (row?.createdAt?.toMillis) return row.createdAt.toMillis();
  if (Number.isFinite(row?.createdAt?.seconds)) return row.createdAt.seconds * 1000;
  return 0;
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

function kmText(row) {
  const km = row.distanceKm ?? row.km;
  return km != null && km !== "" ? `${km} km` : "—";
}

function sizeText(row) {
  const size = row.sizeFeet ?? row.sizeFt;
  return size != null && size !== "" ? `${size} ft` : "—";
}

function stopAdmin() {
  if (adminUnsub) adminUnsub();
  adminUnsub = null;
}

function stopMyLeads() {
  if (myLeadsUnsub) myLeadsUnsub();
  myLeadsUnsub = null;
}

function listenAdmin() {
  stopAdmin();
  const board = document.getElementById("admin-board");
  adminUnsub = onSnapshot(collection(db, "leads"), (snap) => {
    const rows = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => postedMs(b) - postedMs(a));
    renderAdminBoard(rows);
  }, (err) => {
    if (board) board.innerHTML = `<p class="form-message error">${escapeHtml(err.message)}</p>`;
  });
}

function renderAdminBoard(rows) {
  const board = document.getElementById("admin-board");
  if (!board) return;
  if (!rows.length) {
    board.innerHTML = `<p class="empty-note">No leads yet.</p>`;
    return;
  }
  const body = rows.map((lead, i) => `
    <tr>
      <td class="lb-rank">${i + 1}</td>
      <td>${escapeHtml(lead.loadingLocation || "—")}</td>
      <td>${escapeHtml(lead.unloadingLocation || "—")}</td>
      <td>${escapeHtml(sizeText(lead))}</td>
      <td>${escapeHtml(lead.tonnage != null ? `${lead.tonnage} T` : "—")}</td>
      <td>${escapeHtml(kmText(lead))}</td>
      <td>${escapeHtml(lead.contactPhone || "—")}</td>
      <td>${escapeHtml(formatStamp(lead.createdAt || lead.createdAtMs))}</td>
    </tr>`).join("");
  board.innerHTML = `
    <div class="leaderboard-wrap">
      <table class="lead-table">
        <thead>
          <tr>
            <th>#</th>
            <th>From</th>
            <th>To</th>
            <th>Size</th>
            <th>Tonnage</th>
            <th>Distance</th>
            <th>Phone</th>
            <th>Loading date & time</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function listenMyLeads() {
  stopMyLeads();
  const list = document.getElementById("my-leads");
  myLeadsUnsub = onSnapshot(collection(db, "leads"), (snap) => {
    const uid = currentUser?.uid;
    const phone = digits(profile?.phone);
    const mine = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((lead) => {
        if (uid && (lead.posterUid === uid || lead.customerUid === uid)) return true;
        if (phone && digits(lead.contactPhone) === phone) return true;
        return false;
      })
      .sort((a, b) => postedMs(b) - postedMs(a));
    paintMyLeads(mine);
  }, () => {
    if (list) list.innerHTML = `<p class="empty-note">Could not load your posts.</p>`;
  });
}

function paintMyLeads(rows) {
  const list = document.getElementById("my-leads");
  if (!list) return;
  if (!rows.length) {
    list.innerHTML = `<p class="empty-note">No loads posted on this account yet. Use Book truck on the home page.</p>`;
    return;
  }
  list.innerHTML = rows.map((lead) => `
    <article class="user-load-card">
      <p class="user-load-when">${escapeHtml(formatStamp(lead.createdAt || lead.createdAtMs))}</p>
      <h3>${escapeHtml(lead.loadingLocation || "—")} <span>→</span> ${escapeHtml(lead.unloadingLocation || "—")}</h3>
      <dl>
        <div><dt>Size</dt><dd>${escapeHtml(sizeText(lead))}</dd></div>
        <div><dt>Weight</dt><dd>${escapeHtml(lead.tonnage != null ? `${lead.tonnage} T` : "—")}</dd></div>
        <div><dt>Distance</dt><dd>${escapeHtml(kmText(lead))}</dd></div>
      </dl>
    </article>`).join("");
}

completeGoogleRedirect().catch((err) => {
  if (!auth.currentUser) {
    paintLoggedOutGate();
    showGateError(err);
  }
});

paintLoggedOutGate();
