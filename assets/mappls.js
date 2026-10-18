export const MAPPLS_ACCESS_TOKEN = "oggqjtedwcvuqeuylaldmmpaauqupyuakduc";

function labelOf(hit) {
  return [hit.name, hit.address].filter(Boolean).join(", ");
}

function mapplsHits(data) {
  const list = data?.suggestedLocations || data?.suggested_locations || data?.results || [];
  return list.map((item) => ({
    name: item.placeName || item.place_name || item.poi || item.name || "",
    address: item.placeAddress || item.place_address || item.address || item.formatted_address || "",
    eloc: item.eLoc || item.e_loc || item.eloc || "",
    lat: Number(item.latitude ?? item.lat ?? item.latLng?.lat),
    lng: Number(item.longitude ?? item.lng ?? item.latLng?.lng),
    source: "mappls",
  })).filter((hit) => hit.name || hit.address || hit.eloc);
}

function photonHits(data) {
  return (data?.features || []).map((feat) => {
    const p = feat.properties || {};
    const [lng, lat] = feat.geometry?.coordinates || [];
    const parts = [p.name, p.street, p.city || p.town || p.village, p.state, p.country].filter(Boolean);
    return {
      name: p.name || p.city || p.state || "Place",
      address: parts.join(", "),
      eloc: "",
      lat: Number(lat),
      lng: Number(lng),
      source: "fallback",
    };
  }).filter((hit) => Number.isFinite(hit.lat) && Number.isFinite(hit.lng));
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`lookup ${res.status}`);
  return res.json();
}

export async function searchPlaces(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return [];
  try {
    const url = `https://search.mappls.com/search/places/autosuggest/json?query=${encodeURIComponent(q)}&region=IND&access_token=${MAPPLS_ACCESS_TOKEN}`;
    const data = await fetchJson(url);
    const hits = mapplsHits(data);
    if (hits.length) return hits.slice(0, 8);
  } catch {
    /* Mappls key or CORS may fail; keep a live fallback so customers can still pick places. */
  }
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en`;
    const data = await fetchJson(url);
    return photonHits(data).slice(0, 8);
  } catch {
    return [];
  }
}

function kmFromMeters(m) {
  if (!Number.isFinite(m) || m < 0) return null;
  return Math.round((m / 1000) * 10) / 10;
}

function pointToken(place) {
  if (place?.eloc) return place.eloc;
  if (Number.isFinite(place?.lng) && Number.isFinite(place?.lat)) return `${place.lng},${place.lat}`;
  return "";
}

export async function drivingDistanceKm(from, to) {
  const a = pointToken(from);
  const b = pointToken(to);
  if (a && b) {
    try {
      const url = `https://route.mappls.com/route/dm/distance_matrix/driving/${a};${b}?region=ind&access_token=${MAPPLS_ACCESS_TOKEN}`;
      const data = await fetchJson(url);
      const meters = Number(
        data?.results?.distances?.[0]?.[1]
        ?? data?.distances?.[0]?.[1]
        ?? data?.distance
      );
      const km = kmFromMeters(meters);
      if (km != null) return { km, meters, source: "mappls" };
    } catch {
      /* fall through */
    }
  }
  if (Number.isFinite(from?.lng) && Number.isFinite(from?.lat) && Number.isFinite(to?.lng) && Number.isFinite(to?.lat)) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
      const data = await fetchJson(url);
      const meters = Number(data?.routes?.[0]?.distance);
      const km = kmFromMeters(meters);
      if (km != null) return { km, meters, source: "fallback" };
    } catch {
      return null;
    }
  }
  return null;
}

export function attachPlaceSearch(input, onPick) {
  if (!input) return () => {};
  const field = input.closest(".form-field") || input.parentElement;
  field.classList.add("place-field");
  let box = field.querySelector(".place-suggest");
  if (!box) {
    box = document.createElement("ul");
    box.className = "place-suggest";
    box.hidden = true;
    field.appendChild(box);
  }
  let timer = null;
  let seq = 0;

  function hide() {
    box.hidden = true;
    box.innerHTML = "";
  }

  async function lookup() {
    const n = ++seq;
    const hits = await searchPlaces(input.value);
    if (n !== seq) return;
    if (!hits.length) {
      hide();
      return;
    }
    box.innerHTML = hits.map((hit, i) => (
      `<li><button type="button" data-i="${i}"><strong>${escapeHtml(hit.name)}</strong><span>${escapeHtml(hit.address || "")}</span></button></li>`
    )).join("");
    box.hidden = false;
    box.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => {
        const hit = hits[Number(btn.dataset.i)];
        input.value = labelOf(hit);
        hide();
        onPick?.(hit);
      });
    });
  }

  input.addEventListener("input", () => {
    onPick?.(null);
    clearTimeout(timer);
    timer = setTimeout(lookup, 220);
  });
  input.addEventListener("focus", () => {
    if (input.value.trim().length >= 2) lookup();
  });
  input.addEventListener("blur", () => setTimeout(hide, 180));
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
