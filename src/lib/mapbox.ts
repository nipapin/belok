import {
  formatKaliningradAddress,
  isInKaliningrad,
  KALININGRAD_BOUNDS,
  KALININGRAD_LNG_LAT,
} from '@/lib/kaliningrad';
import { fetchMapbox } from '@/lib/mapboxUpstream';

const GEOCODE_URL = 'https://api.mapbox.com/search/geocode/v6';

export type GeoItem = { label: string; lat: number; lon: number };

type MapboxFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    full_address?: string;
    feature_type?: string;
    context?: { place?: { name?: string } };
    coordinates?: { longitude?: number; latitude?: number };
  };
};

function accessToken(): string {
  const token = process.env.MAPBOX_API_KEY?.trim();
  if (!token) throw new Error('MAPBOX_API_KEY is not set');
  return token;
}

function bbox(): string {
  const [[south, west], [north, east]] = KALININGRAD_BOUNDS;
  return `${west},${south},${east},${north}`;
}

function toItem(feature: MapboxFeature): GeoItem | null {
  const coords = feature.geometry?.coordinates;
  const lon = coords?.[0] ?? feature.properties?.coordinates?.longitude;
  const lat = coords?.[1] ?? feature.properties?.coordinates?.latitude;
  if (lat == null || lon == null || !isInKaliningrad(lat, lon)) return null;
  const raw = feature.properties?.name?.trim() || feature.properties?.full_address?.trim() || '';
  const label = formatKaliningradAddress(raw);
  if (!label) return null;
  return { label, lat, lon };
}

function inKaliningradCity(feature: MapboxFeature): boolean {
  return feature.properties?.context?.place?.name === 'Калининград';
}

async function geocode(url: URL): Promise<MapboxFeature[]> {
  url.searchParams.set('access_token', accessToken());
  const res = await fetchMapbox(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { features?: MapboxFeature[] };
  return data.features ?? [];
}

export async function suggestKaliningrad(query: string): Promise<GeoItem[]> {
  const url = new URL(`${GEOCODE_URL}/forward`);
  url.searchParams.set('q', /калининград/i.test(query) ? query : `Калининград ${query}`);
  url.searchParams.set('country', 'ru');
  url.searchParams.set('bbox', bbox());
  url.searchParams.set('proximity', `${KALININGRAD_LNG_LAT[0]},${KALININGRAD_LNG_LAT[1]}`);
  url.searchParams.set('language', 'ru');
  const hasNumber = /\d/.test(query);
  url.searchParams.set('limit', '8');
  url.searchParams.set('autocomplete', 'true');
  url.searchParams.set('types', hasNumber ? 'address,street' : 'street');

  const features = await geocode(url);
  const inCity = features.filter(inKaliningradCity);
  const pool = inCity.length > 0 ? inCity : features;

  const items: GeoItem[] = [];
  const seen = new Set<string>();
  for (const feature of pool) {
    const item = toItem(feature);
    if (!item) continue;
    const key = item.label.toLocaleLowerCase('ru-RU');
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return items.slice(0, 6);
}

export async function reverseKaliningrad(lat: number, lon: number): Promise<GeoItem | null> {
  if (!isInKaliningrad(lat, lon)) return null;
  const url = new URL(`${GEOCODE_URL}/reverse`);
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('language', 'ru');
  url.searchParams.set('limit', '1');
  url.searchParams.set('types', 'address,street');
  const features = await geocode(url);
  return features[0] ? toItem(features[0]) : null;
}
