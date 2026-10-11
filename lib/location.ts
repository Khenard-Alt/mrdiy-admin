/**
 * Approximate distance between free-text Philippine locations, using city/municipality centre points.
 * Mirrors LocationDistance.kt in the Android app so the admin and the app agree.
 * Address-based, not GPS; distances are centre-to-centre estimates.
 */

export type Place = { name: string; lat: number; lng: number; area: string };

export const NEAR_ME_RADIUS_KM = 15;

const CITIES: Place[] = [
  { name: "manila", lat: 14.5995, lng: 120.9842, area: "Metro Manila" },
  { name: "quezon city", lat: 14.676, lng: 121.0437, area: "Metro Manila" },
  { name: "makati", lat: 14.5547, lng: 121.0244, area: "Metro Manila" },
  { name: "pasig", lat: 14.5764, lng: 121.0851, area: "Metro Manila" },
  { name: "taguig", lat: 14.5176, lng: 121.0509, area: "Metro Manila" },
  { name: "bgc", lat: 14.5509, lng: 121.0503, area: "Metro Manila" },
  { name: "mandaluyong", lat: 14.5794, lng: 121.0359, area: "Metro Manila" },
  { name: "marikina", lat: 14.6507, lng: 121.1029, area: "Metro Manila" },
  { name: "paranaque", lat: 14.4793, lng: 121.0198, area: "Metro Manila" },
  { name: "las pinas", lat: 14.4445, lng: 120.9939, area: "Metro Manila" },
  { name: "muntinlupa", lat: 14.4081, lng: 121.0415, area: "Metro Manila" },
  { name: "caloocan", lat: 14.651, lng: 120.972, area: "Metro Manila" },
  { name: "navotas", lat: 14.6667, lng: 120.9417, area: "Metro Manila" },
  { name: "malabon", lat: 14.6625, lng: 120.9567, area: "Metro Manila" },
  { name: "valenzuela", lat: 14.7011, lng: 120.983, area: "Metro Manila" },
  { name: "san juan", lat: 14.6019, lng: 121.0355, area: "Metro Manila" },
  { name: "pasay", lat: 14.5378, lng: 121.0014, area: "Metro Manila" },
  { name: "pateros", lat: 14.5446, lng: 121.0687, area: "Metro Manila" },
  { name: "antipolo", lat: 14.5878, lng: 121.176, area: "Rizal" },
  { name: "cainta", lat: 14.5786, lng: 121.1222, area: "Rizal" },
  { name: "taytay", lat: 14.5574, lng: 121.1324, area: "Rizal" },
  { name: "angono", lat: 14.5266, lng: 121.1536, area: "Rizal" },
  { name: "binangonan", lat: 14.4645, lng: 121.1925, area: "Rizal" },
  { name: "san mateo", lat: 14.6969, lng: 121.1219, area: "Rizal" },
  { name: "rodriguez", lat: 14.76, lng: 121.14, area: "Rizal" },
  { name: "montalban", lat: 14.76, lng: 121.14, area: "Rizal" },
  { name: "teresa", lat: 14.56, lng: 121.2083, area: "Rizal" },
  { name: "morong", lat: 14.5119, lng: 121.2389, area: "Rizal" },
  { name: "baras", lat: 14.523, lng: 121.265, area: "Rizal" },
  { name: "tanay", lat: 14.498, lng: 121.285, area: "Rizal" },
  { name: "cardona", lat: 14.4881, lng: 121.229, area: "Rizal" },
  { name: "pililla", lat: 14.485, lng: 121.307, area: "Rizal" },
  { name: "jalajala", lat: 14.353, lng: 121.323, area: "Rizal" },
  { name: "bacoor", lat: 14.459, lng: 120.929, area: "Cavite" },
  { name: "imus", lat: 14.4297, lng: 120.9367, area: "Cavite" },
  { name: "dasmarinas", lat: 14.3294, lng: 120.9367, area: "Cavite" },
  { name: "kawit", lat: 14.4446, lng: 120.902, area: "Cavite" },
  { name: "cavite city", lat: 14.4791, lng: 120.897, area: "Cavite" },
  { name: "general trias", lat: 14.3869, lng: 120.8817, area: "Cavite" },
  { name: "trece martires", lat: 14.2833, lng: 120.8667, area: "Cavite" },
  { name: "silang", lat: 14.2306, lng: 120.975, area: "Cavite" },
  { name: "tagaytay", lat: 14.1153, lng: 120.9621, area: "Cavite" },
  { name: "san pedro", lat: 14.3595, lng: 121.0473, area: "Laguna" },
  { name: "binan", lat: 14.3333, lng: 121.0833, area: "Laguna" },
  { name: "santa rosa", lat: 14.3122, lng: 121.1114, area: "Laguna" },
  { name: "cabuyao", lat: 14.2724, lng: 121.1251, area: "Laguna" },
  { name: "calamba", lat: 14.2117, lng: 121.1653, area: "Laguna" },
  { name: "los banos", lat: 14.1699, lng: 121.2441, area: "Laguna" },
  { name: "santa cruz", lat: 14.2785, lng: 121.4163, area: "Laguna" },
  { name: "san pablo", lat: 14.0683, lng: 121.3256, area: "Laguna" },
  { name: "meycauayan", lat: 14.7344, lng: 120.9572, area: "Bulacan" },
  { name: "marilao", lat: 14.7578, lng: 120.9483, area: "Bulacan" },
  { name: "bocaue", lat: 14.7983, lng: 120.9261, area: "Bulacan" },
  { name: "santa maria", lat: 14.8183, lng: 120.9563, area: "Bulacan" },
  { name: "san jose del monte", lat: 14.8139, lng: 121.0453, area: "Bulacan" },
  { name: "malolos", lat: 14.8527, lng: 120.816, area: "Bulacan" },
  { name: "baliuag", lat: 14.9547, lng: 120.8969, area: "Bulacan" },
  { name: "cebu city", lat: 10.3157, lng: 123.8854, area: "Cebu" },
  { name: "davao city", lat: 7.1907, lng: 125.4553, area: "Davao" },
];

