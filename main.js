// main.js — CampSpots.ca MVP

const map = L.map("map").setView([49.65, -125.35], 7);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const DATA_URLS = {
  recSites: "data/bc_rec_sites_enriched.geojson",
  mosaicSites: "data/mosaic_sites.geojson",
  crownLand: "data/BC_Crown_minus_nationalparks.geojson",
};

function escapeHtml(value) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function googleMapsLink(latlng, name) {
  const query = encodeURIComponent(`${name} ${latlng.lat},${latlng.lng}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function featureLatLng(feature) {
  if (!feature?.geometry || feature.geometry.type !== "Point") return null;
  const [lng, lat] = feature.geometry.coordinates;
  return { lat, lng };
}

function isClosedRecSite(feature) {
  const status = feature.properties?.status || "";
  return status.toLowerCase() === "closed";
}

function isCampingRecSite(feature) {
  const props = feature.properties || {};
  return Number(props.campsiteCount || 0) > 0 || props.activities?.includes("Camping");
}

function feeLabel(feeType) {
  if (feeType === "free") return "No fee";
  if (feeType === "paid") return "Fees apply";
  if (feeType === "reservable") return "Reservable";
  return "Fee unknown";
}

function recSitePopup(feature, layer) {
  const props = feature.properties || {};
  const latlng = featureLatLng(feature);

  const mapsLink = latlng
    ? `<br/><a href="${googleMapsLink(latlng, props.name)}" target="_blank" rel="noopener">View on Google Maps</a>`
    : "";

  const officialUrl = props.id
    ? `https://www.sitesandtrailsbc.ca/search/search-result.aspx?site=${encodeURIComponent(props.id)}&type=Site`
    : "";

  const imageHtml = props.image
    ? `<img src="${escapeHtml(props.image)}" alt="" style="width:100%;max-width:260px;border-radius:8px;margin-bottom:8px;">`
    : "";

  const popupHtml = `
    ${imageHtml}
    <strong>${escapeHtml(props.name || "Unnamed recreation site")}</strong><br/>
    <span>BC Recreation Site</span><br/><br/>

    ${props.community ? `<strong>Community:</strong> ${escapeHtml(props.community)}<br/>` : ""}
    <strong>Status:</strong> ${escapeHtml(props.status || "Unknown")}<br/>
    <strong>Fee:</strong> ${escapeHtml(feeLabel(props.feeType))}<br/>
    <strong>Campsites:</strong> ${escapeHtml(props.campsiteCount ?? "Unknown")}<br/>
    <strong>Toilet:</strong> ${props.hasToilet ? "Yes" : "No/unknown"}<br/>
    <strong>Tables:</strong> ${props.hasTable ? "Yes" : "No/unknown"}<br/>
    ${props.district ? `<strong>District:</strong> ${escapeHtml(props.district)}<br/>` : ""}

    ${props.activities?.length ? `<br/><strong>Activities:</strong><br/>${props.activities.map(escapeHtml).join(", ")}<br/>` : ""}
    ${props.statusComment ? `<br/><strong>Status note:</strong><br/>${escapeHtml(props.statusComment)}<br/>` : ""}

    ${officialUrl ? `<br/><a href="${officialUrl}" target="_blank" rel="noopener">Official BC listing</a>` : ""}
    ${mapsLink}

    <br/><br/>
    <small>Always verify fees, closures, access, fire bans, and local rules before travelling.</small>
  `;

  layer.bindPopup(popupHtml);
}

function mosaicPopup(feature, layer) {
  const props = feature.properties || {};
  const name = props.name || props.Campsite || props.CAMPSITE || "Mosaic campsite";
  const popupHtml = `<strong>${escapeHtml(name)}</strong><br/>Mosaic campsite<br/><br/><small>Verify details with Mosaic before travelling.</small>`;
  layer.bindPopup(popupHtml);
}

function crownLandPopup(feature, layer) {
  layer.bindPopup(`
    <strong>Crown land context</strong><br/>
    Crown land minus national parks / CLAB layer.<br/><br/>
    <small>This is planning context only. It does not guarantee camping, access, fires, or overnight use are allowed.</small>
  `);
}

const openRecSitesLayer = L.geoJSON(null, {
  pointToLayer: (feature, latlng) =>
    L.circleMarker(latlng, {
      radius: 6,
      weight: 1,
      color: "#15803d",
      fillColor: "#22c55e",
      fillOpacity: 0.9,
    }),
  onEachFeature: recSitePopup,
});

const closedRecSitesLayer = L.geoJSON(null, {
  pointToLayer: (feature, latlng) =>
    L.circleMarker(latlng, {
      radius: 6,
      weight: 1,
      color: "#991b1b",
      fillColor: "#ef4444",
      fillOpacity: 0.9,
    }),
  onEachFeature: recSitePopup,
});

const mosaicSitesLayer = L.geoJSON(null, {
  pointToLayer: (feature, latlng) =>
    L.circleMarker(latlng, {
      radius: 7,
      weight: 1,
      color: "#0f766e",
      fillColor: "#14b8a6",
      fillOpacity: 0.9,
    }),
  onEachFeature: mosaicPopup,
});

const crownLandLayer = L.geoJSON(null, {
  style: {
    color: "#ca8a04",
    weight: 1,
    fillColor: "#facc15",
    fillOpacity: 0.18,
  },
  onEachFeature: crownLandPopup,
});

async function loadGeoJson(url, optional = false) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    if (optional) {
      console.warn(error);
      return null;
    }
    console.error(error);
    return null;
  }
}

