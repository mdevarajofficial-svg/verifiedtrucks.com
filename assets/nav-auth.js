import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { auth } from "/assets/firebase.js";

onAuthStateChanged(auth, (user) => {
  document.querySelectorAll('a[href="/profile.html"]').forEach((link) => {
    link.textContent = user ? "Profile" : "Login";
  });
});
