const elements = {
  transaction: document.getElementById("transactionFilter"),
  metric: document.getElementById("metricFilter"),
  district: document.getElementById("districtFilter"),
  search: document.getElementById("searchFilter"),
  sample: document.getElementById("sampleFilter"),
  export: document.getElementById("exportButton"),
  status: document.getElementById("dataStatus"),
  caveat: document.getElementById("caveatBand"),
  kpis: document.getElementById("kpiStrip"),
  map: document.getElementById("mapFrame"),
  legend: document.getElementById("mapLegend"),
  evidence: document.getElementById("evidenceList"),
  trend: document.getElementById("trendChart"),
  volume: document.getElementById("volumeChart"),
  crimeReadout: document.getElementById("crimeReadout"),
  crime: document.getElementById("crimeChart"),
  ranking: document.getElementById("districtRanking"),
  table: document.getElementById("listingTable")
};

const officialToSsSlug = {
  "Atgāzene": "atgazene",
  "Avoti": "centre",
  "Beberbeķi": "beberbeki",
  "Berģi": "bergi",
  "Bieriņi": "bierini",
  "Bišumuiža": "bisumuiza",
  "Bolderāja": "bolderaya",
  "Brasa": "centre",
  "Brekši": "breksi",
  "Bukulti": "bukulti",
  "Buļļi": "bulli",
  "Centrs": "centre",
  "Daugavgrīva": "daugavgriva",
  "Dreiliņi": "dreilini",
  "Dzirciems": "dzeguzhkalns",
  "Dārzciems": "darzciems",
  "Dārziņi": "darzini",
  "Grīziņkalns": "grizinkalns",
  "Imanta": "imanta",
  "Iļģuciems": "ilguciems",
  "Jaunciems": "jaunciems",
  "Jugla": "yugla",
  "Katlakalns": "katlakalns",
  "Kleisti": "kleisti",
  "Kundziņsala": "kundzinsala",
  "Latgale": "maskavas-priekshpilseta",
  "Mangaļsala": "mangalsala",
  "Mežaparks": "mezhapark",
  "Mežciems": "mezhciems",
  "Mīlgrāvis": "mangali",
  "Mūkupurvs": "mukupurvs",
  "Pleskodāle": "shampeteris-pleskodale",
  "Purvciems": "purvciems",
  "Pētersala-Andrejsala": "centre",
  "Pļavnieki": "plyavnieki",
  "Rumbula": "rumbula",
  "Salas": "lucavsala",
  "Sarkandaugava": "sarkandaugava",
  "Skanste": "centre",
  "Spilve": "spilve",
  "Suži": "suzi",
  "Teika": "teika",
  "Torņakalns": "tornjakalns",
  "Trīsciems": "trisciems",
  "Vecdaugava": "vecdaugava",
  "Vecmīlgrāvis": "vecmilgravis",
  "Vecpilsēta": "vecriga",
  "Vecāķi": "vecaki",
  "Voleri": "voleri",
  "Zasulauks": "zasulauks",
  "Ziepniekkalns": "ziepniekkalns",
  "Zolitūde": "zolitude",
  "Āgenskalns": "agenskalns",
  "Čiekurkalns": "chiekurkalns",
  "Ķengarags": "kengarags",
  "Ķīpsala": "kipsala",
  "Šampēteris": "shampeteris-pleskodale",
  "Šķirotava": "shkirotava"
};

const labelNames = new Set(["Centrs", "Vecpilsēta", "Āgenskalns", "Purvciems", "Teika", "Imanta", "Ķengarags", "Pļavnieki", "Ziepniekkalns", "Mežciems"]);
const transactionOrder = ["sell", "hand_over", "buy", "remove"];
const transactionColors = {
  sell: "#e4b05a",
  hand_over: "#78d2bf",
  buy: "#7ca7ff",
  remove: "#a68cff"
};
const metricLabels = {
  sale_m2: "Sale median €/m²",
  rent_month: "Rent median €/month",
  count: "Observed listing count",
  coverage: "Coverage score"
};
const crimeLayerCaveat = "Crime layer is official aggregate/proxy data, not incident-level police data.";

let appData = null;
let geoData = null;
let state = readStateFromUrl();

init().catch((error) => {
  console.error(error);
  document.body.innerHTML = document.getElementById("errorTemplate").innerHTML;
});

async function init() {
  const [market, geography] = await Promise.all([
    fetchJson("./data/market.json"),
    fetchJson("./data/riga-apkaimes.json")
  ]);
  validateMarketData(market);
  validateGeoData(geography);
  appData = market;
  geoData = geography;
  hydrateControls();
  attachEvents();
  render();
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  return response.json();
}

