// Game Configuration
const CONFIG = {
    meteorIntervalMin: 300000, // 5 minutes
    meteorIntervalMax: 300000,
    meteorChance: 0.03,        // 3% destruction chance
    baseIncome: 5,
    baseCost: 50,
    stockInterval: 90000,      // 1 minute 30 seconds
    stockAmount: 30
};

// Rarity Definitions
const RARITIES = {
    COMMON: { id: 'common', name: 'COMMON', multiplier: 1, color: '#22c55e', rank: 1, weight: 100 },
    RARE: { id: 'rare', name: 'RARE', multiplier: 5, color: '#3b82f6', rank: 2, weight: 50 },
    EPIC: { id: 'epic', name: 'EPIC', multiplier: 15, color: '#a855f7', rank: 3, weight: 25 },
    LEGENDARY: { id: 'legendary', name: 'LEGENDARY', multiplier: 30, color: '#eab308', rank: 3.5, weight: 15 },
    MYTHIC: { id: 'mythic', name: 'MYTHIC', multiplier: 50, color: '#ef4444', rank: 4, weight: 10 },
    GODLY: { id: 'godly', name: 'GODLY', multiplier: 150, color: '#ff00ff', rank: 5, weight: 5 },
    SECRET: { id: 'secret', name: 'SECRET', multiplier: 500, color: '#1f2937', rank: 6, weight: 2 },
    OG: { id: 'og', name: 'OG', multiplier: 1000, color: '#b45309', rank: 7, weight: 1 }
};

// Fixed assignments by Name
// User requested "Bigger = Better Rarity".
// We remove most hardcoded overrides to let Size determine Rarity.
// Keeping specific requests or corrections.
const FIXED_RARITIES = {
    // Specific user override example:
    'United Kingdom': 'LEGENDARY',
    'Vatican': 'COMMON', // Fits size anyway
};

// Satellite-style colors (Google Earth Vibe)
const REAL_COLORS = {
    // Polar / Ice
    'Antarctica': '#f1f5f9', 'Greenland': '#f1f5f9', 'Iceland': '#cbd5e1',
    // Boreal / Tundra
    'Russia': '#5c7c55', 'Canada': '#5c7c55', 'Norway': '#4d6a49', 'Sweden': '#567d46', 'Finland': '#567d46',
    // Temperate / Green
    'United States': '#658d53', 'China': '#8ba870', 'Japan': '#386641',
    'United Kingdom': '#4d7c38', 'France': '#5d8c47', 'Germany': '#507a3f', 'Poland': '#558242',
    'Ukraine': '#7a9e5e',
    // Desert / Arid
    'Egypt': '#dcb382', 'Saudi Arabia': '#d4a373', 'Iraq': '#d4a373', 'Iran': '#c29d6f',
    'Algeria': '#e0c092', 'Libya': '#e0c092', 'Australia': '#cca572',
    'Mexico': '#8a7d56',
    // Tropical / Rainforest
    'Brazil': '#1fa233', 'Indonesia': '#2f7532', 'India': '#7da061',
    'Congo': '#1e6b26', 'Dem. Rep. Congo': '#1e6b26', 'Peru': '#3e6b36',
    'Colombia': '#2d6a36',
    // Default fallback tones
    'Argentina': '#759458', 'South Africa': '#8ba665'
};

function getRealColor(name, lat) {
    if (REAL_COLORS[name]) return REAL_COLORS[name];

    // Satellite-like Heuristic based on Latitude
    if (lat !== undefined) {
        const absLat = Math.abs(lat);
        if (absLat > 60) return '#f1f5f9'; // Snow/Ice White
        if (absLat > 50) return '#5c7c55'; // Boreal Dark Green
        if (absLat > 35) return '#658d53'; // Temperate Green
        if (absLat > 23) return '#d4a373'; // Subtropical Desert (Beige)
        if (absLat >= 0) return '#2f7532'; // Tropical Deep Green
    }

    return '#658d53'; // Default Earth Green
}

