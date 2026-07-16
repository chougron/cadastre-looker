import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const DATA_DIR = process.env.CADASTRE_DATA_DIR ?? process.cwd();
const CACHE_DIR = process.env.CADASTRE_CACHE_DIR ?? DATA_DIR;
const FILE_RE = /^cadastre-([A-Za-z0-9_]+)-parcelles\.json$/;

// Etalab publishes dated snapshots; bump this when a newer one is available.
const ETALAB_SNAPSHOT_DATE = "2026-06-01";

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

function cityFileName(cityId: string): string {
  return `cadastre-${cityId}-parcelles.json`;
}

async function listDirCities(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries
      .map((name) => FILE_RE.exec(name)?.[1])
      .filter((id): id is string => Boolean(id));
  } catch {
    return [];
  }
}

export async function listAvailableCities(): Promise<string[]> {
  const cities = new Set([
    ...(await listDirCities(DATA_DIR)),
    ...(await listDirCities(CACHE_DIR)),
  ]);
  return [...cities].sort();
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function etalabDownloadUrl(cityId: string): string {
  const dept = cityId.slice(0, 2);
  return (
    `https://files.data.gouv.fr/cadastre/etalab-cadastre/${ETALAB_SNAPSHOT_DATE}` +
    `/geojson/communes/${dept}/${cityId}/${cityFileName(cityId)}.gz`
  );
}

async function downloadCityFile(cityId: string): Promise<string | null> {
  const res = await fetch(etalabDownloadUrl(cityId));
  if (!res.ok) return null;

  const json = gunzipSync(Buffer.from(await res.arrayBuffer()));

  await mkdir(CACHE_DIR, { recursive: true });
  const filePath = path.join(CACHE_DIR, cityFileName(cityId));
  await writeFile(filePath, json);
  return filePath;
}

export async function loadCityFeatures(cityId: string): Promise<ParcelFeature[] | null> {
  const cached = cache.get(cityId);
  if (cached) return cached;

  if (!/^[A-Za-z0-9_]+$/.test(cityId)) return null;

  let filePath = path.join(DATA_DIR, cityFileName(cityId));
  if (!(await fileExists(filePath))) {
    filePath = path.join(CACHE_DIR, cityFileName(cityId));
    if (!(await fileExists(filePath))) {
      const downloaded = await downloadCityFile(cityId);
      if (!downloaded) return null;
      filePath = downloaded;
    }
  }

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