function validateMarketData(data) {
  const requiredArrays = ["monthlyAggregates", "listingRows", "districtOptions", "vzdReference", "crimeFeatureRows"];
  for (const key of requiredArrays) {
    if (!Array.isArray(data[key])) throw new Error(`market.json missing array ${key}`);
  }
  if (!data.schemaVersion) throw new Error("market.json missing schemaVersion");
  for (const row of data.monthlyAggregates) {
    if (!row.month || !row.districtSlug || !row.transactionType) throw new Error("monthlyAggregates row missing required keys");
  }
}

function validateGeoData(data) {
  if (!data || data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    throw new Error("riga-apkaimes.json is not a GeoJSON FeatureCollection");
  }
}

function hydrateControls() {
  elements.transaction.innerHTML = [
    `<option value="all">All four types</option>`,
    ...transactionOrder.map((key) => `<option value="${key}">${escapeHtml(appData.transactionLabels[key] ?? key)}</option>`)
  ].join("");
  elements.district.innerHTML = [
    `<option value="all">All Riga districts</option>`,
    ...appData.districtOptions.map((item) => `<option value="${escapeAttr(item.slug)}">${escapeHtml(item.name)}</option>`)
  ].join("");
  elements.transaction.value = state.type;
  elements.metric.value = state.metric;
  elements.district.value = state.district;
  elements.search.value = state.query;
  elements.sample.checked = state.showLowSample;
}

function attachEvents() {
  elements.transaction.addEventListener("change", () => setState({ type: elements.transaction.value }));
  elements.metric.addEventListener("change", () => setState({ metric: elements.metric.value }));
  elements.district.addEventListener("change", () => setState({ district: elements.district.value }));
  elements.search.addEventListener("input", () => setState({ query: elements.search.value }));
  elements.sample.addEventListener("change", () => setState({ showLowSample: elements.sample.checked }));
  elements.export.addEventListener("click", () => exportCsv(filteredListings()));
}

function setState(next) {
  state = { ...state, ...next };
  writeStateToUrl();
  render();
}

function readStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    type: params.get("type") || "all",
    metric: params.get("metric") || "sale_m2",
    district: params.get("district") || "all",
    query: params.get("q") || "",
    showLowSample: params.get("lowSample") !== "hide"
  };
}

function writeStateToUrl() {
  const params = new URLSearchParams();
  if (state.type !== "all") params.set("type", state.type);
  if (state.metric !== "sale_m2") params.set("metric", state.metric);
  if (state.district !== "all") params.set("district", state.district);
  if (state.query) params.set("q", state.query);
  if (!state.showLowSample) params.set("lowSample", "hide");
  const suffix = params.toString();
  window.history.replaceState(null, "", suffix ? `?${suffix}` : window.location.pathname);
}

function render() {
  elements.transaction.value = state.type;
  elements.metric.value = state.metric;
  elements.district.value = state.district;
  elements.search.value = state.query;
  elements.sample.checked = state.showLowSample;
  renderStatus();
  renderCaveats();
  renderKpis();
  renderMap();
  renderEvidence();
  renderTrendChart();
  renderVolumeChart();
  renderCrimeProxy();
  renderRanking();
  renderListingTable();
}

function renderStatus() {
  const generated = appData.generatedAt ? new Date(appData.generatedAt) : null;
  const generatedText = generated && !Number.isNaN(generated.getTime()) ? generated.toISOString().slice(0, 10) : "unknown";
  const sample = String(appData.sourceStatus || "").includes("sample");
  elements.status.classList.toggle("warning", sample);
  elements.status.textContent = `${appData.sourceStatusLabel || appData.sourceStatus || "Loaded"} · generated ${generatedText}`;
}

function renderCaveats() {
  const first = appData.caveats?.[0] || "Observed snapshots only.";
  const crime = appData.crimeMetadata?.caveat || appData.caveats?.find((item) => item === crimeLayerCaveat) || crimeLayerCaveat;
  elements.caveat.innerHTML = `<strong>Coverage caveat</strong><span>${escapeHtml(first)} Wayback is sparse; last seen does not mean sold or rented; VZD is separate. ${escapeHtml(crime)}</span>`;
}