let state = {
    money: 0,
    ownedCountries: new Set(),
    everOwned: new Set(), // Countries ever owned (for collection)
    countries: {},
    lastTick: Date.now()
};

let map;
let geoJsonLayer;

const moneyDisplay = document.getElementById('money-display');
const cpsDisplay = document.getElementById('cps-display');
const countryList = document.getElementById('country-list');
const logList = document.getElementById('log-list');
const meteorOverlay = document.getElementById('meteor-overlay');

async function initGame() {
    initMap();
    setupZoomControls();
    setupEventListeners();
    await loadCountryData();
    replenishStock();
    startGameLoop();
    scheduleMeteorShower();
    startStockCycle();
    updateUI();
}

function initMap() {
    map = L.map('map', {
        center: [20, 0],
        zoom: 2,
        zoomControl: false, // Cleaner UI for mobile
        minZoom: 2,
        maxZoom: 6,
        attributionControl: false,
        maxBounds: [[-85, -180], [85, 180]],
        maxBoundsViscosity: 0.8, // Slightly lower for smoother edge bounce
        worldCopyJump: false,
        bounceAtZoomLimits: false,
        inertia: true,
        inertiaDeceleration: 3000,
        zoomSnap: 0.1,
        zoomDelta: 0.5
    });
}

function setupZoomControls() {
    const btnIn = document.getElementById('btn-zoom-in');
    const btnOut = document.getElementById('btn-zoom-out');

    // Add checks just in case elements are missing
    if (btnIn && btnOut) {
        btnIn.addEventListener('click', () => {
            if (map) map.zoomIn();
        });
        btnOut.addEventListener('click', () => {
            if (map) map.zoomOut();
        });
        // Stop propagation to prevent map clicks underneath (essential for mobile)
        L.DomEvent.disableClickPropagation(document.getElementById('zoom-controls'));
    }
}

async function loadCountryData() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json');
        const data = await response.json();
        const allCountries = [];
        data.features.forEach(feature => {
            const area = getPolygonArea(feature.geometry);

            // Calculate pseudo centroid for Lat
            let lat = 0;
            if (feature.geometry.type === 'Polygon') lat = feature.geometry.coordinates[0][0][1];
            else if (feature.geometry.type === 'MultiPolygon') lat = feature.geometry.coordinates[0][0][0][1];

            allCountries.push({ feature: feature, area: area, name: feature.properties.name, id: feature.id || feature.properties.name, lat: lat });
        });
        allCountries.sort((a, b) => a.area - b.area);
        const count = allCountries.length;
        allCountries.forEach((c, index) => {
            const percentile = index / count;

            let rarityMode = 'COMMON';

            // Apply Manual Overrides
            if (FIXED_RARITIES[c.name]) {
                rarityMode = FIXED_RARITIES[c.name];
            } else {
                // Size based logic: Larger = Better
                // We strictly map percentile to rarity
                if (percentile < 0.35) rarityMode = 'COMMON';       // Smallest 35%
                else if (percentile < 0.60) rarityMode = 'RARE';    // Next 25%
                else if (percentile < 0.75) rarityMode = 'EPIC';    // Next 15%
                else if (percentile < 0.85) rarityMode = 'LEGENDARY'; // Next 10%
                else if (percentile < 0.93) rarityMode = 'MYTHIC';  // Top 7-15% range
                else if (percentile < 0.97) rarityMode = 'GODLY';   // Top 3-7%
                else if (percentile < 0.99) rarityMode = 'SECRET';  // Top 1-3%
                else rarityMode = 'OG';                             // Top 1% (Biggest giants: Russia, Antarctica...)
            }

            const rarity = RARITIES[rarityMode];
            const sizeMetric = Math.max(1, Math.pow(c.area, 0.6));
            state.countries[c.id] = {
                id: c.id, name: c.name, rarity: rarity,
                baseCost: Math.floor(sizeMetric * CONFIG.baseCost * rarity.multiplier),
                income: Math.floor(sizeMetric * CONFIG.baseIncome * rarity.multiplier),
                feature: c.feature, owned: false, inStock: false,
                realColor: getRealColor(c.name, c.lat)
            };
        });
        geoJsonLayer = L.geoJSON(data, { style: styleFeature, onEachFeature: onEachFeature }).addTo(map);
        renderShop();
    } catch (e) { console.error(e); }
}

