const fs = require("fs");
const proj4 = require("proj4");

const SEARCH_BASE =
  "https://dj2qs6gf0wkg3.cloudfront.net/api/v1/recreation-resource/search";

const DETAIL_BASE =
  "https://dj2qs6gf0wkg3.cloudfront.net/api/v1/recreation-resource";

// BC Albers EPSG:3005 → WGS84 lon/lat
proj4.defs(
  "EPSG:3005",
  "+proj=aea +lat_1=50 +lat_2=58.5 +lat_0=45 +lon_0=-126 " +
    "+x_0=1000000 +y_0=0 +datum=NAD83 +units=m +no_defs"
);

const HEADERS = {
  Origin: "https://www.sitesandtrailsbc.ca",
  Referer: "https://www.sitesandtrailsbc.ca/",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  Accept: "application/json"
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: HEADERS });

    if (res.ok) {
      return res.json();
    }

    console.warn(`Attempt ${attempt}/${retries} failed: ${res.status} ${url}`);

    if (res.status === 403 || res.status === 429) {
      await sleep(5000 * attempt);
      continue;
    }

    throw new Error(`Failed ${url}: ${res.status}`);
  }

  throw new Error(`Failed after ${retries} retries: ${url}`);
}

async function fetchPage(page = 1) {
  const url = `${SEARCH_BASE}?limit=100&page=${page}&type=SIT`;
  return fetchJson(url);
}

async function fetchDetail(id) {
  return fetchJson(`${DETAIL_BASE}/${id}`);
}

function parseGeometry(jsonString) {
  if (!jsonString) return null;

  try {
    return JSON.parse(jsonString);
  } catch {
    return null;
  }
}

function convertPointToLngLat(pointGeometry) {
  if (!pointGeometry?.coordinates) return null;

  const [lng, lat] = proj4("EPSG:3005", "WGS84", pointGeometry.coordinates);

  return {
    type: "Point",
    coordinates: [lng, lat]
  };
}

function getFeeType(site) {
  const fees = site.recreation_fee || [];
  const reservation = site.recreation_resource_reservation_info;

  if (reservation) return "reservable";
  if (fees.length > 0) return "paid";
  return "free";
}

function getImage(site) {
  return (
    site.recreation_resource_images?.[0]?.url?.pre ||
    site.recreation_resource_images?.[0]?.url?.original ||
    null
  );
}

async function main() {
  fs.mkdirSync("data", { recursive: true });

  const first = await fetchPage(1);
  const total = Number(first.total);
  const limit = Number(first.limit);
  const pages = Math.ceil(total / limit);

  console.log(`Fetching ${total} rec sites across ${pages} pages...`);

  const all = [...first.data];

  for (let page = 2; page <= pages; page++) {
    console.log(`Fetching page ${page}/${pages}`);
    const result = await fetchPage(page);
    all.push(...result.data);
    await sleep(300);
  }

  console.log(`Fetched ${all.length} search records.`);

  const enriched = [];

  for (let i = 0; i < all.length; i++) {
    const site = all[i];
    const id = site.rec_resource_id;

    console.log(`Fetching detail ${i + 1}/${all.length}: ${id}`);

    try {
      const detail = await fetchDetail(id);

      const sourcePointGeometry = parseGeometry(detail.site_point_geometry);
      const pointGeometry = convertPointToLngLat(sourcePointGeometry);
      const polygonGeometry = parseGeometry(detail.spatial_feature_geometry);

      enriched.push({
        id: detail.rec_resource_id,
        name: detail.name,
        community: detail.closest_community,
        type: detail.rec_resource_type,
        description: detail.description ?? null,
        directions: detail.driving_directions ?? null,
        status: detail.recreation_status?.description ?? null,
        statusCode: detail.recreation_status?.status_code ?? null,
        statusComment: detail.recreation_status?.comment ?? null,
        activities: detail.recreation_activity?.map(a => a.description) ?? [],
        access: detail.recreation_access ?? [],
        feeType: getFeeType(detail),
        fees: detail.recreation_fee ?? [],
        campsiteCount: detail.campsite_count ?? null,
        hasToilet: detail.recreation_structure?.has_toilet ?? false,
        hasTable: detail.recreation_structure?.has_table ?? false,
        district: detail.recreation_district?.description ?? null,
        districtCode: detail.recreation_district?.district_code ?? null,
        image: getImage(detail),
        pointGeometry,
        sourcePointGeometry,
        polygonGeometry
      });
    } catch (err) {
      console.warn(`Skipping ${id}: ${err.message}`);
    }

    await sleep(500);
  }

  fs.writeFileSync(
    "data/bc_rec_sites_enriched.json",
    JSON.stringify(enriched, null, 2)
  );

  const geojson = {
    type: "FeatureCollection",
    features: enriched
      .filter(site => site.pointGeometry?.coordinates)
      .map(site => ({
        type: "Feature",
        geometry: site.pointGeometry,
        properties: {
          id: site.id,
          name: site.name,
          community: site.community,
          type: site.type,
          status: site.status,
          statusComment: site.statusComment,
          feeType: site.feeType,
          campsiteCount: site.campsiteCount,
          hasToilet: site.hasToilet,
          hasTable: site.hasTable,
          district: site.district,
          activities: site.activities,
          image: site.image
        }
      }))
  };

  fs.writeFileSync(
    "data/bc_rec_sites_enriched.geojson",
    JSON.stringify(geojson, null, 2)
  );

  console.log(`Saved ${enriched.length} enriched rec sites.`);
  console.log(`Saved GeoJSON with ${geojson.features.length} features.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});