async function loadRecSites() {
  const data = await loadGeoJson(DATA_URLS.recSites);
  if (!data) return;

  const campingSites = data.features.filter(isCampingRecSite);
  const openSites = campingSites.filter(f => !isClosedRecSite(f));
  const closedSites = campingSites.filter(isClosedRecSite);

  console.log("Enriched rec site features:", data.features.length);
  console.log("Camping rec sites:", campingSites.length);
  console.log("Open camping rec sites:", openSites.length);
  console.log("Closed camping rec sites:", closedSites.length);

  openRecSitesLayer.addData(openSites).addTo(map);
  closedRecSitesLayer.addData(closedSites);

  fitMapToVisibleLayers();
}

async function loadMosaicSites() {
  const data = await loadGeoJson(DATA_URLS.mosaicSites, true);
  if (!data) return;

  mosaicSitesLayer.addData(data);

  const checkbox = document.getElementById("showMosaicSites");
  if (!checkbox || checkbox.checked) mosaicSitesLayer.addTo(map);
}

async function loadCrownLand() {
  const data = await loadGeoJson(DATA_URLS.crownLand, true);
  if (!data) return;

  console.log("Crown land features:", data.features.length);
  crownLandLayer.addData(data);

  const checkbox = document.getElementById("showCrownLand");
  if (checkbox?.checked) crownLandLayer.addTo(map);
}

function fitMapToVisibleLayers() {
  const layers = [openRecSitesLayer, closedRecSitesLayer, mosaicSitesLayer].filter(layer =>
    map.hasLayer(layer)
  );

  if (!layers.length) return;

  const group = L.featureGroup(layers);
  const bounds = group.getBounds();

  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [20, 20] });
  }
}

function bindLayerCheckbox(checkboxId, layer) {
  const checkbox = document.getElementById(checkboxId);
  if (!checkbox) return;

  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      map.addLayer(layer);
    } else {
      map.removeLayer(layer);
    }
  });
}

bindLayerCheckbox("showOpenRecSites", openRecSitesLayer);
bindLayerCheckbox("showClosedRecSites", closedRecSitesLayer);
bindLayerCheckbox("showMosaicSites", mosaicSitesLayer);
bindLayerCheckbox("showCrownLand", crownLandLayer);

loadRecSites();
loadMosaicSites();
loadCrownLand();