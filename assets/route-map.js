const INDIA = [22.9734, 78.6569];

let map = null;
let pickupMarker = null;
let dropMarker = null;
let routeLine = null;

function pinIcon(color) {
  return window.L.divIcon({
    className: "route-pin",
    html: `<span class="route-pin-dot" style="background:${color}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function clearLayer(layer) {
  if (layer && map) map.removeLayer(layer);
  return null;
}

export function initRouteMap(container) {
  if (!container || !window.L) return;
  if (map) {
    setTimeout(() => map.invalidateSize(), 60);
    return;
  }
  map = window.L.map(container, {
    scrollWheelZoom: false,
    zoomControl: true,
    attributionControl: true,
  });
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);
  map.setView(INDIA, 5);
  setTimeout(() => map.invalidateSize(), 80);
}

export function paintRouteMap(pickup, drop, coordinates) {
  if (!map) return;
  pickupMarker = clearLayer(pickupMarker);
  dropMarker = clearLayer(dropMarker);
  routeLine = clearLayer(routeLine);

  const bounds = [];
  if (Number.isFinite(pickup?.lat) && Number.isFinite(pickup?.lng)) {
    pickupMarker = window.L.marker([pickup.lat, pickup.lng], { icon: pinIcon("#16a34a"), title: "Loading" })
      .addTo(map)
      .bindTooltip("Loading", { permanent: false });
    bounds.push([pickup.lat, pickup.lng]);
  }
  if (Number.isFinite(drop?.lat) && Number.isFinite(drop?.lng)) {
    dropMarker = window.L.marker([drop.lat, drop.lng], { icon: pinIcon("#dc2626"), title: "Unloading" })
      .addTo(map)
      .bindTooltip("Unloading", { permanent: false });
    bounds.push([drop.lat, drop.lng]);
  }
  if (Array.isArray(coordinates) && coordinates.length > 1) {
    routeLine = window.L.polyline(coordinates, {
      color: "#0284c7",
      weight: 5,
      opacity: 0.92,
    }).addTo(map);
    coordinates.forEach((pt) => bounds.push(pt));
  }
  if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 12 });
  } else if (bounds.length === 1) {
    map.setView(bounds[0], 10);
  } else {
    map.setView(INDIA, 5);
  }
  setTimeout(() => map.invalidateSize(), 60);
}
