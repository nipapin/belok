/** Mapbox GL: [longitude, latitude] */
export const KALININGRAD_LNG_LAT: [number, number] = [20.511, 54.7104];
/** [[south, west], [north, east]] */
export const KALININGRAD_BOUNDS: [[number, number], [number, number]] = [
  [54.62, 20.28],
  [54.82, 20.72],
];
/** Mapbox maxBounds: [[west, south], [east, north]] */
export const KALININGRAD_MAX_BOUNDS: [[number, number], [number, number]] = [
  [20.28, 54.62],
  [20.72, 54.82],
];

export function isInKaliningrad(lat: number, lon: number): boolean {
  const [[south, west], [north, east]] = KALININGRAD_BOUNDS;
  return lat >= south && lat <= north && lon >= west && lon <= east;
}

export function formatKaliningradAddress(raw: string): string {
  return raw
    .replace(/^Россия,\s*/i, '')
    .replace(/^Калининградская область,\s*/i, '')
    .replace(/^город Калининград,\s*/i, '')
    .replace(/^Калининград,\s*/i, '')
    .trim();
}