// --- Stock Logic ---

let nextStockTime;

function startStockCycle() {
    nextStockTime = Date.now() + CONFIG.stockInterval;
    setInterval(() => {
        replenishStock();
        nextStockTime = Date.now() + CONFIG.stockInterval;
    }, CONFIG.stockInterval);
    setInterval(updateStockTimer, 1000);
}

function updateStockTimer() {
    const now = Date.now();
    const diff = Math.max(0, nextStockTime - now);
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    const elem = document.getElementById('shop-timer');
    if (elem) elem.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function replenishStock() {
    // 1. Reset current stock
    Object.values(state.countries).forEach(c => { if (!c.owned) c.inStock = false; });
    // 2. Filter valid candidates
    const candidates = Object.values(state.countries).filter(c => !c.owned);
    if (candidates.length === 0) return;
    // 3. Shuffle
    candidates.sort(() => Math.random() - 0.5);
    // 4. Select
    let addedCount = 0;
    for (const c of candidates) {
        if (addedCount >= CONFIG.stockAmount) break;
        if (Math.random() * 100 < c.rarity.weight) {
            c.inStock = true;
            addedCount++;
        }
    }
    // Fallback
    if (addedCount === 0 && candidates.length > 0) {
        for (let i = 0; i < Math.min(5, candidates.length); i++) candidates[i].inStock = true;
        addedCount = Math.min(5, candidates.length);
    }
    logEvent(`Nova zaloga: ${addedCount} držav!`, 'good');
    renderShop();
}

// --- Helper Area & Style ---

function getPolygonArea(geometry) {
    if (!geometry) return 0;
    let area = 0;
    let points = [];
    function extractPoints(coords) { return (typeof coords[0][0] === 'number') ? coords : coords[0]; }
    if (geometry.type === 'Polygon') { points = extractPoints(geometry.coordinates); area += ringArea(points); }
    else if (geometry.type === 'MultiPolygon') { geometry.coordinates.forEach(poly => { points = extractPoints(poly); area += ringArea(points); }); }
    return area;
}
function ringArea(points) {
    let area = 0;
    if (points.length > 2) {
        for (let i = 0; i < points.length; i++) {
            let j = (i + 1) % points.length;
            area += points[i][0] * points[j][1];
            area -= points[j][0] * points[i][1];
        }
    }
    return Math.abs(area / 2);
}

function styleFeature(feature) {
    const country = state.countries[feature.id || feature.properties.name];
    if (country && country.owned) return { fillColor: country.realColor, weight: 1, opacity: 1, color: 'white', fillOpacity: 0.9 };
    return { fillColor: '#334155', weight: 1, opacity: 1, color: '#475569', fillOpacity: 0.5 };
}

function onEachFeature(feature, layer) {
    layer.on({
        click: () => {
            const c = state.countries[feature.id || feature.properties.name];
            if (!c.owned && c.inStock && state.money >= c.baseCost) buyCountry(c.id);
        }
    });
}

// --- Game Logic ---

function setupEventListeners() {
    // Click button
    const clickBtn = document.getElementById('click-btn');
    if (clickBtn) {
        clickBtn.addEventListener('click', () => { addMoney(10); });
        // Add minimal animation
        clickBtn.addEventListener('mousedown', () => clickBtn.style.transform = 'scale(0.95)');
        clickBtn.addEventListener('mouseup', () => clickBtn.style.transform = 'scale(1)');
    }


    // Tabs
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Deactivate all
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

            // Activate current
            tab.classList.add('active');
            const targetId = `tab-${tab.dataset.tab}`;
            const targetContent = document.getElementById(targetId);
            if (targetContent) targetContent.classList.remove('hidden');

            if (tab.dataset.tab === 'collection') {
                renderCollectionList();
            }
        });
    });
}