function renderKpis() {
  const rows = filteredAggregates();
  const latestMonth = latest(rows, (row) => row.month, "2021-06");
  const latestRows = rows.filter((row) => row.month === latestMonth);
  const saleRows = latestRows.filter((row) => row.transactionType === "sell" && row.medianPricePerM2Eur !== null);
  const rentRows = latestRows.filter((row) => row.transactionType === "hand_over" && row.medianRentEur !== null);
  const audit = appData.coverageReport;
  const coverage = audit?.expectedSourceUrlCount
    ? Math.round((audit.observedExpectedSourceUrlCount / audit.expectedSourceUrlCount) * 100)
    : latestRows.length ? Math.round(mean(latestRows.map((row) => row.coverageScore)) * 100) : 0;
  const data = [
    ["Latest month", latestMonth],
    ["Observed listings", formatNumber(sum(latestRows.map((row) => row.listingCount)))],
    ["Sale median", median(saleRows.map((row) => row.medianPricePerM2Eur)) ? `${formatNumber(median(saleRows.map((row) => row.medianPricePerM2Eur)))} €/m²` : "n/a"],
    ["Rent median", median(rentRows.map((row) => row.medianRentEur)) ? `${formatNumber(median(rentRows.map((row) => row.medianRentEur)))} €/mo` : "n/a"],
    [audit ? "Source URL audit" : "Coverage score", audit ? `${audit.observedExpectedSourceUrlCount}/${audit.expectedSourceUrlCount}` : `${coverage}%`, "warning"]
  ];
  elements.kpis.innerHTML = data.map(([label, value, tone]) => (
    `<div class="metric ${tone || ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
  )).join("");
}

function renderMap() {
  const width = 720;
  const height = 520;
  const project = createProjector(geoData.features, width, height, 28);
  const metricRows = latestMetricRows();
  const values = metricRows.map((item) => item.value).filter(isFiniteNumber);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const activeLabel = selectedDistrictLabel(state.district);
  const activeMetric = state.district === "all" ? null : metricRows.find((item) => item.slug === state.district);

  const shapes = geoData.features.map((feature) => {
    const officialName = feature.properties.apkaime;
    const slug = officialToSsSlug[officialName] || slugify(officialName);
    const metric = metricRows.find((item) => item.slug === slug);
    const active = state.district === slug;
    const centroid = centroidOfFeature(feature, project);
    const shouldLabel = active || labelNames.has(officialName);
    const value = metric?.value ?? null;
    const fill = value === null ? "#24261f" : colorForValue(value, min, max, state.metric);
    const opacity = metric ? Math.max(0.46, metric.coverageScore ?? 0.5) : 0.26;
    return `
      <g>
        <path
          class="district-shape ${active ? "active" : ""} ${metric?.lowSample ? "low-sample" : ""}"
          d="${pathForGeometry(feature.geometry, project)}"
          fill="${fill}"
          opacity="${opacity}"
          role="button"
          tabindex="0"
          data-slug="${escapeAttr(slug)}"
          aria-label="${escapeAttr(`${officialName}: ${formatMetric(value, state.metric)}`)}"
        >
          <title>${escapeHtml(`${officialName}: ${formatMetric(value, state.metric)}`)}</title>
        </path>
        ${shouldLabel ? `<text class="district-label" x="${centroid.x}" y="${centroid.y}">${escapeHtml(shortName(officialName))}</text>` : ""}
      </g>
    `;
  }).join("");

  elements.map.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="group" aria-label="Interactive Riga apkaime value map">${shapes}</svg>`;
  elements.map.querySelectorAll(".district-shape").forEach((path) => {
    path.addEventListener("click", () => setState({ district: state.district === path.dataset.slug ? "all" : path.dataset.slug }));
    path.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setState({ district: state.district === path.dataset.slug ? "all" : path.dataset.slug });
      }
    });
  });

  elements.legend.innerHTML = `
    <div class="tooltip-card">
      <span>Selected apkaime</span>
      <strong>${escapeHtml(activeLabel)}</strong>
      <em>${activeMetric ? escapeHtml(formatMetric(activeMetric.value, state.metric)) : "All Riga context"}</em>
      <small>${activeMetric ? `${activeMetric.listingCount} listings · ${Math.round(activeMetric.coverageScore * 100)}% coverage` : metricLabels[state.metric]}</small>
    </div>
    <div class="legend-row"><span class="legend-swatch" style="background:${colorForValue(min, min, max, state.metric)}"></span><span>${escapeHtml(formatMetric(min, state.metric))}</span></div>
    <div class="legend-row"><span class="legend-swatch" style="background:${colorForValue((min + max) / 2, min, max, state.metric)}"></span><span>Coverage controls opacity</span></div>
    <div class="legend-row"><span class="legend-swatch" style="background:${colorForValue(max, min, max, state.metric)}"></span><span>${escapeHtml(formatMetric(max, state.metric))}</span></div>
    <div class="legend-row"><span class="legend-swatch" style="background:#24261f"></span><span>No SS observation</span></div>
  `;
}

