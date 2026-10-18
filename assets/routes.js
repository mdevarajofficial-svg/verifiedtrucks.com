import { STATES, SERVICES, POPULAR_ROUTES } from "/assets/routes-data.js";

const statesRoot = document.getElementById("states-grid");
const servicesRoot = document.getElementById("services-grid");
const popularRoot = document.getElementById("popular-routes");

if (statesRoot) {
  statesRoot.innerHTML = STATES.map((st) => `
    <article class="state-card" id="${slug(st.name)}">
      <div class="state-head">
        <h3>${escapeHtml(st.name)}</h3>
        <a class="book-now-mini" href="/#book">Book now</a>
      </div>
      <ul class="city-pills">
        ${st.cities.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}
      </ul>
    </article>
  `).join("");
}

if (servicesRoot) {
  servicesRoot.innerHTML = SERVICES.map((s) => `
    <article class="service-card" id="${s.id}">
      <h3>${escapeHtml(s.title)}</h3>
      <p>${escapeHtml(s.copy)}</p>
    </article>
  `).join("");
}

if (popularRoot) {
  popularRoot.innerHTML = POPULAR_ROUTES.map(([from, to]) => `
    <a class="route-chip" href="/#book">
      <strong>${escapeHtml(from)}</strong>
      <span>→</span>
      <strong>${escapeHtml(to)}</strong>
    </a>
  `).join("");
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
