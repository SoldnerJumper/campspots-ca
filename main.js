// main.js — CampSpots.ca MVP
// Vancouver Island-first practical outdoor map.
// Static Leaflet + GeoJSON architecture.
//
// Current layers:
// - BC Recreation Sites: open / closed campsites
// - Mosaic sites: optional manually curated layer
// - Crown land context: optional context layer, not legal advice

// ------------------------------------------------------------
// 1. Map setup
// ------------------------------------------------------------

const map = L.map("map").setView([49.65, -125.35], 7);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

// ------------------------------------------------------------
// 2. Data paths
// ------------------------------------------------------------
// Keep raw government files if useful, but point the app at the clean working layer.

const DATA_URLS = {
  recSites: "data/FTEN_REC_DTAILS_CLOSURES_SV.geojson",
  mosaicSites: "data/mosaic_sites.geojson",
  crownLand: "data/bc_crown_land.geojson",
};

// ------------------------------------------------------------
// 3. Utility helpers
// ------------------------------------------------------------

function getField(props, names) {
  if (!props) return undefined;

  const keys = Object.keys(props);

  for (const name of names) {
    if (props[name] !== undefined && props[name] !== null) {
      return props[name];
    }

    const lower = name.toLowerCase();

    for (const key of keys) {
      if (key.toLowerCase() === lower) {
        const value = props[key];
        if (value !== undefined && value !== null) return value;
      }
    }
  }

  return undefined;
}