function renderEvidence() {
  const latestMonth = latest(appData.monthlyAggregates, (row) => row.month, "2021-06");
  const latestRows = appData.monthlyAggregates.filter((row) => row.month === latestMonth);
  const bestSale = latestRows.filter((row) => row.transactionType === "sell" && row.medianPricePerM2Eur !== null).sort((a, b) => b.medianPricePerM2Eur - a.medianPricePerM2Eur)[0];
  const strongestRent = latestRows.filter((row) => row.transactionType === "hand_over" && row.medianRentEur !== null).sort((a, b) => b.medianRentEur - a.medianRentEur)[0];
  const listings = filteredListings();
  const reductions = listings.filter((row) => hasComparablePrices(row) && row.priceNow < row.priceThen).length;
  const lowCoverage = filteredAggregates().filter((row) => row.month === latestMonth && row.coverageScore < 0.62).length;
  const crime = latestCrimeFeature();
  const audit = appData.coverageReport;
  const rows = [
    ["Highest observed sale median", bestSale ? `${bestSale.districtName} · ${formatNumber(bestSale.medianPricePerM2Eur)} €/m²` : "n/a"],
    ["Highest observed rent median", strongestRent ? `${strongestRent.districtName} · ${formatNumber(strongestRent.medianRentEur)} €/mo` : "n/a"],
    ["Price reductions in filtered listings", String(reductions)],
    ["Low-coverage district/type cells", String(lowCoverage)],
    ["Coverage audit", audit ? `${audit.observedExpectedSourceUrlCount}/${audit.expectedSourceUrlCount} source URLs · ${audit.observedMonthCount}/${audit.expectedMonthCount} months` : "No coverage report loaded"],
    ["Raw snapshot refs", audit ? `${audit.rawHtmlFileCount} HTML files · ${audit.rawHtmlUrlRefCount} URL refs` : "n/a"],
    ["Riga-wide crime proxy", crime ? `${crime.period} · index ${formatDecimal(crime.crimeRiskIndex, 3)} · ${formatNumber(crime.rigaCourtCriminalDecisionsMonth)} court decisions` : "n/a"],
    ["Crime geography", state.district === "all" ? "Rīga municipality control" : "Rīga municipality control; district filter does not localize crime"],
    ["Data status", appData.sourceStatusLabel || appData.sourceStatus || "loaded"]
  ];
  elements.evidence.innerHTML = rows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
}

