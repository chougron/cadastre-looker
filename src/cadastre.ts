import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = process.env.CADASTRE_DATA_DIR ?? process.cwd();
const FILE_RE = /^cadastre-([A-Za-z0-9_]+)-parcelles\.json$/;

export interface ParcelProperties {
  id: string;
  commune: string;
  prefixe: string;
  section: string;
  numero: string;
  contenance: number;
  arpente: boolean;
  created: string;
  updated: string;
}

export type Ring = [number, number][];

export interface ParcelGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: Ring[] | Ring[][];
}

export interface ParcelFeature {
  type: "Feature";
  id: string;
  geometry: ParcelGeometry;
  properties: ParcelProperties;
}

interface CadastreFile {
  type: "FeatureCollection";
  features: ParcelFeature[];
}

const cache = new Map<string, ParcelFeature[]>();

export async function listAvailableCities(): Promise<string[]> {
  const entries = await readdir(DATA_DIR);
  return entries
    .map((name) => FILE_RE.exec(name)?.[1])
    .filter((id): id is string => Boolean(id))
    .sort();
}

function cityFilePath(cityId: string): string | null {
  if (!/^[A-Za-z0-9_]+$/.test(cityId)) return null;
  return path.join(DATA_DIR, `cadastre-${cityId}-parcelles.json`);
}

export async function loadCityFeatures(cityId: string): Promise<ParcelFeature[] | null> {
  const cached = cache.get(cityId);
  if (cached) return cached;

  const filePath = cityFilePath(cityId);
  if (!filePath) return null;

  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }

  const data = JSON.parse(raw) as CadastreFile;
  cache.set(cityId, data.features);
  return data.features;
}

export function ringCentroid(ring: Ring): [number, number] {
  let lonSum = 0;
  let latSum = 0;
  for (const [lon, lat] of ring) {
    lonSum += lon;
    latSum += lat;
  }
  return [lonSum / ring.length, latSum / ring.length];
}

export function geometryCentroid(geometry: ParcelGeometry): [number, number] {
  if (geometry.type === "Polygon") {
    return ringCentroid((geometry.coordinates as Ring[])[0]);
  }
  const polygons = geometry.coordinates as Ring[][];
  const exteriorRings = polygons.map((poly) => poly[0]);
  const largest = exteriorRings.reduce((a, b) => (b.length > a.length ? b : a));
  return ringCentroid(largest);
}

export interface SearchMatch {
  feature: ParcelFeature;
  centroid: [number, number];
}

export function searchParcels(
  features: ParcelFeature[],
  targetSize: number,
  tolerance: number,
): SearchMatch[] {
  const low = targetSize - tolerance;
  const high = targetSize + tolerance;

  const matches: SearchMatch[] = [];
  for (const feature of features) {
    const contenance = feature.properties?.contenance;
    if (typeof contenance !== "number" || contenance < low || contenance > high) continue;
    matches.push({ feature, centroid: geometryCentroid(feature.geometry) });
  }

  matches.sort(
    (a, b) =>
      Math.abs(a.feature.properties.contenance - targetSize) -
      Math.abs(b.feature.properties.contenance - targetSize),
  );

  return matches;
}

export function googleMapsLink(lon: number, lat: number): string {
  return `https://www.google.com/maps?q=${lat.toFixed(7)},${lon.toFixed(7)}`;
}