function escapeHtml(value) {
  if (value === undefined || value === null) return "";

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatClosureDate(value) {
  if (!value) return "";

  const asString = String(value);
  const maybeNumber = Number(asString);
  let date;

  if (!Number.isNaN(maybeNumber) && maybeNumber > 1000000000) {
    date = new Date(maybeNumber);
  } else {
    date = new Date(asString);
  }

  if (Number.isNaN(date.getTime())) return asString;

  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function googleMapsLink(latlng, name) {
  const query = encodeURIComponent(`${name} ${latlng.lat},${latlng.lng}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function featureLatLng(feature) {
  if (!feature || !feature.geometry) return null;

  const geometry = feature.geometry;

  if (geometry.type === "Point") {
    const [lng, lat] = geometry.coordinates;
    return { lat, lng };
  }

  return null;
}

// ------------------------------------------------------------
// 4. BC Rec Site logic
// ------------------------------------------------------------

function isClosedRecSite(featureOrProps) {
  const props = featureOrProps?.properties || featureOrProps;
  const indicator = getField(props, ["CLOSURE_IND", "CLOSR_IND"]);

  if (indicator === undefined || indicator === null) return false;

  return String(indicator).trim().toUpperCase() === "Y";
}

function isDefinedCampsite(featureOrProps) {
  const props = featureOrProps?.properties || featureOrProps;
  let count = getField(props, ["DEFINED_CAMPSITES", "DFND_CAMP"]);

  if (count === undefined || count === null) return false;

  if (typeof count === "string") {
    count = parseFloat(count);
  }

  if (Number.isNaN(count)) return false;

  return count > 0;
}

function recSitePopup(feature, layer) {
  const props = feature.properties || {};

  const name =
    getField(props, ["PROJECT_NAME", "PROJECT_NM"]) ||
    "Unnamed recreation site";

  const safeName = escapeHtml(name);
  const campsites = getField(props, ["DEFINED_CAMPSITES", "DFND_CAMP"]);
  const location = getField(props, ["SITE_LOCATION", "SITE_LOC"]) || "";
  const description = getField(props, ["SITE_DESCRIPTION", "ST_DESC"]) || "";
  const directions = getField(props, ["DRIVING_DIRECTIONS", "DRV_DIRCTN"]) || "";

  const closed = isClosedRecSite(props);
  const closureType = getField(props, ["CLOSURE_TYPE", "CLOSR_TYPE"]) || "";
  const closureDate = getField(props, ["CLOSURE_DATE", "CLOSR_DT"]) || "";
  const closureComment = getField(props, ["CLOSURE_COMMENT", "CLOSR_COM"]) || "";

  const forestId = getField(props, ["FOREST_FILE_ID", "F_FILE_ID"]) || "";

  let statusHtml = closed
    ? `<strong>Status:</strong> Closed<br/>`
    : `<strong>Status:</strong> Open — verify before travelling<br/>`;

  if (closed) {
    if (closureType) statusHtml += `<strong>Reason:</strong> ${escapeHtml(closureType)}<br/>`;
    if (closureDate) statusHtml += `<strong>Since:</strong> ${escapeHtml(formatClosureDate(closureDate))}<br/>`;
    if (closureComment) statusHtml += `<em>${escapeHtml(closureComment)}</em><br/>`;
  }

  let officialLinksHtml = "";

  if (forestId) {
    const betaUrl = `https://beta.sitesandtrailsbc.ca/resource/${encodeURIComponent(forestId)}`;
    const oldUrl = `https://www.sitesandtrailsbc.ca/search/search-result.aspx?site=${encodeURIComponent(forestId)}&type=Site`;

    officialLinksHtml = `
      <br/>
      <strong>Official info:</strong><br/>
      <a href="${betaUrl}" target="_blank" rel="noopener">BC Sites & Trails page</a><br/>
      <a href="${oldUrl}" target="_blank" rel="noopener">Original BC listing</a>
    `;
  }

  const latlng = featureLatLng(feature);
  const mapsLink = latlng
    ? `<br/><a href="${googleMapsLink(latlng, name)}" target="_blank" rel="noopener">View on Google Maps</a>`
    : "";

  const popupHtml = `
    <strong>${safeName}</strong><br/>
    <span>BC Recreation Site</span><br/><br/>

    ${statusHtml}

    ${campsites !== undefined && campsites !== null ? `<strong>Campsites:</strong> ${escapeHtml(campsites)}<br/>` : ""}
    ${location ? `<strong>Location:</strong> ${escapeHtml(location)}<br/>` : ""}
    ${description ? `<br/>${escapeHtml(description)}<br/>` : ""}
    ${directions ? `<br/><strong>Directions:</strong> ${escapeHtml(directions)}<br/>` : ""}

    <br/>
    <strong>CampSpots note:</strong><br/>
    Practical details such as cell service, road access, showers, and remote-work suitability may be added later.

    ${officialLinksHtml}
    ${mapsLink}
  `;

  layer.bindPopup(popupHtml);
}

// ------------------------------------------------------------
// 5. Layer definitions
// ------------------------------------------------------------

const openRecSitesLayer = L.geoJSON(null, {
  pointToLayer: (feature, latlng) =>
    L.circleMarker(latlng, {
      radius: 6,
      weight: 1,
      opacity: 1,
      fillOpacity: 0.9,
      color: "#15803d",
      fillColor: "#22c55e",
    }),
  onEachFeature: recSitePopup,
});

const closedRecSitesLayer = L.geoJSON(null, {
  pointToLayer: (feature, latlng) =>
    L.circleMarker(latlng, {
      radius: 6,
      weight: 1,
      opacity: 1,
      fillOpacity: 0.9,
      color: "#991b1b",
      fillColor: "#ef4444",
    }),
  onEachFeature: recSitePopup,
});

const mosaicSitesLayer = L.geoJSON(null, {
  pointToLayer: (feature, latlng) =>
    L.circleMarker(latlng, {
      radius: 7,
      weight: 1,
      opacity: 1,
      fillOpacity: 0.9,
      color: "#0f766e",
      fillColor: "#14b8a6",
    }),
  onEachFeature: mosaicPopup,
});

const crownLandLayer = L.geoJSON(null, {
  style: {
    color: "#2563eb",
    weight: 1,
    fillColor: "#3b82f6",
    fillOpacity: 0.12,
  },
  onEachFeature: crownLandPopup,
});

// ------------------------------------------------------------
// 6. Mosaic popup
// ------------------------------------------------------------
// Expected simple GeoJSON properties:
// name, region, status, open_from, open_to, reservations_url, map_url,
// phone, email, notes

function mosaicPopup(feature, layer) {
  const props = feature.properties || {};

  const name = getField(props, ["name", "Campsite", "CAMPSITE"]) || "Mosaic campsite";
  const region = getField(props, ["region", "Region", "REGION"]) || "";
  const status = getField(props, ["status", "Status", "STATUS"]) || "";
  const openFrom = getField(props, ["open_from", "Open From Date"]) || "";
  const openTo = getField(props, ["open_to", "Open To Date"]) || "";
  const reservationsUrl = getField(props, ["reservations_url", "Reservations"]) || "";
  const mapUrl = getField(props, ["map_url", "Campsite Map"]) || "";
  const phone = getField(props, ["phone", "Phone Number"]) || "";
  const email = getField(props, ["email", "Email"]) || "";
  const notes = getField(props, ["notes", "Notes"]) || "";

  const latlng = featureLatLng(feature);
  const mapsLink = latlng
    ? `<br/><a href="${googleMapsLink(latlng, name)}" target="_blank" rel="noopener">View on Google Maps</a>`
    : "";

  const popupHtml = `
    <strong>${escapeHtml(name)}</strong><br/>
    <span>Mosaic Forest Management campsite</span><br/><br/>

    ${region ? `<strong>Region:</strong> ${escapeHtml(region)}<br/>` : ""}
    ${status ? `<strong>Status:</strong> ${escapeHtml(status)}<br/>` : ""}
    ${openFrom ? `<strong>Open from:</strong> ${escapeHtml(openFrom)}<br/>` : ""}
    ${openTo ? `<strong>Open to:</strong> ${escapeHtml(openTo)}<br/>` : ""}
    ${phone ? `<strong>Phone:</strong> ${escapeHtml(phone)}<br/>` : ""}
    ${email ? `<strong>Email:</strong> ${escapeHtml(email)}<br/>` : ""}
    ${notes ? `<br/><strong>CampSpots note:</strong><br/>${escapeHtml(notes)}<br/>` : ""}

    ${reservationsUrl ? `<br/><a href="${escapeHtml(reservationsUrl)}" target="_blank" rel="noopener">Reservations / official info</a>` : ""}
    ${mapUrl ? `<br/><a href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener">Official campsite map</a>` : ""}
    ${mapsLink}

    <br/><br/>
    <small>Verify status, fees, rules, and access with Mosaic before travelling.</small>
  `;

  layer.bindPopup(popupHtml);
}

// ------------------------------------------------------------
// 7. Crown land popup
// ------------------------------------------------------------

function crownLandPopup(feature, layer) {
  const props = feature.properties || {};

  const name =
    getField(props, ["NAME", "TITLE", "LABEL", "name"]) ||
    "Crown land / public land context";

  const popupHtml = `
    <strong>${escapeHtml(name)}</strong><br/>
    Crown land / public land context layer.<br/><br/>

    <strong>Important:</strong><br/>
    This layer is for planning context only. It does not guarantee that camping,
    vehicle access, fires, hunting, or overnight use are allowed at a specific location.
    Always verify current rules, closures, tenures, local bylaws, Indigenous lands,
    fire bans, and road access before travelling.
  `;

  layer.bindPopup(popupHtml);
}

// ------------------------------------------------------------
// 8. Load data
// ------------------------------------------------------------

async function loadGeoJson(url, options = {}) {
  const { optional = false } = options;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const message = `${url} failed: ${response.status} ${response.statusText}`;

      if (optional) {
        console.warn(message);
        return null;
      }

      throw new Error(message);
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.features)) {
      throw new Error(`${url} is not valid GeoJSON FeatureCollection data`);
    }

    return data;
  } catch (error) {
    if (optional) {
      console.warn("Optional layer failed to load:", error);
      return null;
    }

    console.error("Required layer failed to load:", error);
    return null;
  }
}

async function loadRecSites() {
  const data = await loadGeoJson(DATA_URLS.recSites);

  if (!data) return;

  const allFeatures = data.features;
  const campsiteFeatures = allFeatures.filter(isDefinedCampsite);
  const openFeatures = campsiteFeatures.filter((feature) => !isClosedRecSite(feature));
  const closedFeatures = campsiteFeatures.filter((feature) => isClosedRecSite(feature));

  console.log("BC Rec Sites total features:", allFeatures.length);
  console.log("BC Rec Sites campsites:", campsiteFeatures.length);
  console.log("Open campsites:", openFeatures.length);
  console.log("Closed campsites:", closedFeatures.length);

  openRecSitesLayer.addData(openFeatures);
  closedRecSitesLayer.addData(closedFeatures);

  openRecSitesLayer.addTo(map);

  fitMapToVisibleLayers();
}

async function loadMosaicSites() {
  const data = await loadGeoJson(DATA_URLS.mosaicSites, { optional: true });

  if (!data) return;

  console.log("Mosaic site features:", data.features.length);

  mosaicSitesLayer.addData(data);

  const checkbox = document.getElementById("showMosaicSites");
  if (!checkbox || checkbox.checked) {
    mosaicSitesLayer.addTo(map);
  }

  fitMapToVisibleLayers();
}

async function loadCrownLand() {
  const data = await loadGeoJson(DATA_URLS.crownLand, { optional: true });

  if (!data) return;

  console.log("Crown land features:", data.features.length);

  crownLandLayer.addData(data);
}

// ------------------------------------------------------------
// 9. Fit map
// ------------------------------------------------------------

function fitMapToVisibleLayers() {
  const visibleLayers = [];

  if (map.hasLayer(openRecSitesLayer)) visibleLayers.push(openRecSitesLayer);
  if (map.hasLayer(closedRecSitesLayer)) visibleLayers.push(closedRecSitesLayer);
  if (map.hasLayer(mosaicSitesLayer)) visibleLayers.push(mosaicSitesLayer);
  if (map.hasLayer(crownLandLayer)) visibleLayers.push(crownLandLayer);

  if (visibleLayers.length === 0) return;

  const group = L.featureGroup(visibleLayers);

  try {
    const bounds = group.getBounds();

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  } catch (error) {
    console.warn("Could not fit map bounds:", error);
  }
}

// ------------------------------------------------------------
// 10. Checkbox controls
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// 11. Start app
// ------------------------------------------------------------

loadRecSites();
loadMosaicSites();
loadCrownLand();