function renderTrendChart() {
  const series = trendSeriesForMetric(state.metric);
  if (!series.length) {
    elements.trend.innerHTML = emptySvg("No trend data for this filter");
    return;
  }
  const width = 760;
  const height = 320;
  const margin = { top: 22, right: 28, bottom: 48, left: 62 };
  const months = series.map((row) => row.month);
  const values = series.map((row) => row.value).filter(isFiniteNumber);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const yMin = state.metric === "coverage" ? 0 : Math.max(0, minValue * 0.78);
  const yMax = state.metric === "coverage" ? 100 : maxValue * 1.08;
  const x = (index) => margin.left + (index * (width - margin.left - margin.right)) / Math.max(1, months.length - 1);
  const y = (value) => height - margin.bottom - ((value - yMin) / Math.max(1, yMax - yMin)) * (height - margin.top - margin.bottom);
  const line = series.map((row, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(row.value).toFixed(1)}`).join(" ");
  const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const gy = margin.top + ratio * (height - margin.top - margin.bottom);
    const value = yMax - ratio * (yMax - yMin);
    return `<line class="grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${gy}" y2="${gy}" /><text class="chart-label" x="${margin.left - 10}" y="${gy + 4}" text-anchor="end">${escapeHtml(formatAxis(value, state.metric))}</text>`;
  }).join("");
  const ticks = months.map((month, index) => `<text class="chart-label" x="${x(index)}" y="${height - 16}" text-anchor="middle" transform="rotate(-28 ${x(index)} ${height - 16})">${month}</text>`).join("");
  const points = series.map((row, index) => `<circle cx="${x(index)}" cy="${y(row.value)}" r="3" fill="#78d2bf" />`).join("");
  const reference = state.metric === "sale_m2" ? referenceLine(months, x, y) : "";
  elements.trend.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly median trend chart">
      ${grid}
      ${ticks}
      <path d="${line}" fill="none" stroke="#78d2bf" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
      ${points}
      ${reference}
      <g class="legend">
        <circle cx="${margin.left}" cy="18" r="4" fill="#78d2bf" /><text x="${margin.left + 10}" y="22">SS observed median</text>
        ${state.metric === "sale_m2" ? `<line x1="${margin.left + 152}" x2="${margin.left + 182}" y1="18" y2="18" stroke="#e4b05a" stroke-width="2" stroke-dasharray="5 4" /><text x="${margin.left + 190}" y="22">VZD confirmed sales reference</text>` : ""}
      </g>
    </svg>
  `;
}

function referenceLine(months, x, y) {
  const rows = appData.vzdReference.filter((row) => state.district === "all" || row.districtSlug === state.district);
  const byMonth = new Map(months.map((month) => [month, rows.filter((row) => row.month === month)]));
  const points = months.map((month) => {
    const values = (byMonth.get(month) || []).map((row) => row.medianSalePricePerM2Eur).filter(isFiniteNumber);
    return values.length ? median(values) : null;
  });
  const valid = points.map((value, index) => ({ value, index })).filter((item) => item.value !== null);
  if (valid.length < 2) return "";
  const d = valid.map((item, order) => `${order === 0 ? "M" : "L"}${x(item.index).toFixed(1)},${y(item.value).toFixed(1)}`).join(" ");
  return `<path d="${d}" fill="none" stroke="#e4b05a" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round" />`;
}

function renderVolumeChart() {
  const rows = appData.monthlyAggregates.filter((row) => {
    if (state.district !== "all" && row.districtSlug !== state.district) return false;
    if (!state.showLowSample && row.lowSample) return false;
    return true;
  });
  const months = [...new Set(rows.map((row) => row.month))].sort();
  const width = 520;
  const height = 320;
  const margin = { top: 30, right: 16, bottom: 48, left: 44 };
  const grouped = months.map((month) => {
    const monthRows = rows.filter((row) => row.month === month);
    const counts = Object.fromEntries(transactionOrder.map((type) => [type, sum(monthRows.filter((row) => row.transactionType === type).map((row) => row.listingCount))]));
    return { month, counts, total: sum(Object.values(counts)) };
  });
  const maxTotal = Math.max(1, ...grouped.map((row) => row.total));
  const barGap = 4;
  const barWidth = (width - margin.left - margin.right) / Math.max(1, grouped.length) - barGap;
  const y = (value) => height - margin.bottom - (value / maxTotal) * (height - margin.top - margin.bottom);
  const bars = grouped.map((row, index) => {
    let running = 0;
    const x = margin.left + index * (barWidth + barGap);
    return transactionOrder.map((type) => {
      const value = row.counts[type];
      const yTop = y(running + value);
      const yBottom = y(running);
      running += value;
      return `<rect x="${x}" y="${yTop}" width="${barWidth}" height="${Math.max(0, yBottom - yTop)}" fill="${transactionColors[type]}" opacity="0.86"><title>${row.month} ${type}: ${value}</title></rect>`;
    }).join("") + `<text class="chart-label" x="${x + barWidth / 2}" y="${height - 16}" text-anchor="middle" transform="rotate(-35 ${x + barWidth / 2} ${height - 16})">${row.month}</text>`;
  }).join("");
  const legend = transactionOrder.map((type, index) => {
    const x = margin.left + index * 108;
    return `<rect x="${x}" y="12" width="10" height="10" fill="${transactionColors[type]}" /><text class="chart-label" x="${x + 15}" y="21">${escapeHtml(appData.transactionLabels[type])}</text>`;
  }).join("");
  elements.volume.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Listing volume by transaction type">
      <line class="grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${y(maxTotal)}" y2="${y(maxTotal)}" />
      <line class="grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${y(maxTotal / 2)}" y2="${y(maxTotal / 2)}" />
      <text class="chart-label" x="${margin.left - 8}" y="${y(maxTotal) + 4}" text-anchor="end">${formatNumber(maxTotal)}</text>
      <text class="chart-label" x="${margin.left - 8}" y="${y(maxTotal / 2) + 4}" text-anchor="end">${formatNumber(maxTotal / 2)}</text>
      ${bars}
      <g class="legend">${legend}</g>
    </svg>
  `;
}

function renderCrimeProxy() {
  const rows = (appData.crimeFeatureRows || []).filter((row) => isFiniteNumber(row.crimeRiskIndex));
  const latestCrime = latestCrimeFeature();
  if (!rows.length || !latestCrime) {
    elements.crimeReadout.innerHTML = `<p>No crime proxy controls available.</p>`;
    elements.crime.innerHTML = emptySvg("No crime proxy trend data");
    return;
  }

  const filteredNote = state.district === "all"
    ? "Applies as a Riga municipality control across all displayed housing rows."
    : "District filter is active, but this control remains Riga-wide and is not localized to the selected apkaime.";
  elements.crimeReadout.innerHTML = `
    <div><span>Latest proxy month</span><strong>${escapeHtml(latestCrime.period)}</strong></div>
    <div><span>Proxy index</span><strong>${formatDecimal(latestCrime.crimeRiskIndex, 3)}</strong></div>
    <div><span>Court decisions</span><strong>${formatNumber(latestCrime.rigaCourtCriminalDecisionsMonth)}</strong></div>
    <div><span>Confidence</span><strong>${escapeHtml(latestCrime.crimeConfidence || "n/a")}</strong></div>
    <p>${escapeHtml(filteredNote)} ${escapeHtml(appData.crimeMetadata?.caveat || crimeLayerCaveat)}</p>
  `;

  const width = 760;
  const height = 320;
  const margin = { top: 28, right: 34, bottom: 52, left: 56 };
  const courtMax = Math.max(1, ...rows.map((row) => row.areaProxyCriminalDecisionsMonth || 0));
  const x = (index) => margin.left + (index * (width - margin.left - margin.right)) / Math.max(1, rows.length - 1);
  const yRisk = (value) => height - margin.bottom - Math.max(0, Math.min(1, value || 0)) * (height - margin.top - margin.bottom);
  const yCourt = (value) => height - margin.bottom - ((value || 0) / courtMax) * (height - margin.top - margin.bottom);
  const barWidth = Math.max(3, Math.min(12, (width - margin.left - margin.right) / rows.length - 2));
  const riskLine = rows.map((row, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${yRisk(row.crimeRiskIndex).toFixed(1)}`).join(" ");
  const bars = rows.map((row, index) => {
    const cx = x(index);
    const yTop = yCourt(row.areaProxyCriminalDecisionsMonth);
    return `<rect x="${(cx - barWidth / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${(height - margin.bottom - yTop).toFixed(1)}" fill="#7ca7ff" opacity="0.28"><title>${escapeHtml(row.period)} court proxy: ${formatNumber(row.areaProxyCriminalDecisionsMonth)}</title></rect>`;
  }).join("");
  const points = rows.map((row, index) => `<circle cx="${x(index)}" cy="${yRisk(row.crimeRiskIndex)}" r="2.4" fill="#ff9d82"><title>${escapeHtml(row.period)} proxy index: ${formatDecimal(row.crimeRiskIndex, 3)}</title></circle>`).join("");
  const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const gy = margin.top + (1 - ratio) * (height - margin.top - margin.bottom);
    return `<line class="grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${gy}" y2="${gy}" /><text class="chart-label" x="${margin.left - 10}" y="${gy + 4}" text-anchor="end">${ratio.toFixed(2)}</text>`;
  }).join("");
  const ticks = rows
    .filter((_, index) => index % 6 === 0 || index === rows.length - 1)
    .map((row) => {
      const index = rows.indexOf(row);
      return `<text class="chart-label" x="${x(index)}" y="${height - 18}" text-anchor="middle" transform="rotate(-28 ${x(index)} ${height - 18})">${escapeHtml(row.period)}</text>`;
    }).join("");

  elements.crime.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Riga-wide crime proxy trend chart">
      ${grid}
      ${bars}
      <path d="${riskLine}" fill="none" stroke="#ff9d82" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
      ${points}
      ${ticks}
      <g class="legend">
        <circle cx="${margin.left}" cy="18" r="4" fill="#ff9d82" /><text x="${margin.left + 10}" y="22">crime_risk_index v1</text>
        <rect x="${margin.left + 172}" y="12" width="10" height="10" fill="#7ca7ff" opacity="0.48" /><text x="${margin.left + 188}" y="22">court decisions proxy</text>
      </g>
    </svg>
  `;
}

function renderRanking() {
  const rows = latestMetricRows().filter((row) => row.value !== null).sort((a, b) => b.value - a.value);
  elements.ranking.innerHTML = rows.slice(0, 10).map((row, index) => `
    <div class="rank-row">
      <button type="button" data-slug="${escapeAttr(row.slug)}">${index + 1}. ${escapeHtml(row.name)}</button>
      <strong>${escapeHtml(formatMetric(row.value, state.metric))}</strong>
      <em>${Math.round(row.coverageScore * 100)}%</em>
    </div>
  `).join("") || `<p>No ranked districts for this filter.</p>`;
  elements.ranking.querySelectorAll("button[data-slug]").forEach((button) => {
    button.addEventListener("click", () => setState({ district: button.dataset.slug }));
  });
}

function renderListingTable() {
  const rows = filteredListings();
  if (!rows.length) {
    elements.table.innerHTML = `<tr class="empty-row"><td colspan="9">No listing observations match this filter.</td></tr>`;
    return;
  }
  elements.table.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.title)}</td>
      <td>${escapeHtml(row.districtName)}</td>
      <td>${escapeHtml(appData.transactionLabels[row.transactionType] || row.transactionType)}</td>
      <td>${escapeHtml(row.rooms)}</td>
      <td>${formatNumber(row.areaM2)}</td>
      <td>${formatNullableNumber(row.priceNow)}</td>
      <td>${isFiniteNumber(row.crimeRiskIndex) ? formatDecimal(row.crimeRiskIndex, 3) : "n/a"}</td>
      <td>${escapeHtml(row.lastSeen)}</td>
      <td>${escapeHtml(row.source)}</td>
    </tr>
  `).join("");
}

