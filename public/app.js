const API_BASE = window.API_BASE_URL || "";

const map = L.map("map").setView([46.6, 2.2], 6); // France

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

let resultsLayer = L.geoJSON(null, {
  style: {
    color: "#2563eb",
    weight: 2,
    fillOpacity: 0.25,
  },
  onEachFeature: (feature, layer) => {
    const p = feature.properties;
    layer.bindPopup(
      `<strong>Parcel ${p.id}</strong><br>` +
        `Section ${p.section} n&deg;${p.numero}<br>` +
        `${p.contenance} m&sup2;<br>` +
        `<a href="${p.googleMapsLink}" target="_blank" rel="noopener">Open in Google Maps</a>`,
    );
  },
}).addTo(map);

const form = document.getElementById("search-form");
const citySelect = document.getElementById("city");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

async function loadCities() {
  const res = await fetch(`${API_BASE}/api/cities`);
  const data = await res.json();
  citySelect.innerHTML = "";
  for (const city of data.cities) {
    const option = document.createElement("option");
    option.value = city;
    option.textContent = city;
    citySelect.appendChild(option);
  }
}

function renderResults(features) {
  resultsEl.innerHTML = "";
  for (const feature of features) {
    const p = feature.properties;
    const li = document.createElement("li");
    li.innerHTML =
      `<span class="parcel-id">${p.id}</span>` +
      `<span class="parcel-size">Section ${p.section} n&deg;${p.numero} &mdash; ${p.contenance} m&sup2;</span> ` +
      `<a href="${p.googleMapsLink}" target="_blank" rel="noopener">Google Maps</a>`;
    li.addEventListener("click", () => {
      const layer = resultsLayer
        .getLayers()
        .find((l) => l.feature.properties.id === p.id);
      if (layer) {
        map.fitBounds(layer.getBounds(), { maxZoom: 18 });
        layer.openPopup();
      }
    });
    resultsEl.appendChild(li);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const city = citySelect.value;
  const size = document.getElementById("size").value;
  const tolerance = document.getElementById("tolerance").value;

  statusEl.textContent = "Searching...";
  resultsEl.innerHTML = "";
  resultsLayer.clearLayers();

  const params = new URLSearchParams({ city, size, tolerance });
  const res = await fetch(`${API_BASE}/api/search?${params}`);
  const data = await res.json();

  if (!res.ok) {
    statusEl.textContent = data.error ?? "Something went wrong.";
    return;
  }

  if (data.features.length === 0) {
    statusEl.textContent = `No parcels found in city ${city} within ${size} m² ±${tolerance} m².`;
    return;
  }

  statusEl.textContent = `${data.features.length} parcel(s) found in city ${city}.`;
  resultsLayer.addData(data);
  renderResults(data.features);
  map.fitBounds(resultsLayer.getBounds(), { maxZoom: 18 });
});

loadCities();
