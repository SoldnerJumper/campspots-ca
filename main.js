// main.js — use GeoJSON geometry directly, open vs closed

// 1. Initialize the map centered roughly on BC
const map = L.map("map").setView([53.7267, -127.6476], 5);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

// Helper to get a property with optional fallback names (case-insensitive)
function getField(props, names) {
  if (!props) return undefined;
  const keys = Object.keys(props);
  for (const name of names) {
    // exact match first
    if (props[name] !== undefined && props[name] !== null) {
      return props[name];
    }
    // case-insensitive fallback
    const lower = name.toLowerCase();
    for (const key of keys) {
      if (key.toLowerCase() === lower) {
        const val = props[key];
        if (val !== undefined && val !== null) return val;
      }
    }
  }
  return undefined;
}

// Closed if CLOSURE_IND / CLOSR_IND == 'Y'
function isClosed(featureOrProps) {
  const props =
    featureOrProps && featureOrProps.properties
      ? featureOrProps.properties
      : featureOrProps;

  const ind = getField(props, ["CLOSURE_IND", "CLOSR_IND"]);
  if (ind === undefined || ind === null) return false;
  return String(ind).trim().toUpperCase() === "Y";
}

function formatClosureDate(value) {
  if (!value) return "";
  const asString = String(value);
  const maybeNumber = Number(asString);
  let d;
  if (!Number.isNaN(maybeNumber) && maybeNumber > 1000000000) {
    d = new Date(maybeNumber);
  } else {
    d = new Date(asString);
  }
  if (Number.isNaN(d.getTime())) return asString;
  return d.toLocaleDateString();
}

// Layers for open / closed
const openLayer = L.geoJSON(null, {
  filter: (feature) => !isClosed(feature),
  pointToLayer: (feature, latlng) =>
    L.circleMarker(latlng, {
      radius: 6,
      weight: 1,
      opacity: 1,
      fillOpacity: 0.9,
      color: "#15803d",
      fillColor: "#22c55e",
    }),
  onEachFeature: onEachFeature,
});

const closedLayer = L.geoJSON(null, {
  filter: (feature) => isClosed(feature),
  pointToLayer: (feature, latlng) =>
    L.circleMarker(latlng, {
      radius: 6,
      weight: 1,
      opacity: 1,
      fillOpacity: 0.9,
      color: "#b91c1c",
      fillColor: "#ef4444",
    }),
  onEachFeature: onEachFeature,
});

function onEachFeature(feature, layer) {
  const props = feature.properties || {};

  const name =
    getField(props, ["PROJECT_NAME", "PROJECT_NM"]) ||
    "Unnamed recreation site";

  const campsites = getField(props, ["DEFINED_CAMPSITES", "DFND_CAMP"]);
  const location = getField(props, ["SITE_LOCATION", "SITE_LOC"]) || "";
  const description = getField(props, ["SITE_DESCRIPTION", "ST_DESC"]) || "";
  const directions = getField(props, ["DRIVING_DIRECTIONS", "DRV_DIRCTN"]) || "";

  const closed = isClosed(props);
  const closureType = getField(props, ["CLOSURE_TYPE", "CLOSR_TYPE"]) || "";
  const closureDate = getField(props, ["CLOSURE_DATE", "CLOSR_DT"]) || "";
  const closureComment =
    getField(props, ["CLOSURE_COMMENT", "CLOSR_COM"]) || "";

  let statusHtml = closed
    ? "<strong>Status: CLOSED</strong><br/>"
    : "<strong>Status: Open (check latest info)</strong><br/>";

  if (closed) {
    if (closureType) statusHtml += `Reason: ${closureType}<br/>`;
    if (closureDate) statusHtml += `Since: ${formatClosureDate(closureDate)}<br/>`;
    if (closureComment) statusHtml += `<em>${closureComment}</em><br/>`;
  }

  const campsiteHtml =
    campsites !== undefined && campsites !== null
      ? `Campsites: ${campsites}<br/>`
      : "";

  const locationHtml = location ? `Location: ${location}<br/>` : "";
  const descHtml = description ? `${description}<br/>` : "";
  const dirHtml = directions
    ? `<br/><strong>Directions:</strong> ${directions}`
    : "";

  const forestId =
    getField(props, ["FOREST_FILE_ID", "F_FILE_ID"]) || "";

  let officialLinksHtml = "";
  if (forestId) {
    const oldUrl = `https://www.sitesandtrailsbc.ca/search/search-result.aspx?site=${forestId}&type=Site`;
    const betaUrl = `https://beta.sitesandtrailsbc.ca/resource/${forestId}`;
    officialLinksHtml = `
      <br/><br/>
      <strong>Official info &amp; fees:</strong><br/>
      <a href="${betaUrl}" target="_blank" rel="noopener">Beta site page</a><br/>
      <a href="${oldUrl}" target="_blank" rel="noopener">Original site page</a>
    `;
  }

  const popupHtml = `
    <strong>${name}</strong><br/>
    ${statusHtml}
    ${campsiteHtml}
    ${locationHtml}
    ${descHtml}
    ${dirHtml}
    ${officialLinksHtml}
  `;

  layer.bindPopup(popupHtml);
}

// --- Load GeoJSON using the raw GitHub URL instead of Pages ---

const DATA_URL =
  "https://raw.githubusercontent.com/soldnerjumper/campspots-ca/main/data/FTEN_REC_DTAILS_CLOSURES_SV.geojson";

fetch(DATA_URL)
  .then((res) => {
    if (!res.ok) {
      console.error("Failed to load GeoJSON:", res.status, res.statusText);
    }
    return res.json();
  })
  .then((data) => {
    if (!data || !Array.isArray(data.features)) {
      console.error("Invalid GeoJSON structure", data);
      return;
    }

    console.log("Feature count:", data.features.length);
    if (data.features.length > 0) {
      console.log("Sample properties:", data.features[0].properties);
    }

    openLayer.addData(data);
    closedLayer.addData(data);

    openLayer.addTo(map);
    closedLayer.addTo(map);

    const group = L.featureGroup([openLayer, closedLayer]);
    try {
      map.fitBounds(group.getBounds(), { padding: [20, 20] });
    } catch (e) {
      console.warn("Could not fit bounds (maybe no features?)", e);
    }
  })
  .catch((err) => {
    console.error("Error loading GeoJSON", err);
  });


// --- Hook up the checkboxes ---

const showOpenCheckbox = document.getElementById("showFree");
const showClosedCheckbox = document.getElementById("showPaid");

if (showOpenCheckbox) {
  showOpenCheckbox.addEventListener("change", () => {
    if (showOpenCheckbox.checked) {
      map.addLayer(openLayer);
    } else {
      map.removeLayer(openLayer);
    }
  });
}

if (showClosedCheckbox) {
  showClosedCheckbox.addEventListener("change", () => {
    if (showClosedCheckbox.checked) {
      map.addLayer(closedLayer);
    } else {
      map.removeLayer(closedLayer);
    }
  });
}