function filteredAggregates() {
  return appData.monthlyAggregates.filter((row) => {
    if (state.district !== "all" && row.districtSlug !== state.district) return false;
    if (state.type !== "all" && row.transactionType !== state.type) return false;
    if (!state.showLowSample && row.lowSample) return false;
    return true;
  });
}

function filteredListings() {
  const query = state.query.trim().toLowerCase();
  return appData.listingRows.filter((row) => {
    if (state.district !== "all" && row.districtSlug !== state.district) return false;
    if (state.type !== "all" && row.transactionType !== state.type) return false;
    if (query && !`${row.title} ${row.street} ${row.districtName}`.toLowerCase().includes(query)) return false;
    return true;
  });
}

function latestMetricRows() {
  const latestMonth = latest(appData.monthlyAggregates, (row) => row.month, "2021-06");
  const latestRows = appData.monthlyAggregates.filter((row) => row.month === latestMonth);
  const rows = appData.districtOptions.map((district) => {
    const districtRows = latestRows.filter((row) => row.districtSlug === district.slug);
    const relevant = rowsForMetric(districtRows, state.metric);
    if (!relevant.length) return { slug: district.slug, name: district.name, value: null, listingCount: 0, coverageScore: 0, lowSample: true };
    return {
      slug: district.slug,
      name: district.name,
      value: valueForMetricRows(relevant, state.metric),
      listingCount: sum(relevant.map((row) => row.listingCount)),
      coverageScore: mean(relevant.map((row) => row.coverageScore)),
      lowSample: relevant.some((row) => row.lowSample)
    };
  });
  return rows;
}

