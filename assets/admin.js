export const ADMIN_EMAILS = [
  "mdevaraj159@gmail.com",
  "mdevarajofficial@gmail.com",
];

export const ADMIN_PHONES = [
  "6363655596",
  "9113265599",
];

export function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function isAdminUser(user, profile = {}) {
  const email = String(user?.email || profile?.email || "").trim().toLowerCase();
  const phone = digits(profile?.phone || user?.phoneNumber);
  return ADMIN_EMAILS.includes(email) || ADMIN_PHONES.includes(phone);
}
