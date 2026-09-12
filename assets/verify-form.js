const form = document.getElementById("kyc-form");
const submit = document.getElementById("kyc-submit");
const message = document.getElementById("kyc-message");

function value(id) {
  return document.getElementById(id).value.trim();
}

form?.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = value("kyc-name");
  const phone = value("kyc-phone");
  const dlNumber = value("kyc-dl").toUpperCase();
  const totalVehicles = value("kyc-vehicles");
  message.className = "form-message";
  if (!name || !phone || !dlNumber || !totalVehicles) {
    message.textContent = "Please fill in all transporter details.";
    message.className = "form-message error";
    return;
  }
  if (!/^\d{10}$/.test(phone)) {
    message.textContent = "Please enter a valid 10-digit phone number.";
    message.className = "form-message error";
    return;
  }
  submit.disabled = true;
  sessionStorage.setItem("vtPendingTransporter", JSON.stringify({
    name,
    phone,
    dlNumber,
    totalVehicles: Number(totalVehicles),
  }));
  window.location.href = "/profile.html?next=transporter";
});
