export const MAPPLS_ACCESS_TOKEN = "oggqjtedwcvuqeuylaldmmpaauqupyuakduc";
export const BUFFER_SEC_PER_LOCATION = 2 * 60 * 60;
const ROUTE_LOCATION_COUNT = 2;

function withLocationBuffer(driveSec) {
  if (!Number.isFinite(driveSec) || driveSec < 0) return driveSec;
  return driveSec + ROUTE_LOCATION_COUNT * BUFFER_SEC_PER_LOCATION;
}

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

function geoToLatLng(coords) {
  if (!Array.isArray(coords)) return [];
  return coords
    .map((pair) => [Number(pair[1]), Number(pair[0])])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
}

export function formatTravelTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "";
  const minutes = Math.max(1, Math.round(sec / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

async function osrmRoute(from, to) {
  if (!(Number.isFinite(from?.lng) && Number.isFinite(from?.lat) && Number.isFinite(to?.lng) && Number.isFinite(to?.lat))) {
    return null;
  }
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=simplified&geometries=geojson`;
  const data = await fetchJson(url);
  const route = data?.routes?.[0];
  const meters = Number(route?.distance);
  const km = kmFromMeters(meters);
  if (km == null) return null;
  return {
    km,
    meters,
    durationSec: Number(route?.duration),
    coordinates: geoToLatLng(route?.geometry?.coordinates),
    source: "fallback",
  };
}

function withBufferedTime(route) {
  if (!route) return null;
  return { ...route, durationSec: withLocationBuffer(route.durationSec) };
}

export async function drivingRoute(from, to) {
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
      const durationSec = Number(
        data?.results?.durations?.[0]?.[1]
        ?? data?.durations?.[0]?.[1]
        ?? data?.duration
      );
      const km = kmFromMeters(meters);
      if (km != null) {
        const line = await osrmRoute(from, to).catch(() => null);
        const driveSec = Number.isFinite(durationSec) ? durationSec : line?.durationSec;
        return withBufferedTime({
          km,
          meters,
          durationSec: driveSec,
          coordinates: line?.coordinates || [],
          source: "mappls",
        });
      }
    } catch {
      /* fall through */
    }
  }
  try {
    return withBufferedTime(await osrmRoute(from, to));
  } catch {
    return null;
  }
}

export async function drivingDistanceKm(from, to) {
  const route = await drivingRoute(from, to);
  if (!route) return null;
  return {
    km: route.km,
    meters: route.meters,
    durationSec: route.durationSec,
    source: route.source,
  };
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
