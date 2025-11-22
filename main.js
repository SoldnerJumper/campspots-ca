// main.js — uses LATITUDE / LONGITUDE fields directly

// 1. Initialize the map centered roughly on BC
const map = L.map("map").setView([53.7267, -127.6476], 5);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

// Helper to safely get properties
function getProps(feature) {
  return feature && feature.properties ? feature.properties : {};
}

// Closed if CLOSURE_IND (or CLOSR_IND) == 'Y'
function isClosed(featureOrProps) {
  const props =
    featureOrProps && featureOrProps.properties
      ? featureOrProps.properties
      : featureOrProps;

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

// Layers for open / closed sites
const openLayer = L.layerGroup();
const closedLayer = L.layerGroup();

// Create popup HTML
function buildPopupHtml(props, closed) {
  const name =
    props.PROJECT_NAME ||
    props.PROJECT_NM ||
    "Unnamed recreation site";

  const campsites = props.DEFINED_CAMPSITES ?? props.DFND_CAMP;
  const location = props.SITE_LOCATION || props.SITE_LOC || "";
  const description = props.SITE_DESCRIPTION || props.ST_DESC || "";
  const directions = props.DRIVING_DIRECTIONS || props.DRV_DIRCTN || "";

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

  // Official links based on FOREST_FILE_ID (e.g. REC5810)
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

  return `
    <strong>${name}</strong><br/>
    ${statusHtml}
    ${campsiteHtml}
    ${locationHtml}
    ${descHtml}
    ${dirHtml}
    ${officialLinksHtml}
  `;
}

// --- Load your uploaded GeoJSON and build markers from LAT/LON ---

fetch("data/bc_rec_sites.geojson")
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

    const bounds = L.latLngBounds();

    data.features.forEach((feature) => {
      const props = getProps(feature);

      let lat = props.LATITUDE;
      let lng = props.LONGITUDE;

      // Convert to numbers if strings
      lat = typeof lat === "string" ? parseFloat(lat) : lat;
      lng = typeof lng === "string" ? parseFloat(lng) : lng;

      if (
        typeof lat !== "number" ||
        Number.isNaN(lat) ||
        typeof lng !== "number" ||
        Number.isNaN(lng)
      ) {
        return; // skip if coordinates missing
      }

      const closed = isClosed(props);

      const style = closed
        ? {
            radius: 6,
            weight: 1,
            opacity: 1,
            fillOpacity: 0.9,
            color: "#b91c1c",
            fillColor: "#ef4444",
          }
        : {
            radius: 6,
            weight: 1,
            opacity: 1,
            fillOpacity: 0.9,
            color: "#15803d",
            fillColor: "#22c55e",
          };

      const marker = L.circleMarker([lat, lng], style);
      marker.bindPopup(buildPopupHtml(props, closed));

      if (closed) {
        closedLayer.addLayer(marker);
      } else {
        openLayer.addLayer(marker);
      }

      bounds.extend([lat, lng]);
    });

    // Add both layers and fit map
    openLayer.addTo(map);
    closedLayer.addTo(map);

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    } else {
      console.warn("No valid coordinates to fit bounds");
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