function rowsForMetric(rows, metric) {
  if (metric === "sale_m2") return rows.filter((row) => row.transactionType === "sell" && row.medianPricePerM2Eur !== null);
  if (metric === "rent_month") return rows.filter((row) => row.transactionType === "hand_over" && row.medianRentEur !== null);
  if (state.type !== "all") return rows.filter((row) => row.transactionType === state.type);
  return rows;
}

function valueForMetricRows(rows, metric) {
  if (metric === "sale_m2") return median(rows.map((row) => row.medianPricePerM2Eur).filter(isFiniteNumber));
  if (metric === "rent_month") return median(rows.map((row) => row.medianRentEur).filter(isFiniteNumber));
  if (metric === "coverage") return Math.round(mean(rows.map((row) => row.coverageScore)) * 100);
  return sum(rows.map((row) => row.listingCount));
}

function trendSeriesForMetric(metric) {
  const months = [...new Set(appData.monthlyAggregates.map((row) => row.month))].sort();
  return months.map((month) => {
    const rows = appData.monthlyAggregates.filter((row) => {
      if (row.month !== month) return false;
      if (state.district !== "all" && row.districtSlug !== state.district) return false;
      if (!state.showLowSample && row.lowSample) return false;
      return true;
    });
    const relevant = rowsForMetric(rows, metric);
    if (!relevant.length) return null;
    return { month, value: valueForMetricRows(relevant, metric) };
  }).filter(Boolean).filter((row) => row.value !== null && Number.isFinite(row.value));
}

function latestCrimeFeature() {
  const rows = (appData.crimeFeatureRows || [])
    .filter((row) => row.period && isFiniteNumber(row.crimeRiskIndex))
    .sort((a, b) => a.period.localeCompare(b.period));
  return rows[rows.length - 1] || null;
}

function createProjector(features, width, height, padding) {
  const coords = [];
  for (const feature of features) collectCoords(feature.geometry.coordinates, coords);
  const xs = coords.map((coord) => coord[0]);
  const ys = coords.map((coord) => coord[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min((width - padding * 2) / Math.max(0.0001, maxX - minX), (height - padding * 2) / Math.max(0.0001, maxY - minY));
  const usedWidth = (maxX - minX) * scale;
  const usedHeight = (maxY - minY) * scale;
  const offsetX = (width - usedWidth) / 2;
  const offsetY = (height - usedHeight) / 2;
  return ([lon, lat]) => ({
    x: offsetX + (lon - minX) * scale,
    y: height - offsetY - (lat - minY) * scale
  });
}

function collectCoords(value, out) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    out.push(value);
    return;
  }
  for (const item of value) collectCoords(item, out);
}

