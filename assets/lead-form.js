import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = await fetch("/firebase-config.json").then((r) => r.json());
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const form = document.getElementById("lead-form");
const submitBtn = document.getElementById("submit-btn");
const formMessage = document.getElementById("form-message");
const successCard = document.getElementById("success-card");

function showMessage(text, type) {
  formMessage.textContent = text;
  formMessage.className = `form-message ${type}`;
}

function value(id) {
  return document.getElementById(id).value.trim();
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

  try {
    await addDoc(collection(db, "leads"), {
      loadingLocation,
      unloadingLocation,
      sizeFeet,
      bodyType,
      tonnage,
      contactName,
      contactPhone,
      source: "home-book-truck",
      page: window.location.pathname,
      createdAt: serverTimestamp(),
    });
    form.classList.add("is-hidden");
    form.style.display = "none";
    document.getElementById("form-heading").style.display = "none";
    successCard.classList.add("is-visible");
  } catch (err) {
    console.error(err);
    showMessage("Something went wrong. Please try again.", "error");
    submitBtn.disabled = false;
    submitBtn.textContent = "Book truck";
  }
});