function addMoney(amount) {
    state.money += amount;
    updateUI();
}

function buyCountry(id) {
    const country = state.countries[id];
    if (state.money >= country.baseCost && !country.owned && country.inStock) {
        state.money -= country.baseCost;
        country.owned = true;
        country.inStock = false;
        state.ownedCountries.add(id);
        state.everOwned.add(id); // Permanent unlock in collection
        geoJsonLayer.resetStyle();
        renderShop();
        renderCollection();
        updateUI();
        logEvent(`Kupljeno: ${country.name}`, 'good');
    }
}

function startGameLoop() {
    setInterval(() => {
        let income = 0;
        state.ownedCountries.forEach(id => income += state.countries[id].income);
        if (income > 0) addMoney(income);
        cpsDisplay.textContent = `${formatMoney(income)}/s`;
    }, 1000);
}

// --- Meteor Shower Logic ---

let nextMeteorTime;
// meteorStage removed, single cycle

function scheduleMeteorShower() {
    startMeteorTimer();
    setInterval(updateMeteorTimer, 1000);
}

function startMeteorTimer() {
    // Schedule the end of the current cycle
    nextMeteorTime = Date.now() + CONFIG.meteorIntervalMin;
    setTimeout(handleMeteorCycleEnd, CONFIG.meteorIntervalMin);
}

function handleMeteorCycleEnd() {
    triggerMeteorShower();
}

function updateMeteorTimer() {
    const elem = document.getElementById('meteor-timer');
    if (!elem) return;

    if (meteorOverlay.classList.contains('active')) {
        elem.textContent = "V TEKU";
        elem.style.color = "var(--rarity-mythic)";
        elem.classList.add('blink');
        return;
    }

    const now = Date.now();
    const diff = Math.max(0, nextMeteorTime - now);
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    elem.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    elem.style.color = "var(--rarity-mythic)"; // Always red

    // Blink in last 10 seconds only
    if (diff < 10000 && diff > 0) {
        elem.classList.add('blink');
    } else {
        elem.classList.remove('blink');
    }
}

function triggerMeteorShower() {
    meteorOverlay.classList.add('active');
    logEvent("METEORSKI DEŽ SE JE ZAČEL!", "bad");

    setTimeout(() => {
        meteorOverlay.classList.remove('active');
        processMeteorHits();
        logEvent("Meteorski dež se je končal.", "neutral");

        // Start new cycle
        startMeteorTimer();
    }, 5000);
}

function processMeteorHits() {
    let hitCount = 0;
    state.ownedCountries.forEach(id => {
        if (Math.random() < CONFIG.meteorChance) {
            const country = state.countries[id];
            country.owned = false;
            // Return to pool (will appear randomly in future stocks)
            country.inStock = false;
            state.ownedCountries.delete(id);
            logEvent(`Meteor je uničil ${country.name}!`, 'bad');
            hitCount++;
        }
    });

    if (hitCount > 0) {
        geoJsonLayer.resetStyle();
        renderShop();
        renderCollection();
        updateUI();
    }
}

function updateUI() {
    moneyDisplay.innerText = formatMoney(state.money);
    updateShopState();
}

function updateShopState() {
    const items = countryList.children;
    for (let item of items) {
        // Skip basic structural checks, just assume simple layout
        const costVal = parseInt(item.dataset.cost || 0);
        if (costVal > 0) {
            const can = state.money >= costVal;
            if (can) { item.classList.remove('disabled'); if (item.querySelector('.cost')) item.querySelector('.cost').style.color = '#fff'; }
            else { item.classList.add('disabled'); if (item.querySelector('.cost')) item.querySelector('.cost').style.color = '#ef4444'; }
        }
    }
}