function pathForGeometry(geometry, project) {
  if (geometry.type === "Polygon") return geometry.coordinates.map((ring) => ringPath(ring, project)).join(" ");
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flatMap((polygon) => polygon.map((ring) => ringPath(ring, project))).join(" ");
  return "";
}

function ringPath(ring, project) {
  return ring.map((coord, index) => {
    const point = project(coord);
    return `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }).join(" ") + " Z";
}

function centroidOfFeature(feature, project) {
  const coords = [];
  collectCoords(feature.geometry.coordinates, coords);
  if (!coords.length) return { x: 0, y: 0 };
  const projected = coords.map(project);
  return {
    x: mean(projected.map((point) => point.x)).toFixed(1),
    y: mean(projected.map((point) => point.y)).toFixed(1)
  };
}

function colorForValue(value, min, max, metric) {
  if (!isFiniteNumber(value)) return "#24261f";
  const ratio = max === min ? 0.5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  if (metric === "coverage") {
    const lightness = 28 + ratio * 42;
    return `hsl(39, 64%, ${lightness}%)`;
  }
  const lightness = 24 + ratio * 42;
  const saturation = 34 + ratio * 24;
  return `hsl(166, ${saturation}%, ${lightness}%)`;
}

function formatMetric(value, metric) {
  if (value === null || value === undefined || Number.isNaN(value)) return "no observation";
  if (metric === "sale_m2") return `${formatNumber(value)} €/m²`;
  if (metric === "rent_month") return `${formatNumber(value)} €/mo`;
  if (metric === "coverage") return `${formatNumber(value)}%`;
  return `${formatNumber(value)} listings`;
}

function formatAxis(value, metric) {
  if (metric === "coverage") return `${Math.round(value)}%`;
  if (metric === "count") return formatNumber(value);
  return formatNumber(value);
}

function selectedDistrictLabel(slug) {
  if (slug === "all") return "All Riga";
  return appData.districtOptions.find((item) => item.slug === slug)?.name || slug;
}

function shortName(name) {
  return name
    .replace("Ziepniekkalns", "Ziep.")
    .replace("Vecmīlgrāvis", "Vecm.")
    .replace("Vecpilsēta", "Vecrīga")
    .replace("Āgenskalns", "Āgens.")
    .replace("Pļavnieki", "Pļav.")
    .replace("Ķengarags", "Ķeng.");
}

function exportCsv(rows) {
  const header = [
    "id",
    "title",
    "district",
    "transaction_type",
    "rooms",
    "area_m2",
    "street",
    "first_seen",
    "last_seen",
    "price_then",
    "price_now",
    "crime_layer_caveat",
    "crime_area",
    "crime_area_type",
    "crime_risk_index",
    "riga_court_criminal_decisions_month",
    "crime_source",
    "crime_confidence",
    "crime_notes",
    "source"
  ];
  const lines = rows.map((row) => [
    row.id,
    row.title,
    row.districtName,
    row.transactionType,
    row.rooms,
    row.areaM2,
    row.street,
    row.firstSeen,
    row.lastSeen,
    row.priceThen ?? "",
    row.priceNow ?? "",
    appData.crimeMetadata?.caveat || crimeLayerCaveat,
    row.crimeArea,
    row.crimeAreaType,
    row.crimeRiskIndex,
    row.rigaCourtCriminalDecisionsMonth,
    row.crimeSource,
    row.crimeConfidence,
    row.crimeNotes,
    row.source
  ].map(csvCell).join(","));
  const csv = [header.map(csvCell).join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "negativezero-riga-real-estate-listings.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function emptySvg(message) {
  return `<svg viewBox="0 0 760 320" role="img" aria-label="${escapeAttr(message)}"><text x="380" y="160" text-anchor="middle" fill="#8c8a80">${escapeHtml(message)}</text></svg>`;
}

function median(values) {
  const clean = values.filter(isFiniteNumber).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : Math.round((clean[mid - 1] + clean[mid]) / 2);
}

function mean(values) {
  const clean = values.filter(isFiniteNumber);
  return clean.length ? sum(clean) / clean.length : 0;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function latest(rows, getter, fallback) {
  return rows.reduce((current, row) => {
    const value = getter(row);
    return value > current ? value : current;
  }, fallback);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function hasComparablePrices(row) {
  return isFiniteNumber(row.priceThen) && isFiniteNumber(row.priceNow);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatNullableNumber(value) {
  return isFiniteNumber(value) ? formatNumber(value) : "n/a";
}

function formatDecimal(value, digits = 2) {
  if (!isFiniteNumber(value)) return "n/a";
  return Number(value).toFixed(digits);
}

function slugify(value) {
  return String(value).toLowerCase().replace(/\s+/g, "-");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
