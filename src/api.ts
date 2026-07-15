import express from "express";
import {
  listAvailableCities,
  loadCityFeatures,
  searchParcels,
  googleMapsLink,
} from "./cadastre.js";

export function createApiRouter(): express.Router {
  const router = express.Router();

  router.get("/cities", async (_req, res) => {
    const cities = await listAvailableCities();
    res.json({ cities });
  });

  router.get("/search", async (req, res) => {
    const city = typeof req.query.city === "string" ? req.query.city : undefined;
    const size = typeof req.query.size === "string" ? Number(req.query.size) : NaN;
    const tolerance =
      typeof req.query.tolerance === "string" ? Number(req.query.tolerance) : 10;

    if (!city || Number.isNaN(size)) {
      res.status(400).json({ error: "Query params 'city' and 'size' are required." });
      return;
    }
    if (Number.isNaN(tolerance) || tolerance < 0) {
      res.status(400).json({ error: "'tolerance' must be a non-negative number." });
      return;
    }

    const features = await loadCityFeatures(city);
    if (!features) {
      const cities = await listAvailableCities();
      res.status(404).json({ error: `No cadastre file found for city '${city}'.`, cities });
      return;
    }

    const matches = searchParcels(features, size, tolerance);

    res.json({
      type: "FeatureCollection",
      features: matches.map(({ feature, centroid }) => ({
        ...feature,
        properties: {
          ...feature.properties,
          googleMapsLink: googleMapsLink(centroid[0], centroid[1]),
        },
      })),
    });
  });

  return router;
}
