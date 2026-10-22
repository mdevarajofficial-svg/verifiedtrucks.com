export const ADMIN_EMAILS = [
  "mdevarajofficial@gmail.com",
];

export const ADMIN_PHONES = [
  "6363655596",
];

export function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function isAdminUser(user, profile = {}) {
  const email = String(user?.email || profile?.email || "").trim().toLowerCase();
  const phone = digits(profile?.phone || user?.phoneNumber);
  return ADMIN_EMAILS.includes(email) || ADMIN_PHONES.includes(phone);
}

export function nameIsLocked(profile = {}) {
  return String(profile.name || "").trim().length >= 2;
}

export function phoneIsLocked(profile = {}) {
  return /^\d{10}$/.test(digits(profile.phone));
}

export function detailsAreLocked(profile = {}) {
  return profile.detailsLocked === true || (nameIsLocked(profile) && phoneIsLocked(profile));
}
