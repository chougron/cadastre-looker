const API_BASE = window.API_BASE_URL || "";
const GEO_API_BASE = "https://geo.api.gouv.fr";

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
const citySearchInput = document.getElementById("city-search");
const citySuggestionsEl = document.getElementById("city-suggestions");
const cityCodeInput = document.getElementById("city-code");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

function hideSuggestions() {
  citySuggestionsEl.hidden = true;
  citySuggestionsEl.innerHTML = "";
}

function selectCity(code, name, zipCode) {
  cityCodeInput.value = code;
  citySearchInput.value = `${name} (${zipCode})`;
  hideSuggestions();
}

function renderSuggestions(communes) {
  citySuggestionsEl.innerHTML = "";
  if (communes.length === 0) {
    hideSuggestions();
    return;
  }
  for (const commune of communes) {
    const zipCodes = (commune.codesPostaux ?? []).join(", ") || commune.code;
    const li = document.createElement("li");
    li.innerHTML = `<span>${commune.nom} (${zipCodes})</span>`;
    li.addEventListener("mousedown", (event) => {
      // mousedown fires before the input's blur event, unlike click
      event.preventDefault();
      selectCity(commune.code, commune.nom, commune.codesPostaux?.[0] ?? commune.code);
    });
    citySuggestionsEl.appendChild(li);
  }
  citySuggestionsEl.hidden = false;
}

function debounce(fn, delayMs) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delayMs);
  };
}

const searchCommunes = debounce(async (query) => {
  const params = new URLSearchParams({
    nom: query,
    fields: "nom,code,codesPostaux",
    boost: "population",
    limit: "8",
  });
  const res = await fetch(`${GEO_API_BASE}/communes?${params}`);
  if (!res.ok) {
    hideSuggestions();
    return;
  }
  renderSuggestions(await res.json());
}, 300);

citySearchInput.addEventListener("input", () => {
  cityCodeInput.value = "";
  const query = citySearchInput.value.trim();
  if (query.length < 2) {
    hideSuggestions();
    return;
  }
  searchCommunes(query);
});

citySearchInput.addEventListener("blur", () => hideSuggestions());

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
  const city = cityCodeInput.value;
  const size = document.getElementById("size").value;
  const tolerance = document.getElementById("tolerance").value;

  if (!city) {
    statusEl.textContent = "Please pick a city from the suggestions list.";
    return;
  }

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