// Used only when no city/municipality is named.
const PROVINCES: Place[] = [
  { name: "metro manila", lat: 14.5995, lng: 120.9842, area: "Metro Manila" },
  { name: "ncr", lat: 14.5995, lng: 120.9842, area: "Metro Manila" },
  { name: "rizal", lat: 14.6037, lng: 121.3084, area: "Rizal" },
  { name: "cavite", lat: 14.2829, lng: 120.8686, area: "Cavite" },
  { name: "laguna", lat: 14.2691, lng: 121.4113, area: "Laguna" },
  { name: "bulacan", lat: 14.7943, lng: 120.8799, area: "Bulacan" },
  { name: "cebu", lat: 10.3157, lng: 123.8854, area: "Cebu" },
  { name: "davao", lat: 7.1907, lng: 125.4553, area: "Davao" },
];

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // ñ -> n, accents removed
    .replace(/\./g, " ")
    .replace(/\bsta\b/g, "santa")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Branch names often contain a city too ("SM City Manila"), so the place mentioned last wins.
function lastMatch(text: string, table: Place[]): Place | null {
  let best: { end: number; length: number; place: Place } | null = null;
  for (const place of table) {
    const index = text.lastIndexOf(` ${place.name} `);
    if (index < 0) continue;
    const end = index + place.name.length;
    if (!best || end > best.end || (end === best.end && place.name.length > best.length)) {
      best = { end, length: place.name.length, place };
    }
  }
  return best?.place ?? null;
}

export function locate(location: string | null | undefined): Place | null {
  const normalized = normalize(location ?? "");
  if (normalized === "") return null;
  const text = ` ${normalized} `;
  return lastMatch(text, CITIES) ?? lastMatch(text, PROVINCES);
}

export function distanceKm(a: Place, b: Place): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Distance in km between two address strings, or null if either is not recognised. */
export function distanceBetween(from: string | null | undefined, to: string | null | undefined) {
  const a = locate(from);
  const b = locate(to);
  return a && b ? distanceKm(a, b) : null;
}

export function formatDistance(km: number) {
  return km < 1.5 ? "Near you" : `~${Math.max(1, Math.floor(km))} km`;
}