function renderShop() {
    countryList.innerHTML = '';
    const sorted = Object.values(state.countries).sort((a, b) => {
        // Sort by Rarity Rank, then Cost
        if (a.rarity.rank !== b.rarity.rank) return a.rarity.rank - b.rarity.rank;
        return a.baseCost - b.baseCost;
    });

    sorted.forEach(c => {
        if (!c.inStock) return;
        const item = document.createElement('div');
        item.className = `country-item rarity-${c.rarity.id} ${c.owned ? 'owned' : ''}`;

        let right = '';
        if (c.owned) {
            right = `<span class="income" style="font-size:1.1em">+${formatMoney(c.income)}/s</span>`;
        } else {
            item.dataset.cost = c.baseCost;
            const canAfford = state.money >= c.baseCost;
            if (!canAfford) item.classList.add('disabled');
            item.onclick = () => { if (state.money >= c.baseCost) buyCountry(c.id); };
            right = `<div class="item-right"><div class="cost" style="color:${canAfford ? '#fff' : '#ef4444'}">${formatMoney(c.baseCost)}</div><div class="income">+${formatMoney(c.income)}/s</div></div>`;
        }
        item.innerHTML = `<div class="item-left"><span class="country-name">${c.name}</span><span class="country-rarity rarity-${c.rarity.id}"><span class="rarity-label-text">${c.rarity.name}</span></span></div>${right}`;
        countryList.appendChild(item);
    });
}

function renderCollection() {
    // Optional: If you want to update collection in real time even if hidden
    if (!document.getElementById('tab-collection').classList.contains('hidden')) {
        renderCollectionList();
    }
}

function renderCollectionList() {
    const grid = document.getElementById('collection-sidebar-list');
    if (!grid) return;
    grid.innerHTML = '';
    const all = Object.values(state.countries).sort((a, b) => a.rarity.rank - b.rarity.rank);

    const totalCount = all.length;
    const ownedCount = state.everOwned.size;
    const counterElem = document.getElementById('collection-counter');
    if (counterElem) counterElem.textContent = `${ownedCount} / ${totalCount}`;

    all.forEach(c => {
        const isEverOwned = state.everOwned.has(c.id);
        const card = document.createElement('div');
        card.className = `country-item collection-item rarity-${c.rarity.id} ${isEverOwned ? 'owned' : 'locked'}`;

        let content = '';
        if (isEverOwned) {
            content = `
                <div class="item-left">
                    <span class="country-name">${c.name}</span>
                    <span class="country-rarity rarity-${c.rarity.id}"><span class="rarity-label-text">${c.rarity.name}</span></span>
                </div>
                <div class="item-right">
                    <div class="income">+${formatMoney(c.income)}/s</div>
                    ${!c.owned ? '<div style="font-size:0.75rem; color:var(--rarity-mythic); font-weight:800; margin-top:2px;">(UNIČENO)</div>' : ''}
                </div>
            `;
        } else {
            content = `
                <div class="item-left">
                    <span class="country-name" style="opacity:0.5">???</span>
                    <span class="country-rarity rarity-common" style="filter:grayscale(1); opacity:0.3;"><span class="rarity-label-text">ZAKLENJENO</span></span>
                </div>
                <div class="item-right">
                    <div style="opacity:0.2">?? €/s</div>
                </div>
            `;
        }
        card.innerHTML = content;
        grid.appendChild(card);
    });
}

function logEvent(msg, type = 'neutral') {
    const li = document.createElement('li');
    li.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    if (type !== 'neutral') li.classList.add(type);
    logList.prepend(li);
    if (logList.children.length > 20) logList.lastChild.remove();
}
function formatMoney(n) { return n.toLocaleString('sl-SI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }); }

initGame();
