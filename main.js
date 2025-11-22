// main.js

// 1. Initialize the map centered roughly on BC
const map = L.map("map").setView([53.7267, -127.6476], 5);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

// --- Helpers based on your schema ---

function getProps(feature) {
  return feature && feature.properties ? feature.properties : {};
}

// Treat anything with DEFINED_CAMPSITES > 0 as an actual campsite
function isCampsite(feature) {
  const props = getProps(feature);
  let n = props.DEFINED_CAMPSITES ?? props.DFND_CAMP;

  if (typeof n === "string") {
    const parsed = Number(n);
    if (!Number.isNaN(parsed)) n = parsed;
  }

  return typeof n === "number" && n > 0;
}

// Closed if CLOSURE_IND (or CLOSR_IND) == 'Y'
function isClosed(feature) {
  const props = getProps(feature);
  const ind =
    (props.CLOSURE_IND || props.CLOSR_IND || "").toString().trim().toUpperCase();
  return ind === "Y";
}

// Try to make a human-friendly date from closure date field
function formatClosureDate(value) {
  if (!value) return "";
  const asString = String(value);

  const maybeNumber = Number(asString);
  let d;
  if (!Number.isNaN(maybeNumber) && maybeNumber > 1000000000) {
    // likely epoch milliseconds
    d = new Date(maybeNumber);
  } else {
    d = new Date(asString);
  }

  if (Number.isNaN(d.getTime())) return asString;
  return d.toLocaleDateString();
}

// --- Layers: open vs closed campsites ---

const openLayer = L.geoJSON(null, {
  filter: (feature) => isCampsite(feature) && !isClosed(feature),
  pointToLayer: (feature, latlng) =>
    L.circleMarker(latlng, {
      radius: 6,
      weight: 1,
      opacity: 1,
      fillOpacity: 0.9,
      color: "#15803d",     // outline (green-ish)
      fillColor: "#22c55e", // fill
    }),
  onEachFeature: onEachCampsite,
});

const closedLayer = L.geoJSON(null, {
  filter: (feature) => isCampsite(feature) && isClosed(feature),
  pointToLayer: (feature, latlng) =>
    L.circleMarker(latlng, {
      radius: 6,
      weight: 1,
      opacity: 1,
      fillOpacity: 0.9,
      color: "#b91c1c",     // outline (red-ish)
      fillColor: "#ef4444", // fill
    }),
  onEachFeature: onEachCampsite,
});

// --- Popup content with official links ---

function onEachCampsite(feature, layer) {
  const props = getProps(feature);

  const name =
    props.PROJECT_NAME ||
    props.PROJECT_NM ||
    "Unnamed recreation site";

  const campsites = props.DEFINED_CAMPSITES ?? props.DFND_CAMP;
  const location = props.SITE_LOCATION || props.SITE_LOC || "";
  const description = props.SITE_DESCRIPTION || props.ST_DESC || "";
  const directions = props.DRIVING_DIRECTIONS || props.DRV_DIRCTN || "";

  const closed = isClosed(feature);
  const closureType = props.CLOSURE_TYPE || props.CLOSR_TYPE || "";
  const closureDate = props.CLOSURE_DATE || props.CLOSR_DT || "";
  const closureComment = props.CLOSURE_COMMENT || props.CLOSR_COM || "";

  let statusHtml = closed
    ? "<strong>Status: CLOSED</strong><br/>"
    : "<strong>Status: Open (check latest info)</strong><br/>";

  if (closed) {
    if (closureType) {
      statusHtml += `Reason: ${closureType}<br/>`;
    }
    if (closureDate) {
      statusHtml += `Since: ${formatClosureDate(closureDate)}<br/>`;
    }
    if (closureComment) {
      statusHtml += `<em>${closureComment}</em><br/>`;
    }
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

  // Build official page links based on FOREST_FILE_ID (e.g. REC5810)
  const forestId = props.FOREST_FILE_ID || props.F_FILE_ID;
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

// --- Load your uploaded GeoJSON ---

fetch("data/bc_rec_sites.geojson")
  .then((res) => res.json())
  .then((data) => {
    openLayer.addData(data);
    closedLayer.addData(data);

    // Show both by default
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

// Note: IDs are showFree/showPaid, but labels say "open/closed"
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
