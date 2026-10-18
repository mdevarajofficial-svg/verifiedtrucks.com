import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  initializeAuth,
  getAuth,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js";

const firebaseConfig = await fetch("/firebase-config.json").then((r) => r.json());
export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

function makeAuth() {
  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = makeAuth();
export const db = getFirestore(app);
export const storage = getStorage(app);
const storageFallback = getStorage(app, "gs://verifiedtrucks-20.appspot.com");

const provider = new GoogleAuthProvider();
provider.addScope("email");
provider.addScope("profile");
provider.setCustomParameters({ prompt: "select_account" });

function preferRedirectSignIn() {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod|Android/i.test(ua);
}

export function waitForUser() {
  return new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged((user) => {
      unsub();
      resolve(user);
    });
  });
}

export function explainAuthError(err) {
  const code = err?.code || "";
  const host = location.hostname;
  if (code === "auth/unauthorized-domain") {
    return `Google blocked this site (${host}). In Firebase Console → Authentication → Settings → Authorized domains, add ${host}, verifiedtrucks.com, and localhost.`;
  }
  if (code === "auth/operation-not-allowed") {
    return "Google sign-in is off in Firebase. Enable the Google provider under Authentication → Sign-in method.";
  }
  if (code === "auth/popup-blocked") {
    return "The Google window was blocked. Allow popups for this site, then try again.";
  }
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return "Google sign-in was closed before it finished. Tap Continue with Google again.";
  }
  if (code === "auth/web-storage-unsupported") {
    return "This browser blocked login storage. Allow cookies and site data for verifiedtrucks.com, then try again.";
  }
  if (code === "auth/network-request-failed") {
    return "Network error during Google sign-in. Check your connection and try again.";
  }
  if (code === "storage/unauthorized" || code === "storage/unauthorized-app") {
    return "Signed in, but Firebase Storage blocked the file. Deploy storage.rules for project verifiedtrucks-20.";
  }
  if (code === "permission-denied" || /permission/i.test(err?.message || "")) {
    return "You signed in, but Firestore blocked saving the profile. Deploy the latest firestore.rules for project verifiedtrucks-20.";
  }
  return err?.message || "Google sign-in failed.";
}

export function explainStorageError(err) {
  const code = err?.code || "";
  if (code === "storage/unauthorized" || code === "storage/unauthorized-app") {
    return "Firebase Storage blocked this upload. Deploy storage.rules for verifiedtrucks-20 and allow this domain in Storage CORS.";
  }
  if (code === "storage/retry-limit-exceeded" || code === "storage/cannot-slice-blob") {
    return "The photo did not finish uploading. Try a smaller JPG or PNG (under 5 MB).";
  }
  if (code === "storage/canceled") return "Photo upload was cancelled.";
  if (code === "storage/unknown" || /cors|network/i.test(err?.message || "")) {
    return "Photo upload could not reach Firebase Storage from this domain. CORS must allow verifiedtrucks.com.";
  }
  return err?.message || "Could not upload the photo.";
}

export async function completeGoogleRedirect() {
  try {
    return await getRedirectResult(auth);
  } catch (err) {
    err.friendlyMessage = explainAuthError(err);
    throw err;
  }
}

export async function signInGoogle() {
  try {
    if (preferRedirectSignIn()) {
      await signInWithRedirect(auth, provider);
      return null;
    }
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (err) {
    if (
      err.code === "auth/popup-blocked" ||
      err.code === "auth/operation-not-supported-in-this-environment" ||
      err.code === "auth/internal-error"
    ) {
      await signInWithRedirect(auth, provider);
      return null;
    }
    err.friendlyMessage = explainAuthError(err);
    throw err;
  }
}

export function signOutUser() {
  return signOut(auth);
}

async function putPhoto(bucket, uid, file) {
  const safeType = (file.type || "image/jpeg").split("/")[1] || "jpg";
  const objectRef = ref(bucket, `users/${uid}/avatar.${safeType}`);
  await uploadBytes(objectRef, file, { contentType: file.type || "image/jpeg" });
  return getDownloadURL(objectRef);
}

export async function uploadProfilePhoto(uid, file) {
  try {
    return await putPhoto(storage, uid, file);
  } catch (err) {
    try {
      return await putPhoto(storageFallback, uid, file);
    } catch {
      err.friendlyMessage = explainStorageError(err);
      throw err;
    }
  }
}

export const googleBtnHtml = `
  <span class="google-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="18" height="18">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  </span>
`;
