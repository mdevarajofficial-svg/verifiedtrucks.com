import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = await fetch("/firebase-config.json").then((r) => r.json());
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const form = document.getElementById("lead-form");
const submitBtn = document.getElementById("submit-btn");
const formMessage = document.getElementById("form-message");
const roleSelect = document.getElementById("role");

if (roleSelect && form?.dataset.defaultRole) {
  roleSelect.value = form.dataset.defaultRole;
}

function showMessage(text, type) {
  formMessage.textContent = text;
  formMessage.className = `form-message ${type}`;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formMessage.className = "form-message";

  const name = document.getElementById("name").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const email = document.getElementById("email").value.trim();
  const role = document.getElementById("role").value;
  const source = form.dataset.source || "lead-page";

  if (!name || !phone || !role) {
    showMessage("Please fill in all required fields.", "error");
    return;
  }

  if (!/^\d{10}$/.test(phone)) {
    showMessage("Please enter a valid 10-digit phone number.", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting…";

  try {
    await addDoc(collection(db, "leads"), {
      name,
      phone,
      email: email || null,
      role,
      source,
      page: window.location.pathname,
      createdAt: serverTimestamp(),
    });
    form.reset();
    if (form.dataset.defaultRole) {
      roleSelect.value = form.dataset.defaultRole;
    }
    showMessage("Thanks! We'll be in touch soon.", "success");
  } catch (err) {
    console.error(err);
    showMessage("Something went wrong. Please try again.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit";
  }
});
