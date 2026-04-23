/**
 * Draw Road Network
 */
id = Math.random().toString(36).substring(2, 15);

BACKGROUND_COLOR = 0xe8ebed;
LANE_COLOR = 0x586970;
LANE_BORDER_WIDTH = 1;
LANE_BORDER_COLOR = 0x82a8ba;
LANE_INNER_COLOR = 0xbed8e8;
LANE_DASH = 10;
LANE_GAP = 12;
TRAFFIC_LIGHT_WIDTH = 5;
MAX_TRAFFIC_LIGHT_NUM = 100000;
ROTATE = 90;

CAR_LENGTH = 5;
CAR_WIDTH = 2;
CAR_COLOR = 0xe8bed4;

CAR_COLORS = [0xf2bfd7, // pink
            0xb7ebe4,   // cyan
            0xdbebb7,   // blue
            0xf5ddb5, 
            0xd4b5f5];
CAR_COLORS_NUM = CAR_COLORS.length;

NUM_CAR_POOL = 150000;

LIGHT_RED = 0xdb635e;
LIGHT_GREEN = 0x85ee00;

TURN_SIGNAL_COLOR = 0xFFFFFF;
TURN_SIGNAL_WIDTH   = 1;
TURN_SIGNAL_LENGTH  = 5;

var simulation, roadnet, steps;
var nodes = {};
var edges = {};
var logs;
var gettingLog = false;
var hasReplayData = false;

let Application = PIXI.Application,
    Sprite = PIXI.Sprite,
    Graphics = PIXI.Graphics,
    Container = PIXI.Container,
    ParticleContainer = PIXI.particles.ParticleContainer,
    Texture = PIXI.Texture,
    Rectangle = PIXI.Rectangle
;

var controls = new function () {
    this.replaySpeedMax = 1;
    this.replaySpeedMin = 0.01;
    this.replaySpeed = 0.28;
    this.paused = false;
};

var trafficLightsG = {};

var app, viewport, renderer, simulatorContainer, carContainer, trafficLightContainer;
var turnSignalContainer;
var carPool;

var cnt = 0;
var frameElapsed = 0;
var totalStep;

var nodeCarNum = document.getElementById("car-num");
var nodeProgressPercentage = document.getElementById("progress-percentage");
var nodeTotalStep = document.getElementById("total-step-num");
var nodeCurrentStep = document.getElementById("current-step-num");
var nodeSelectedEntity = document.getElementById("selected-entity");
var detectorTable = document.getElementById("detector-table");
var signalTable = document.getElementById("signal-table");
var metadataPreview = document.getElementById("metadata-preview");
var groundtruthList = document.getElementById("groundtruth-list");
var cctvStream = document.getElementById("cctv-stream");
var cctvVideo = document.getElementById("cctv-video");
var cctvOverlayCanvas = document.getElementById("cctv-overlay-canvas");
var cctvStatus = document.getElementById("cctv-status");
var cctvLink = document.getElementById("cctv-link");
var realMapFrame = document.getElementById("realmap-frame");
var mapTrafficCard = document.getElementById("map-traffic-card");
var mapTrafficKpi = document.getElementById("map-traffic-kpi");
var simProgressBadge = document.getElementById("sim-progress");
var mainShell = document.querySelector(".shell");
var smartTrafficApp = document.getElementById("smart-traffic-app");
var smartPageTitle = document.getElementById("smart-page-title");
var smartPageSub = document.getElementById("smart-page-sub");
var smartBackButton = document.getElementById("smart-back-btn");
var smartNavItems = Array.from(document.querySelectorAll(".smart-nav-item"));
var smartViews = Array.from(document.querySelectorAll(".smart-view"));
var smartThemeButtons = Array.from(document.querySelectorAll(".smart-theme-btn"));
var smartMetricRefs = {
    totalVehicles: document.getElementById("smart-total-vehicles"),
    congestionIndex: document.getElementById("smart-congestion-index"),
    peakBanner: document.getElementById("smart-peak-banner"),
    efficiency: document.getElementById("smart-efficiency"),
    currentFlow: document.getElementById("smart-current-flow"),
    waitTime: document.getElementById("smart-wait-time"),
    decisionSpeed: document.getElementById("smart-decision-speed"),
    responseTime: document.getElementById("smart-response-time"),
    health: document.getElementById("smart-health"),
    weatherTemp: document.getElementById("smart-weather-temp"),
    monitorVehicles: document.getElementById("smart-monitor-vehicles"),
    monitorWait: document.getElementById("smart-monitor-wait"),
    monitorEfficiency: document.getElementById("smart-monitor-efficiency"),
    analyticsVolume: document.getElementById("smart-analytics-volume"),
    analyticsCongestion: document.getElementById("smart-analytics-congestion"),
    statusCpu: document.getElementById("smart-status-cpu"),
    statusMemory: document.getElementById("smart-status-memory"),
    statusNetwork: document.getElementById("smart-status-network"),
    timingNS: document.getElementById("smart-timing-ns"),
    timingEW: document.getElementById("smart-timing-ew"),
    signalNorth: document.getElementById("smart-signal-north"),
    signalSouth: document.getElementById("smart-signal-south"),
    signalEast: document.getElementById("smart-signal-east"),
    signalWest: document.getElementById("smart-signal-west"),
    barNS: document.getElementById("smart-bar-ns"),
    barEW: document.getElementById("smart-bar-ew"),
    vehicleBreakdown: document.getElementById("smart-vehicle-breakdown"),
    visibility: document.getElementById("smart-visibility"),
    weatherText: document.getElementById("smart-weather-text"),
    temperature: document.getElementById("smart-temperature"),
    wind: document.getElementById("smart-wind")
};

var SPEED = 3, SCALE_SPEED = 1.01;
var LEFT = 37, UP = 38, RIGHT = 39, DOWN = 40;
var MINUS = 189, EQUAL = 187, P = 80;
var LEFT_BRACKET = 219, RIGHT_BRACKET = 221; 
var ONE = 49, TWO = 50;
var SPACE = 32;

var keyDown = new Set();

var turnSignalTextures = [];

let pauseButton = document.getElementById("pause");
let nodeCanvas = document.getElementById("simulator-canvas");
let replayControlDom = document.getElementById("replay-control");
let replaySpeedDom = document.getElementById("replay-speed");

let loading = false;
let infoDOM = document.getElementById("info");
let selectedDOM = document.getElementById("selected-entity");

function infoAppend(msg) {
    infoDOM.innerText += "- " + msg + "\n";
}

function infoReset() {
    infoDOM.innerText = "";
}

/**
 * Upload files
 */
let ready = false;

let roadnetData = [];
let replayData = [];
let chartData = [];
let activeMapMode = "simulation";
let cctvDetectionFrames = new Map();
let cctvDetectionAnimation = null;
let cctvStatsPollTimer = null;
let cctvStatsFailureCount = 0;
let smartTrafficMetricsTimer = null;
let liveCameraStats = {};
let liveDetectorHistory = [];
let cctvDetectionState = {
    fps: 10,
    sourceWidth: 1280,
    sourceHeight: 720,
    sourceName: "sense05.mov",
    loaded: false
};
let mapTrafficChart = null;
let mapTrafficSeries = { labels: [], values: [], cursor: 0, timer: null, windowSize: 8 };
let liveTrafficSeries = [];
let liveIncidentState = {
    online: false,
    total: 0,
    highestConfidence: 0,
    activeEvents: []
};
let incidentHealthState = null;
let smartTrafficState = {
    initialized: false,
    currentView: "monitoring",
    theme: "light",
    metrics: {
        totalVehicles: 1247,
        congestionIndex: 0.12,
        currentFlow: 609,
        waitMinutes: 3.2,
        efficiency: 85.1,
        decisionSpeed: 151,
        health: 98.4,
        peakBannerText: "Next peak prediction: 17:15 (High volume expected)",
        cpu: 27,
        memory: 85,
        network: 0,
        timingNS: 4,
        timingEW: 4,
        signalNorth: 4,
        signalSouth: 4,
        signalEast: 4,
        signalWest: 3,
        barNS: 32,
        barEW: 28,
        weatherText: "Sunny",
        weatherTemp: 31.0,
        wind: 0.0,
        visibility: 0.0,
        vehicleBreakdown: {
            Cars: 156,
            Trucks: 23,
            Buses: 8,
            Motorcycles: 12
        }
    }
};

window.addEventListener("incident-summary", function(event) {
    const detail = event.detail || {};
    liveIncidentState.online = !!detail.online;
    liveIncidentState.total = Number(detail.total) || 0;
    liveIncidentState.highestConfidence = Number(detail.highestConfidence) || 0;
    liveIncidentState.activeEvents = Array.isArray(detail.activeEvents) ? detail.activeEvents : [];
    renderSmartTrafficMetrics();
});

window.addEventListener("incident-health", function(event) {
    incidentHealthState = event.detail || null;
    renderSmartTrafficMetrics();
});

const GOOGLE_MAP_URL = "https://www.google.com/maps/embed?pb=!1m28!1m12!1m3!1d1279.8671332617787!2d35.88637445138584!3d31.96695723296919!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!4m13!3e6!4m5!1s0x151ca05b4ebccd5d%3A0x726d6db1e88866ef!2sWadi%20Saqra%20Int.%2C%20Amman!3m2!1d31.9666926!2d35.8870141!4m5!1s0x151ca05b4ebccd5d%3A0x726d6db1e88866ef!2sWadi%20Saqra%20Int.%2C%20Amman!3m2!1d31.9666926!2d35.8870141!5e1!3m2!1sen!2sjo!4v1776713852283!5m2!1sen!2sjo";
const DETECTION_COLORS = {
    0: "#f87171",
    1: "#34d399",
    2: "#3ecfff",
    3: "#a78bfa",
    4: "#f59e0b",
    5: "#22d97a",
    6: "#f97316",
    7: "#fbbf24"
};
const DETECTION_LABELS = {
    0: "Person",
    1: "Bicycle",
    2: "Car",
    3: "Motorbike",
    4: "Van",
    5: "Bus",
    6: "Train",
    7: "Truck"
};
const JUNCTION_CAM_CONFIG = {
    north: { port: "8011", source: "sense01.mov", cameraId: "CAM-01 NORTH", fallbackVideo: "sense01.mov", annotationSource: "sense01.mov" },
    south: { port: "8012", source: "sense02.mov", cameraId: "CAM-02 SOUTH", fallbackVideo: "sense02.mov", annotationSource: "sense02.mov" },
    east:  { port: "8013", source: "sense03.mov", cameraId: "CAM-03 EAST",  fallbackVideo: "sense01.mov", annotationSource: "sense01.mov" },
    west:  { port: "8014", source: "sense04.mov", cameraId: "CAM-04 WEST",  fallbackVideo: "sense02.mov", annotationSource: "sense02.mov" }
};
// Each camera clock ticks at a slightly different interval (ms) so they show different times
const JUNCTION_CAM_CLOCK_OFFSETS = { north: 0, south: 7000, east: 23000, west: 41000 };
const junctionCamVideos = Array.from(document.querySelectorAll(".junction-cam-video"));
const junctionCamStats = Array.from(document.querySelectorAll("[data-cam-stats]"));
const junctionOverlayCanvases = Array.from(document.querySelectorAll("[data-cam-overlay]"));
let junctionStatsPollTimer = null;
let junctionStatsDisabled = new Set();
let junctionStatsFailureCount = {};
let junctionDetectionAnimation = null;
let junctionDetectionFrames = {
    north: new Map(),
    south: new Map(),
    east: new Map(),
    west: new Map()
};

function formatCamTime(cam) {
    const d = new Date(Date.now() + (JUNCTION_CAM_CLOCK_OFFSETS[cam] || 0));
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function tickCamTimestamps() {
    ["north", "south", "east", "west"].forEach(function(cam) {
        var t = formatCamTime(cam);
        var el = document.getElementById("cam-time-" + cam);
        if (el) el.textContent = t;
        var smart = document.getElementById("smart-cam-ts-" + cam);
        if (smart) smart.textContent = t;
    });
}
tickCamTimestamps();
setInterval(tickCamTimestamps, 1000);

function showSimulationView() {
    activeMapMode = "simulation";
    if (realMapFrame) {
        realMapFrame.classList.add("d-none");
    }
    if (mapTrafficCard) {
        mapTrafficCard.classList.add("d-none");
    }
    stopMapTrafficAnimation();
    if (nodeCanvas) {
        nodeCanvas.classList.remove("d-none");
    }
}

function showGoogleMapView() {
    activeMapMode = "google-map";
    if (realMapFrame) {
        realMapFrame.src = GOOGLE_MAP_URL;
        realMapFrame.classList.remove("d-none");
    }
    if (mapTrafficCard) {
        mapTrafficCard.classList.remove("d-none");
    }
    if (liveTrafficSeries.length) {
        rebuildMapTrafficFromLiveSeries();
    }
    startMapTrafficAnimation();
    if (nodeCanvas) {
        nodeCanvas.classList.add("d-none");
    }
}

function buildJunctionBaseUrl(cam) {
    var config = JUNCTION_CAM_CONFIG[cam];
    if (!config) {
        return "";
    }
    var host = window.location.hostname || "127.0.0.1";
    return "http://" + host + ":" + config.port;
}

function buildJunctionFallbackCandidates(cam) {
    var config = JUNCTION_CAM_CONFIG[cam];
    if (!config) {
        return [];
    }

    var candidates = ["testdata/demo_cctv.mp4"];
    [config.fallbackVideo, config.source].forEach(function(candidate) {
        if (!candidate) {
            return;
        }
        candidates.push("testdata/" + candidate);
        if (candidate.endsWith(".mov")) {
            candidates.push("testdata/" + candidate.replace(/\.mov$/i, ".mp4"));
        }
    });

    var seen = new Set();
    return candidates.filter(function(url) {
        if (!url || seen.has(url)) {
            return false;
        }
        seen.add(url);
        return true;
    });
}

function loadMediaCandidate(node, url) {
    return new Promise(function(resolve, reject) {
        if (!node) {
            reject(new Error("No media node"));
            return;
        }

        let settled = false;

        function cleanup() {
            node.removeEventListener("loadeddata", onLoaded);
            node.removeEventListener("load", onLoaded);
            node.removeEventListener("error", onError);
        }

        function onLoaded() {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(url);
        }

        function onError() {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error("Media unavailable"));
        }

        node.addEventListener("loadeddata", onLoaded, { once: true });
        node.addEventListener("load", onLoaded, { once: true });
        node.addEventListener("error", onError, { once: true });
        node.src = url;
        if (typeof node.load === "function") {
            node.load();
        }
    });
}

async function mountJunctionFallbackVideo(imgNode, cam, tile) {
    var candidates = buildJunctionFallbackCandidates(cam);
    if (!imgNode || !imgNode.parentNode || !candidates.length) {
        return false;
    }

    var videoNode = document.createElement("video");
    videoNode.className = imgNode.className;
    videoNode.dataset.cam = cam;
    videoNode.alt = imgNode.alt;
    videoNode.muted = true;
    videoNode.autoplay = true;
    videoNode.loop = true;
    videoNode.playsInline = true;
    videoNode.preload = "auto";

    for (const candidate of candidates) {
        try {
            await loadMediaCandidate(videoNode, candidate);
            imgNode.replaceWith(videoNode);
            videoNode.play().catch(function() {});
            if (tile) tile.classList.remove("is-offline");
            return true;
        } catch (error) {
            continue;
        }
    }

    if (tile) tile.classList.add("is-offline");
    return false;
}

function initJunctionCameraStreams() {
    junctionCamVideos.forEach(function(video) {
        if (!video) return;
        var cam = video.dataset.cam;
        var tile = video.closest(".junction-cam");
        var baseUrl = buildJunctionBaseUrl(cam);
        if (!baseUrl) return;

        video.addEventListener("load", function() {
            if (tile) tile.classList.remove("is-offline");
        });
        video.addEventListener("error", function() {
            mountJunctionFallbackVideo(video, cam, tile);
        });

        video.src = baseUrl + "/video_feed";
        video.dataset.src = video.src;

        // Mirror to smart dashboard cam tiles
        var smartImg = document.getElementById("smart-cam-img-" + cam);
        if (smartImg) smartImg.src = baseUrl + "/video_feed";
    });
}
initJunctionCameraStreams();

function getJunctionMediaNode(cam) {
    return document.querySelector('.junction-cam-video[data-cam="' + cam + '"]');
}

function getJunctionOverlayCanvas(cam) {
    return document.querySelector('[data-cam-overlay="' + cam + '"]');
}

function buildJunctionDetectionSources(cam) {
    var config = JUNCTION_CAM_CONFIG[cam];
    var preferred = config && (config.annotationSource || config.fallbackVideo || config.source);
    var seen = new Set();
    return [
        preferred,
        config && config.source,
        "sense02.mov",
        "sense01.mov"
    ].filter(function(item) {
        if (!item || seen.has(item)) {
            return false;
        }
        seen.add(item);
        return true;
    });
}

async function loadJunctionDetections(cam) {
    var sourceCandidates = buildJunctionDetectionSources(cam);
    var urls = [];

    sourceCandidates.forEach(function(candidate) {
        var baseName = candidate.replace(/\.[^.]+$/, "");
        urls.push("testdata/" + baseName + "_tracklab_vehicle.json");
        urls.push("sandbox_data/annotations/" + baseName + "_tracklab_vehicle.json");
    });

    for (const url of urls) {
        try {
            const response = await fetch(url + "?_=" + Date.now());
            if (!response.ok) {
                continue;
            }
            const payload = await response.json();
            junctionDetectionFrames[cam] = buildDetectionFrameMap(payload);
            return true;
        } catch (error) {
            continue;
        }
    }

    junctionDetectionFrames[cam] = new Map();
    return false;
}

function updateJunctionFrameStats(cam, items) {
    var counts = { total: 0, car: 0, bus: 0, truck: 0 };
    (items || []).forEach(function(item) {
        counts.total += 1;
        if (item.category_id === 2) counts.car += 1;
        if (item.category_id === 5) counts.bus += 1;
        if (item.category_id === 7) counts.truck += 1;
    });

    var statNode = junctionCamStats.find(function(item) {
        return item.dataset.camStats === cam;
    });
    if (statNode) {
        statNode.innerHTML = [
            "<span>Total " + counts.total + "</span>",
            "<span>Cars " + counts.car + "</span>",
            "<span>Bus " + counts.bus + "</span>",
            "<span>Truck " + counts.truck + "</span>"
        ].join("");
    }

    var dashRow = document.getElementById("dash-stats-" + cam);
    if (dashRow && junctionStatsDisabled.has(cam)) {
        dashRow.innerHTML = [
            "<span>Total " + counts.total + "</span>",
            "<span>Cars " + counts.car + "</span>",
            "<span>Bus " + counts.bus + "</span>",
            "<span>Truck " + counts.truck + "</span>"
        ].join("");
    }
}

function drawJunctionDetections() {
    Object.keys(JUNCTION_CAM_CONFIG).forEach(function(cam) {
        var mediaNode = getJunctionMediaNode(cam);
        var overlayCanvas = getJunctionOverlayCanvas(cam);
        var frameMap = junctionDetectionFrames[cam];
        if (
            !overlayCanvas ||
            !frameMap ||
            frameMap.size === 0 ||
            !mediaNode ||
            mediaNode.tagName !== "VIDEO"
        ) {
            clearOverlayCanvas(overlayCanvas);
            return;
        }

        var frameIndex = 0;
        if (mediaNode && typeof mediaNode.currentTime === "number" && !Number.isNaN(mediaNode.currentTime)) {
            frameIndex = Math.max(0, Math.floor(mediaNode.currentTime * cctvDetectionState.fps));
        }

        var items = frameMap.get(frameIndex) || frameMap.get(0) || [];
        drawDetectionBoxes(
            overlayCanvas,
            items,
            cctvDetectionState.sourceWidth,
            cctvDetectionState.sourceHeight
        );
        updateJunctionFrameStats(cam, items);
    });

    junctionDetectionAnimation = requestAnimationFrame(drawJunctionDetections);
}

function ensureJunctionDetectionLoop() {
    if (junctionDetectionAnimation !== null) {
        return;
    }
    junctionDetectionAnimation = requestAnimationFrame(drawJunctionDetections);
}

Promise.all(Object.keys(JUNCTION_CAM_CONFIG).map(loadJunctionDetections)).finally(ensureJunctionDetectionLoop);

function updateJunctionStatsCard(cam, payload) {
    // 1. Update the camera-grid dashboard strip (main page)
    var dashRow = document.getElementById("dash-stats-" + cam);
    if (dashRow && payload && payload.counts) {
        var counts = payload.counts;
        var cells = [
            "<span>Total " + (counts.total ?? 0) + "</span>",
            "<span>Cars " + (counts.car ?? 0) + "</span>",
            "<span>Bus " + (counts.bus ?? 0) + "</span>",
            "<span>Truck " + (counts.truck ?? 0) + "</span>"
        ].join("");
        dashRow.innerHTML = cells;
    }
    // 2. Mirror into the Smart Traffic Dashboard monitoring view
    var smartRow = document.getElementById("smart-det-" + cam);
    if (smartRow && payload && payload.counts) {
        var c = payload.counts;
        smartRow.innerHTML = [
            "<span>Total " + (c.total ?? 0) + "</span>",
            "<span>Cars " + (c.car ?? 0) + "</span>",
            "<span>Bus " + (c.bus ?? 0) + "</span>",
            "<span>Truck " + (c.truck ?? 0) + "</span>"
        ].join("");
        // Also update aggregate smart-monitor-vehicles
        var totalAll = ["north","south","east","west"].reduce(function(sum, k) {
            var el = document.getElementById("smart-det-" + k);
            if (!el) return sum;
            var span = el.querySelector("span");
            if (!span) return sum;
            var val = parseInt(span.textContent.replace("Total ", "")) || 0;
            return sum + val;
        }, 0);
        if (smartMetricRefs.monitorVehicles) smartMetricRefs.monitorVehicles.textContent = totalAll.toLocaleString("en-GB");
    }
    // 3. Mirror stream src into smart dashboard camera tiles
    var smartImg = document.getElementById("smart-cam-img-" + cam);
    var baseUrl = buildJunctionBaseUrl(cam);
    if (smartImg && baseUrl && !smartImg.src.includes("/video_feed")) {
        smartImg.src = baseUrl + "/video_feed";
    }
    // 4. Keep legacy in-video stat nodes updated (kept for compat)
    var node = junctionCamStats.find(function(item) {
        return item.dataset.camStats === cam;
    });
    if (!node || !payload || !payload.counts) {
        return;
    }
    var counts = payload.counts;
    node.innerHTML = [
        "<span>Total " + (counts.total ?? 0) + "</span>",
        "<span>Cars " + (counts.car ?? 0) + "</span>",
        "<span>Bus " + (counts.bus ?? 0) + "</span>",
        "<span>Truck " + (counts.truck ?? 0) + "</span>"
    ].join("");
}

async function fetchJunctionStats(cam) {
    if (junctionStatsDisabled.has(cam)) {
        return;
    }
    var baseUrl = buildJunctionBaseUrl(cam);
    if (!baseUrl) {
        return;
    }
    try {
        var response = await fetch(baseUrl + "/stats?_=" + Date.now());
        if (!response.ok) {
            throw new Error("Stats unavailable");
        }
        var payload = await response.json();
        liveCameraStats[cam] = payload;
        junctionStatsFailureCount[cam] = 0;
        updateJunctionStatsCard(cam, payload);
        updateSmartTrafficFromVideoStats();
        recordLiveDetectorSnapshot();
    } catch (error) {
        var tile = junctionCamVideos.find(function(item) {
            return item.dataset.cam === cam;
        });
        if (tile && tile.closest(".junction-cam")) {
            tile.closest(".junction-cam").classList.add("is-offline");
        }
        junctionStatsFailureCount[cam] = (junctionStatsFailureCount[cam] || 0) + 1;
        if (junctionStatsFailureCount[cam] >= 2) {
            junctionStatsDisabled.add(cam);
        }
    }
}

function startJunctionStatsPolling() {
    if (junctionStatsPollTimer !== null) {
        window.clearInterval(junctionStatsPollTimer);
    }
    Object.keys(JUNCTION_CAM_CONFIG).forEach(fetchJunctionStats);
    junctionStatsPollTimer = window.setInterval(function() {
        Object.keys(JUNCTION_CAM_CONFIG).forEach(fetchJunctionStats);
    }, 1000);
}
startJunctionStatsPolling();

function clearCctvOverlay() {
    if (!cctvOverlayCanvas) {
        return;
    }
    const context = cctvOverlayCanvas.getContext("2d");
    context.clearRect(0, 0, cctvOverlayCanvas.width, cctvOverlayCanvas.height);
}

function clearOverlayCanvas(canvas) {
    if (!canvas) {
        return;
    }
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
}

function resizeCctvOverlay() {
    if (!cctvOverlayCanvas) {
        return;
    }
    const rect = cctvOverlayCanvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (cctvOverlayCanvas.width !== width || cctvOverlayCanvas.height !== height) {
        cctvOverlayCanvas.width = width;
        cctvOverlayCanvas.height = height;
    }
}

function resizeOverlayCanvas(canvas) {
    if (!canvas) {
        return;
    }
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
}

function buildDetectionFrameMap(payload) {
    const frameMap = new Map();
    const annotations = payload && Array.isArray(payload.annotations) ? payload.annotations : [];
    annotations.forEach(function(item) {
        if (!item || typeof item.image_id !== "number" || !Array.isArray(item.bbox) || item.bbox.length < 4) {
            return;
        }
        if ((item.score ?? 0) < 0.18) {
            return;
        }
        if (!frameMap.has(item.image_id)) {
            frameMap.set(item.image_id, []);
        }
        frameMap.get(item.image_id).push(item);
    });
    return frameMap;
}

function normaliseDetectionPayload(payload) {
    cctvDetectionFrames = buildDetectionFrameMap(payload);
    cctvDetectionState.loaded = cctvDetectionFrames.size > 0;
}

function drawDetectionBoxes(canvas, frameItems, sourceWidth, sourceHeight) {
    if (!canvas) {
        return;
    }

    resizeOverlayCanvas(canvas);
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const sx = width / sourceWidth;
    const sy = height / sourceHeight;

    context.clearRect(0, 0, width, height);
    context.lineWidth = 2;
    context.font = "12px JetBrains Mono";
    context.textBaseline = "top";

    (frameItems || []).forEach(function(item) {
        const bbox = item.bbox;
        const x = bbox[0] * sx;
        const y = bbox[1] * sy;
        const w = bbox[2] * sx;
        const h = bbox[3] * sy;
        const color = DETECTION_COLORS[item.category_id] || "#ff8a65";
        const labelName = DETECTION_LABELS[item.category_id] || ("Class " + item.category_id);
        const confidence = Math.round((item.score ?? 0) * 100);
        const label = labelName + " " + confidence + "%";

        context.strokeStyle = color;
        context.fillStyle = color;
        context.strokeRect(x, y, w, h);

        const textWidth = context.measureText(label).width;
        context.fillRect(x, Math.max(0, y - 20), textWidth + 12, 18);
        context.fillStyle = "#031018";
        context.fillText(label, x + 6, Math.max(0, y - 18));
    });
}

function buildCctvFallbackSources(sourceVideo) {
    var seen = new Set();
    return [
        sourceVideo,
        cctvDetectionState.sourceName,
        "sense02.mov",
        "sense01.mov"
    ].filter(function(item) {
        if (!item || seen.has(item)) {
            return false;
        }
        seen.add(item);
        return true;
    });
}

async function loadCctvDetections(sourceVideo) {
    const sourceCandidates = buildCctvFallbackSources(sourceVideo);
    const urls = [];

    sourceCandidates.forEach(function(candidate) {
        const baseName = candidate.replace(/\.[^.]+$/, "");
        urls.push("testdata/" + baseName + "_tracklab_vehicle.json");
        urls.push("sandbox_data/annotations/" + baseName + "_tracklab_vehicle.json");
    });

    for (const url of urls) {
        try {
            const response = await fetch(url + "?_=" + Date.now());
            if (!response.ok) {
                continue;
            }
            const payload = await response.json();
            normaliseDetectionPayload(payload);
            infoAppend("YOLO detections loaded from " + url);
            return;
        } catch (error) {
            continue;
        }
    }

    cctvDetectionState.loaded = false;
    infoAppend("YOLO detections unavailable for " + (sourceVideo || cctvDetectionState.sourceName));
}

function drawCctvDetectionsForFrame(frameIndex) {
    if (!cctvOverlayCanvas || !cctvDetectionState.loaded) {
        clearCctvOverlay();
        return;
    }
    const items = cctvDetectionFrames.get(frameIndex) || [];
    drawDetectionBoxes(
        cctvOverlayCanvas,
        items,
        cctvDetectionState.sourceWidth,
        cctvDetectionState.sourceHeight
    );
}

function tickCctvDetections() {
    if (!cctvVideo || cctvVideo.classList.contains("is-hidden")) {
        clearCctvOverlay();
        cctvDetectionAnimation = requestAnimationFrame(tickCctvDetections);
        return;
    }

    const frameIndex = Math.max(0, Math.floor(cctvVideo.currentTime * cctvDetectionState.fps));
    drawCctvDetectionsForFrame(frameIndex);
    cctvDetectionAnimation = requestAnimationFrame(tickCctvDetections);
}

function ensureCctvDetectionLoop() {
    if (cctvDetectionAnimation !== null) {
        return;
    }
    cctvDetectionAnimation = requestAnimationFrame(tickCctvDetections);
}

window.addEventListener("resize", resizeCctvOverlay);

function setCctvMode(mode) {
    if (!cctvStream || !cctvVideo) {
        return;
    }

    cctvStream.classList.toggle("is-hidden", mode !== "stream");
    cctvVideo.classList.toggle("is-hidden", mode !== "video");
}

function loadVideoCandidate(url) {
    if (!cctvVideo) {
        return Promise.reject(new Error("No video element"));
    }
    return loadMediaCandidate(cctvVideo, url);
}

async function enableVideoFallback(params, sourceVideo) {
    if (!cctvVideo || !cctvStatus || !cctvLink) {
        return false;
    }

    var directVideo = params.get("cctvVideo");
    var candidates = [];
    var sourceCandidates = buildCctvFallbackSources(sourceVideo);

    if (directVideo) {
        candidates.push(directVideo);
    }

    sourceCandidates.forEach(function(candidate) {
        candidates.push("testdata/" + candidate);
        if (candidate.endsWith(".mov")) {
            candidates.push("testdata/" + candidate.replace(/\.mov$/i, ".mp4"));
        }
    });
    candidates.push("testdata/demo_cctv.mp4");

    var seen = new Set();
    candidates = candidates.filter(function(url) {
        if (!url || seen.has(url)) {
            return false;
        }
        seen.add(url);
        return true;
    });

    for (const candidate of candidates) {
        try {
            await loadVideoCandidate(candidate);
            await loadCctvDetections(sourceVideo);
            setCctvMode("video");
            cctvVideo.play().catch(function() {});
            cctvStatus.textContent = "Fallback video mode";
            cctvLink.href = candidate;
            cctvLink.textContent = "↗ Open video";
            return true;
        } catch (error) {
            continue;
        }
    }

    return false;
}

function stopCctvStatsPolling() {
    if (cctvStatsPollTimer !== null) {
        window.clearInterval(cctvStatsPollTimer);
        cctvStatsPollTimer = null;
    }
}

function renderCctvStats(payload) {
    if (!cctvStatus || !payload || !payload.counts) {
        return;
    }

    const counts = payload.counts;
    const parts = [
        "YOLO",
        "Cars " + (counts.car ?? 0),
        "Moto " + (counts.motorcycle ?? 0),
        "Bus " + (counts.bus ?? 0),
        "Truck " + (counts.truck ?? 0),
        "Total " + (counts.total ?? 0)
    ];
    cctvStatus.textContent = parts.join(" · ");
}

async function fetchAndRenderCctvStats(statsUrl) {
    try {
        const response = await fetch(statsUrl + (statsUrl.includes("?") ? "&" : "?") + "_=" + Date.now());
        if (!response.ok) {
            return;
        }
        const payload = await response.json();
        cctvStatsFailureCount = 0;
        renderCctvStats(payload);
    } catch (error) {
        cctvStatsFailureCount += 1;
        if (cctvStatsFailureCount >= 2) {
            stopCctvStatsPolling();
        }
    }
}

function startCctvStatsPolling(statsUrl) {
    if (!statsUrl) {
        return;
    }
    stopCctvStatsPolling();
    fetchAndRenderCctvStats(statsUrl);
    cctvStatsPollTimer = window.setInterval(function() {
        fetchAndRenderCctvStats(statsUrl);
    }, 1000);
}

async function initCctvStream() {
    if (!cctvStream || !cctvStatus || !cctvLink) {
        return;
    }

    setCctvMode("stream");

    var params = new URLSearchParams(window.location.search);
    var cctvHost = params.get("cctvHost") || window.location.hostname || "127.0.0.1";
    var cctvPort = params.get("cctvPort") || "8010";
    var cctvBaseUrl = "http://" + cctvHost + ":" + cctvPort;
    var cctvFeedUrl = cctvBaseUrl + "/video_feed";
    var cctvStatsUrl = cctvBaseUrl + "/stats";
    var sourceVideo = "sense05.mov";

    try {
        const config = await fetch("sandbox_data/cctv_stream_config.json?_=" + Date.now());
        if (config.ok) {
            const payload = await config.json();
            if (payload && payload.source_video) {
                sourceVideo = payload.source_video;
                cctvDetectionState.sourceName = payload.source_video;
            }
            if (payload && payload.stream_url) {
                cctvFeedUrl = payload.stream_url;
            }
            if (payload && payload.stats_url) {
                cctvStatsUrl = payload.stats_url;
            }
            if (payload && payload.dashboard_url) {
                cctvBaseUrl = payload.dashboard_url;
            }
            if (payload && payload.frame_spec && payload.frame_spec.playback_fps) {
                cctvDetectionState.fps = payload.frame_spec.playback_fps;
            }
            if (payload && payload.frame_spec && payload.frame_spec.width_px && payload.frame_spec.height_px) {
                cctvDetectionState.sourceWidth = payload.frame_spec.width_px;
                cctvDetectionState.sourceHeight = payload.frame_spec.height_px;
            }
        }
    } catch (error) {
        // Keep the default source name when the metadata file is unavailable.
    }

    cctvDetectionState.loaded = false;
    clearCctvOverlay();
    ensureCctvDetectionLoop();

    cctvLink.href = cctvBaseUrl;
    cctvStatus.textContent = "";

    function handleStreamLoad() {
        setCctvMode("stream");
        clearCctvOverlay();
        startCctvStatsPolling(cctvStatsUrl);
        cctvLink.textContent = "↗ Open server";
    }

    async function handleStreamError() {
        stopCctvStatsPolling();
        cctvStatus.textContent = "";
        cctvLink.textContent = "↗ Open server";
        cctvStream.classList.add("is-hidden");

        var foundVideo = await enableVideoFallback(params, sourceVideo);
        if (!foundVideo) {
            cctvStatus.textContent = "Video unavailable";
        }
    }

    cctvStream.addEventListener("load", handleStreamLoad);
    cctvStream.addEventListener("error", handleStreamError);
    cctvStream.src = cctvFeedUrl;
}

initCctvStream();

function handleChooseFile(v, label_dom) {
    return function(evt) {
        let file = evt.target.files[0];
        if (!file) {
            return;
        }
        label_dom.innerText = file.name;
    }
}

function uploadFile(v, file, callback) {
    if (!file) {
        infoAppend("No file selected");
        loading = false;
        return;
    }
    let reader = new FileReader();
    reader.onloadstart = function () {
        infoAppend("Loading " + file.name);
    };
    reader.onerror = function() {
        infoAppend("Loading " + file.name + "failed");
    }
    reader.onload = function (e) {
        infoAppend(file.name + " loaded");
        v[0] = e.target.result;
        callback();
    };
    try {
        reader.readAsText(file);
    } catch (e) {
        infoAppend("Loading failed");
        console.error(e.message);
    }
}

let debugMode = false;
let chartLog;
let showChart = false;
let chartConainterDOM = document.getElementById("chart-container");
function startLoadedData() {
    hasReplayData = true;
    showSimulationView();
    infoAppend("drawing roadnet");
    ready = false;
    document.getElementById("guide").classList.add("d-none");
    hideCanvas();
    try {
        simulation = JSON.parse(roadnetData[0]);
    } catch (e) {
        infoAppend("Parsing roadnet file failed");
        loading = false;
        return;
    }
    if (!simulation || !simulation.static || !simulation.static.nodes || !simulation.static.edges) {
        infoAppend("Invalid replay roadnet file. Use roadnetLogFile output, not the normal roadnetFile.");
        loading = false;
        return;
    }
    try {
        logs = replayData[0].split('\n');
        logs.pop();
    } catch (e) {
        infoAppend("Reading replay file failed");
        loading = false;
        return;
    }

    totalStep = logs.length;
    if (showChart) {
        chartConainterDOM.classList.remove("d-none");
        let chart_lines = chartData[0].split('\n');
        if (chart_lines.length == 0) {
            infoAppend("Chart file is empty");
            showChart = false;
        }
        chartLog = [];
        for (let i = 0 ; i < totalStep ; ++i) {
            step_data = chart_lines[i + 1].split(/[ \t]+/);
            chartLog.push([]);
            for (let j = 0; j < step_data.length; ++j) {
                chartLog[i].push(parseFloat(step_data[j]));
            }
        }
        chart.init(chart_lines[0], chartLog[0].length, totalStep);
    } else {
        chartConainterDOM.classList.add("d-none");
    }

    controls.paused = false;
    cnt = 0;
    debugMode = document.getElementById("debug-mode").checked;
    setTimeout(function () {
        try {
            drawRoadnet();
        } catch (e) {
            infoAppend("Drawing roadnet failed");
            console.error(e.message);
            loading = false;
            return;
        }
        ready = true;
        loading = false;
        infoAppend("Start replaying");
    }, 200);
}

function resetMetricsForStaticMap() {
    nodeCarNum.innerText = "0";
    if (nodeTotalStep) nodeTotalStep.innerText = "0";
    nodeCurrentStep.innerText = "0";
    nodeProgressPercentage.innerText = "Static map";
    nodeSelectedEntity.innerText = "None";
}

function startLoadedRoadnetOnly() {
    hasReplayData = false;
    showSimulationView();
    infoReset();
    infoAppend("Loading real CityFlow roadnet");
    ready = false;
    document.getElementById("guide").classList.add("d-none");
    hideCanvas();
    try {
        simulation = JSON.parse(roadnetData[0]);
    } catch (e) {
        infoAppend("Parsing real map roadnet failed");
        loading = false;
        return;
    }
    if (!simulation || !simulation.static || !simulation.static.nodes || !simulation.static.edges) {
        infoAppend("Invalid CityFlow roadnet file");
        loading = false;
        return;
    }
    chartConainterDOM.classList.add("d-none");
    controls.paused = true;
    cnt = 0;
    resetMetricsForStaticMap();
    debugMode = document.getElementById("debug-mode").checked;
    setTimeout(function () {
        try {
            drawRoadnet();
        } catch (e) {
            infoAppend("Drawing real map failed");
            console.error(e.message);
            loading = false;
            return;
        }
        loading = false;
        infoAppend("Real map loaded");
    }, 200);
}

async function loadTextResource(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("Failed to load " + url);
    }
    return response.text();
}

async function loadSandboxDemo() {
    if (loading) return;
    loading = true;
    showSimulationView();
    infoReset();
    infoAppend("Loading packaged sandbox replay");
    try {
        roadnetData[0] = await loadTextResource("testdata/roadnet.json");
        replayData[0] = await loadTextResource("testdata/replay.txt");
        try {
            chartData[0] = await loadTextResource("sandbox_data/detector_counts_15min.csv");
            showChart = false;
        } catch (e) {
            showChart = false;
        }
        document.getElementById("roadnet-label").innerText = "testdata/roadnet.json";
        document.getElementById("replay-label").innerText = "testdata/replay.txt";
        startLoadedData();
    } catch (e) {
        infoAppend("Sandbox demo loading failed");
        console.error(e.message);
        loading = false;
    }
}

async function loadRealMapDemo() {
    if (loading) return;
    loading = true;
    infoReset();
    showGoogleMapView();
    document.getElementById("guide").classList.add("d-none");
    resetMetricsForStaticMap();
    nodeProgressPercentage.innerText = "Wadi Saqra map";
    infoAppend("Loaded Google Maps viewer for Wadi Saqra / Arar Street");
    loading = false;
}

function formatSmartTimestamp() {
    return "Last updated: " + new Date().toLocaleString("en-GB", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }) + " UTC";
}

function setSmartView(viewName) {
    smartTrafficState.currentView = viewName;

    const viewTitles = {
        dashboard: {
            title: "System Overview",
            subtitle: "Live control health, AI responsiveness, and peak prediction."
        },
        monitoring: {
            title: "Live Monitoring",
            subtitle: "Intersection state, lane timing, and operator signal recommendations."
        },
        analytics: {
            title: "Analytics",
            subtitle: formatSmartTimestamp()
        },
        phase2: {
            title: "Phase 2 Build",
            subtitle: "Crack-the-Code · Architecture & Feasibility · Required build scope"
        },
        settings: {
            title: "Settings",
            subtitle: "Operational controls, alerting, and automation preferences."
        }
    };

    smartNavItems.forEach(function(item) {
        item.classList.toggle("is-active", item.dataset.smartView === viewName);
    });
    smartViews.forEach(function(panel) {
        panel.classList.toggle("is-active", panel.dataset.smartPanel === viewName);
    });

    if (smartPageTitle) smartPageTitle.textContent = viewTitles[viewName].title;
    if (smartPageSub) smartPageSub.textContent = viewTitles[viewName].subtitle;
}

function applySmartTheme(themeName) {
    smartTrafficState.theme = themeName;
    if (smartTrafficApp) {
        smartTrafficApp.classList.toggle("smart-theme-dark", themeName === "dark");
    }
    smartThemeButtons.forEach(function(button) {
        button.classList.toggle("is-active", button.dataset.smartTheme === themeName);
    });
}

function renderSmartVehicleBreakdown() {
    if (!smartMetricRefs.vehicleBreakdown) return;
    smartMetricRefs.vehicleBreakdown.innerHTML = Object.entries(smartTrafficState.metrics.vehicleBreakdown).map(function(entry) {
        return '<div class="smart-key-item"><span>' + entry[0] + '</span><strong>' + entry[1] + '</strong></div>';
    }).join("");
}

function renderSmartTrafficMetrics() {
    const metrics = smartTrafficState.metrics;
    const incidentBanner = liveIncidentState.online && liveIncidentState.total
        ? ("Incident feed: " + liveIncidentState.total + " active events · " + Math.round(liveIncidentState.highestConfidence * 100) + "% top confidence")
        : metrics.peakBannerText;
    const detectionHealth = incidentHealthState
        ? Math.max(52, Math.min(99.5, 100 - ((Number(incidentHealthState.frames_dropped) || 0) * 0.15) - ((Number(incidentHealthState.reconnect_count) || 0) * 2.5)))
        : metrics.health;
    const activeTracks = incidentHealthState && incidentHealthState.active_tracks
        ? Object.values(incidentHealthState.active_tracks).reduce(function(sum, value) {
            return sum + (Number(value) || 0);
        }, 0)
        : null;
    if (smartMetricRefs.totalVehicles) smartMetricRefs.totalVehicles.textContent = metrics.totalVehicles.toLocaleString("en-GB");
    if (smartMetricRefs.congestionIndex) smartMetricRefs.congestionIndex.textContent = metrics.congestionIndex.toFixed(2);
    if (smartMetricRefs.peakBanner) smartMetricRefs.peakBanner.textContent = incidentBanner;
    if (smartMetricRefs.efficiency) smartMetricRefs.efficiency.textContent = metrics.efficiency.toFixed(1) + "%";
    if (smartMetricRefs.currentFlow) smartMetricRefs.currentFlow.textContent = metrics.currentFlow.toFixed(1) + "/hour";
    if (smartMetricRefs.waitTime) smartMetricRefs.waitTime.textContent = metrics.waitMinutes.toFixed(1) + " minutes";
    if (smartMetricRefs.decisionSpeed) smartMetricRefs.decisionSpeed.textContent = metrics.decisionSpeed + "ms";
    if (smartMetricRefs.responseTime) smartMetricRefs.responseTime.textContent = metrics.decisionSpeed + "ms";
    if (smartMetricRefs.health) smartMetricRefs.health.textContent = detectionHealth.toFixed(1) + "%";
    if (smartMetricRefs.weatherTemp) smartMetricRefs.weatherTemp.textContent = metrics.weatherTemp.toFixed(1) + "°C";
    if (smartMetricRefs.monitorVehicles) smartMetricRefs.monitorVehicles.textContent = (activeTracks != null ? activeTracks : metrics.totalVehicles).toLocaleString("en-GB");
    if (smartMetricRefs.monitorWait) smartMetricRefs.monitorWait.textContent = metrics.waitMinutes.toFixed(1) + "m";
    if (smartMetricRefs.monitorEfficiency) smartMetricRefs.monitorEfficiency.textContent = metrics.efficiency.toFixed(0) + "%";
    if (smartMetricRefs.analyticsVolume) smartMetricRefs.analyticsVolume.textContent = metrics.currentFlow.toFixed(0);
    if (smartMetricRefs.analyticsCongestion) smartMetricRefs.analyticsCongestion.textContent = Math.round(metrics.congestionIndex * 100) + "%";
    if (smartMetricRefs.statusCpu) smartMetricRefs.statusCpu.textContent = metrics.cpu + "%";
    if (smartMetricRefs.statusMemory) smartMetricRefs.statusMemory.textContent = metrics.memory + "%";
    if (smartMetricRefs.statusNetwork) smartMetricRefs.statusNetwork.textContent = metrics.network + "ms";
    if (smartMetricRefs.timingNS) smartMetricRefs.timingNS.textContent = metrics.timingNS + "s";
    if (smartMetricRefs.timingEW) smartMetricRefs.timingEW.textContent = metrics.timingEW + "s";
    if (smartMetricRefs.signalNorth) smartMetricRefs.signalNorth.textContent = metrics.signalNorth + "s";
    if (smartMetricRefs.signalSouth) smartMetricRefs.signalSouth.textContent = metrics.signalSouth + "s";
    if (smartMetricRefs.signalEast) smartMetricRefs.signalEast.textContent = metrics.signalEast + "s";
    if (smartMetricRefs.signalWest) smartMetricRefs.signalWest.textContent = metrics.signalWest + "s";
    if (smartMetricRefs.barNS) smartMetricRefs.barNS.style.width = metrics.barNS + "%";
    if (smartMetricRefs.barEW) smartMetricRefs.barEW.style.width = metrics.barEW + "%";
    if (smartMetricRefs.visibility) smartMetricRefs.visibility.textContent = metrics.visibility.toFixed(1);
    if (smartMetricRefs.weatherText) smartMetricRefs.weatherText.textContent = metrics.weatherText;
    if (smartMetricRefs.temperature) smartMetricRefs.temperature.textContent = metrics.weatherTemp.toFixed(1) + " C";
    if (smartMetricRefs.wind) smartMetricRefs.wind.textContent = metrics.wind.toFixed(1) + " mph";
    renderSmartVehicleBreakdown();
}

function recordLiveTrafficPoint(totalVehicles) {
    liveTrafficSeries.push({
        timestamp: new Date(),
        total: totalVehicles
    });
    if (liveTrafficSeries.length > 36) {
        liveTrafficSeries = liveTrafficSeries.slice(-36);
    }
}

function rebuildMapTrafficFromLiveSeries() {
    if (!liveTrafficSeries.length) {
        return;
    }

    mapTrafficSeries.labels = liveTrafficSeries.map(function(point) {
        return point.timestamp.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    });
    mapTrafficSeries.values = liveTrafficSeries.map(function(point) {
        return point.total;
    });
    mapTrafficSeries.cursor = Math.max(0, mapTrafficSeries.values.length - Math.min(mapTrafficSeries.windowSize, mapTrafficSeries.values.length));

    if (mapTrafficKpi) {
        const peak = mapTrafficSeries.values.length ? Math.max.apply(null, mapTrafficSeries.values) : 0;
        const latest = mapTrafficSeries.values.length ? mapTrafficSeries.values[mapTrafficSeries.values.length - 1] : 0;
        mapTrafficKpi.textContent = peak ? (latest + " live · " + peak + " peak vehicles") : "-- vehicles";
    }

    const canvas = document.getElementById("map-traffic-chart");
    if (!canvas || typeof Chart === "undefined") {
        return;
    }

    if (!mapTrafficChart) {
        mapTrafficChart = new Chart(canvas.getContext("2d"), {
            type: "line",
            data: {
                labels: [],
                datasets: [{
                    label: "Vehicles",
                    data: [],
                    borderColor: "#3ecfff",
                    backgroundColor: "rgba(62,207,255,.16)",
                    fill: true,
                    tension: 0.32,
                    borderWidth: 2,
                    pointRadius: [],
                    pointHitRadius: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return " " + context.parsed.y + " vehicles";
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: "#94a3b8", maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
                        grid: { color: "rgba(255,255,255,.05)" }
                    },
                    y: {
                        ticks: { color: "#94a3b8" },
                        grid: { color: "rgba(255,255,255,.07)" }
                    }
                }
            }
        });
    }

    renderMapTrafficWindow();
}

function updateSmartTrafficFromVideoStats() {
    const payloads = Object.values(liveCameraStats).filter(function(item) {
        return item && item.counts;
    });
    if (!payloads.length) {
        return false;
    }

    const totals = payloads.reduce(function(acc, payload) {
        const counts = payload.counts || {};
        acc.total += Number(counts.total) || 0;
        acc.car += Number(counts.car) || 0;
        acc.bus += Number(counts.bus) || 0;
        acc.truck += Number(counts.truck) || 0;
        acc.motorcycle += Number(counts.motorcycle) || 0;
        return acc;
    }, { total: 0, car: 0, bus: 0, truck: 0, motorcycle: 0 });

    const avgVehiclesPerCamera = totals.total / Math.max(1, payloads.length);
    const currentFlow = totals.total * 120;
    const congestionIndex = Math.min(0.98, totals.total / 40);
    const waitMinutes = Number((1.4 + congestionIndex * 7 + totals.truck * 0.15).toFixed(1));
    const efficiency = Number(Math.max(58, 96 - congestionIndex * 28).toFixed(1));
    const decisionSpeed = Math.max(72, 180 - totals.total * 2);
    const network = Math.max(8, 24 + totals.total);

    smartTrafficState.metrics.totalVehicles = totals.total;
    smartTrafficState.metrics.currentFlow = currentFlow;
    smartTrafficState.metrics.congestionIndex = Number(congestionIndex.toFixed(2));
    smartTrafficState.metrics.waitMinutes = waitMinutes;
    smartTrafficState.metrics.efficiency = efficiency;
    smartTrafficState.metrics.decisionSpeed = decisionSpeed;
    smartTrafficState.metrics.health = Number(Math.max(82, 99 - congestionIndex * 10).toFixed(1));
    smartTrafficState.metrics.peakBannerText = "Live peak vehicles: " + totals.total + " across active camera feeds";
    smartTrafficState.metrics.cpu = Math.min(94, 18 + totals.total * 2);
    smartTrafficState.metrics.memory = Math.min(95, 48 + totals.total);
    smartTrafficState.metrics.network = network;
    smartTrafficState.metrics.timingNS = Math.max(3, Math.round(3 + avgVehiclesPerCamera / 3));
    smartTrafficState.metrics.timingEW = Math.max(3, Math.round(2 + avgVehiclesPerCamera / 4));
    smartTrafficState.metrics.signalNorth = 3 + Math.round((liveCameraStats.north?.counts?.total || 0) / 2);
    smartTrafficState.metrics.signalSouth = 3 + Math.round((liveCameraStats.south?.counts?.total || 0) / 2);
    smartTrafficState.metrics.signalEast = 3 + Math.round((liveCameraStats.east?.counts?.total || 0) / 2);
    smartTrafficState.metrics.signalWest = 3 + Math.round((liveCameraStats.west?.counts?.total || 0) / 2);
    smartTrafficState.metrics.barNS = Math.min(100, 24 + (liveCameraStats.north?.counts?.total || 0) * 6 + (liveCameraStats.south?.counts?.total || 0) * 6);
    smartTrafficState.metrics.barEW = Math.min(100, 24 + (liveCameraStats.east?.counts?.total || 0) * 6 + (liveCameraStats.west?.counts?.total || 0) * 6);
    smartTrafficState.metrics.vehicleBreakdown = {
        Cars: totals.car,
        Trucks: totals.truck,
        Buses: totals.bus,
        Motorcycles: totals.motorcycle
    };

    recordLiveTrafficPoint(totals.total);
    rebuildMapTrafficFromLiveSeries();
    renderSmartTrafficMetrics();
    return true;
}

function recordLiveDetectorSnapshot() {
    const cameras = {};
    Object.keys(JUNCTION_CAM_CONFIG).forEach(function(cam) {
        if (liveCameraStats[cam] && liveCameraStats[cam].counts) {
            cameras[cam] = liveCameraStats[cam];
        }
    });
    if (!Object.keys(cameras).length) {
        return;
    }

    liveDetectorHistory.push({
        timestamp: new Date().toISOString(),
        cameras: cameras
    });
    if (liveDetectorHistory.length > 16) {
        liveDetectorHistory = liveDetectorHistory.slice(-16);
    }

    renderTable(
        detectorTable,
        buildDetectorRowsFromLiveHistory().slice(-16).reverse(),
        ["timestamp", "detector_id", "approach", "lane_label", "vehicle_count", "avg_speed_kmh"]
    );
    renderTable(
        signalTable,
        buildSignalRowsFromLiveHistory().slice(-16).reverse(),
        ["timestamp", "phase_number", "signal_state", "duration_sec", "control_mode"]
    );
}

async function seedSmartTrafficMetrics() {
    try {
        const detectorText = await loadTextResource("sandbox_data/detector_counts_15min.csv");
        const signalText = await loadTextResource("sandbox_data/signal_timing_log.csv");
        const detectorRows = parseCsv(detectorText).slice(0, 24);
        const signalRows = parseCsv(signalText).slice(0, 24);
        const totalVehicles = detectorRows.reduce(function(sum, row) {
            return sum + (Number(row.vehicle_count) || 0);
        }, 0);
        const averageVehicles = detectorRows.length ? totalVehicles / detectorRows.length : 0;
        const greenEvents = signalRows.filter(function(row) {
            return String(row.signal_state || "").toUpperCase().indexOf("GREEN") !== -1;
        }).length;
        const congestionIndex = averageVehicles ? Math.min(0.96, averageVehicles / 60) : smartTrafficState.metrics.congestionIndex;

        smartTrafficState.metrics.totalVehicles = Math.round(totalVehicles);
        smartTrafficState.metrics.currentFlow = Math.round(averageVehicles * 12);
        smartTrafficState.metrics.congestionIndex = Number(congestionIndex.toFixed(2));
        smartTrafficState.metrics.waitMinutes = Number((2.2 + congestionIndex * 8).toFixed(1));
        smartTrafficState.metrics.efficiency = Number((78 + greenEvents).toFixed(1));
        smartTrafficState.metrics.decisionSpeed = 120 + greenEvents * 3;
        smartTrafficState.metrics.cpu = 22 + greenEvents;
        smartTrafficState.metrics.memory = 74 + Math.min(16, Math.round(averageVehicles / 12));
        smartTrafficState.metrics.vehicleBreakdown = {
            Cars: Math.round(totalVehicles * 0.78),
            Trucks: Math.round(totalVehicles * 0.11),
            Buses: Math.round(totalVehicles * 0.04),
            Motorcycles: Math.round(totalVehicles * 0.07)
        };
    } catch (e) {
        console.error("Smart dashboard metrics fallback", e.message);
    }

    renderSmartTrafficMetrics();
}

function startSmartTrafficMetricsPolling() {
    if (smartTrafficMetricsTimer !== null) {
        window.clearInterval(smartTrafficMetricsTimer);
    }

    smartTrafficMetricsTimer = window.setInterval(function() {
        if (!updateSmartTrafficFromVideoStats()) {
            renderSmartTrafficMetrics();
        }
    }, 1200);
}

function initSmartTrafficDashboard() {
    if (smartTrafficState.initialized) return;

    smartNavItems.forEach(function(item) {
        item.addEventListener("click", function() {
            setSmartView(item.dataset.smartView);
        });
    });

    smartThemeButtons.forEach(function(button) {
        button.addEventListener("click", function() {
            applySmartTheme(button.dataset.smartTheme);
        });
    });

    if (smartBackButton) {
        smartBackButton.addEventListener("click", function() {
            if (smartTrafficApp) smartTrafficApp.classList.add("d-none");
            if (mainShell) mainShell.classList.remove("d-none");
        });
    }

    applySmartTheme("dark");
    setSmartView("dashboard");
    seedSmartTrafficMetrics();
    startSmartTrafficMetricsPolling();
    smartTrafficState.initialized = true;
}

function openSmartTrafficDashboard() {
    initSmartTrafficDashboard();
    if (mainShell) mainShell.classList.add("d-none");
    if (smartTrafficApp) smartTrafficApp.classList.remove("d-none");
    setSmartView("dashboard");
    if (smartPageSub) {
        smartPageSub.textContent = "Intersection state, lane timing, and operator control actions.";
    }
    infoAppend("Opened Smart Traffic workspace inside the current app");
}

function start() {
    if (loading) return;
    showSimulationView();
    if (!RoadnetFileDom.files[0]) {
        infoReset();
        infoAppend("Please choose a roadnet file");
        return;
    }
    if (!ReplayFileDom.files[0]) {
        infoReset();
        infoAppend("Please choose a replay file");
        return;
    }
    loading = true;
    infoReset();
    uploadFile(roadnetData, RoadnetFileDom.files[0], function(){
    uploadFile(replayData, ReplayFileDom.files[0], function(){
        if (ChartFileDom.value) {
            showChart = true;
            uploadFile(chartData, ChartFileDom.files[0], startLoadedData);
        } else {
            showChart = false;
            startLoadedData();
        }

    }); // replay callback
    }); // roadnet callback
}

let RoadnetFileDom = document.getElementById("roadnet-file");
let ReplayFileDom = document.getElementById("replay-file");
let ChartFileDom = document.getElementById("chart-file");

RoadnetFileDom.addEventListener("change",
    handleChooseFile(roadnetData, document.getElementById("roadnet-label")), false);
ReplayFileDom.addEventListener("change",
    handleChooseFile(replayData, document.getElementById("replay-label")), false);
ChartFileDom.addEventListener("change",
    handleChooseFile(chartData, document.getElementById("chart-label")), false);

document.getElementById("start-btn").addEventListener("click", start);
document.getElementById("load-demo-btn").addEventListener("click", loadSandboxDemo);
document.getElementById("load-realmap-btn").addEventListener("click", loadRealMapDemo);
document.getElementById("open-smart-traffic-btn").addEventListener("click", openSmartTrafficDashboard);

document.getElementById("slow-btn").addEventListener("click", function() {
    updateReplaySpeed(controls.replaySpeed - 0.1);
})

document.getElementById("fast-btn").addEventListener("click", function() {
    updateReplaySpeed(controls.replaySpeed + 0.1);
})

function updateReplaySpeed(speed){
    speed = Math.min(speed, 1);
    speed = Math.max(speed, 0);
    controls.replaySpeed = speed;
    replayControlDom.value = speed * 100;
    replaySpeedDom.innerHTML = speed.toFixed(2);
}

updateReplaySpeed(0.28);

replayControlDom.addEventListener('change', function(e){
    updateReplaySpeed(replayControlDom.value / 100);
});

document.addEventListener('keydown', function(e) {
    if (e.keyCode == P) {
        controls.paused = !controls.paused;
    } else if (e.keyCode == ONE) {
        updateReplaySpeed(Math.max(controls.replaySpeed / 1.5, controls.replaySpeedMin));
    } else if (e.keyCode == TWO ) {
        updateReplaySpeed(Math.min(controls.replaySpeed * 1.5, controls.replaySpeedMax));
    } else if (e.keyCode == LEFT_BRACKET) {
        cnt = (cnt - 1) % totalStep;
        cnt = (cnt + totalStep) % totalStep;
        drawStep(cnt);
    } else if (e.keyCode == RIGHT_BRACKET) {
        cnt = (cnt + 1) % totalStep;
        drawStep(cnt);
    } else {
        keyDown.add(e.keyCode)
    }
});

document.addEventListener('keyup', (e) => keyDown.delete(e.keyCode));

nodeCanvas.addEventListener('dblclick', function(e){
    controls.paused = !controls.paused;
});

pauseButton.addEventListener('click', function(e){
    controls.paused = !controls.paused;
});

function initCanvas() {
    app = new Application({
        width: nodeCanvas.offsetWidth,
        height: nodeCanvas.offsetHeight,
        transparent: false,
        backgroundColor: BACKGROUND_COLOR
    });

    nodeCanvas.appendChild(app.view);
    app.view.classList.add("d-none");

    renderer = app.renderer;
    renderer.interactive = true;
    renderer.autoResize = true;

    renderer.resize(nodeCanvas.offsetWidth, nodeCanvas.offsetHeight);
    app.ticker.add(run);
}

function showCanvas() {
    const sp = document.getElementById("spinner");
    if (sp) { sp.classList.remove("d-none"); sp.classList.remove("show"); sp.style.display = "none"; }
    app.view.classList.remove("d-none");
}

function hideCanvas() {
    const sp = document.getElementById("spinner");
    if (sp) { sp.style.display = "flex"; sp.classList.add("show"); }
    app.view.classList.add("d-none");
}

function drawRoadnet() {
    if (simulatorContainer) {
        simulatorContainer.destroy(true);
    }
    app.stage.removeChildren();
    viewport = new Viewport.Viewport({
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        interaction: app.renderer.plugins.interaction
    });
    viewport
        .drag()
        .pinch()
        .wheel()
        .decelerate();
    app.stage.addChild(viewport);
    simulatorContainer = new Container();
    viewport.addChild(simulatorContainer);

    roadnet = simulation.static;
    nodes = [];
    edges = [];
    trafficLightsG = {};

    for (let i = 0, len = roadnet.nodes.length;i < len;++i) {
        node = roadnet.nodes[i];
        node.point = new Point(transCoord(node.point));
        nodes[node.id] = node;
    }

    for (let i = 0, len = roadnet.edges.length;i < len;++i) {
        edge = roadnet.edges[i];
        edge.from = nodes[edge.from];
        edge.to = nodes[edge.to];
        for (let j = 0, len = edge.points.length;j < len;++j) {
            edge.points[j] = new Point(transCoord(edge.points[j]));
        }
        edges[edge.id] = edge;
    }

    /**
     * Draw Map
     */
    trafficLightContainer = new ParticleContainer(MAX_TRAFFIC_LIGHT_NUM, {tint: true});
    let mapContainer, mapGraphics;
    if (debugMode) {
        mapContainer = new Container();
        simulatorContainer.addChild(mapContainer);
    }else {
        mapGraphics = new Graphics();
        simulatorContainer.addChild(mapGraphics);
    }

    for (nodeId in nodes) {
        if (!nodes[nodeId].virtual) {
            let nodeGraphics;
            if (debugMode) {
                nodeGraphics = new Graphics();
                mapContainer.addChild(nodeGraphics);
            } else {
                nodeGraphics = mapGraphics;
            }
            drawNode(nodes[nodeId], nodeGraphics);
        }
    }
    for (edgeId in edges) {
        let edgeGraphics;
        if (debugMode) {
            edgeGraphics = new Graphics();
            mapContainer.addChild(edgeGraphics);
        } else {
            edgeGraphics = mapGraphics;
        }
        drawEdge(edges[edgeId], edgeGraphics);
    }
    let bounds = simulatorContainer.getBounds();
    simulatorContainer.pivot.set(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    simulatorContainer.position.set(renderer.width / 2, renderer.height / 2);
    simulatorContainer.addChild(trafficLightContainer);

    /**
     * Settings for Cars
     */
    TURN_SIGNAL_LENGTH = CAR_LENGTH;
    TURN_SIGNAL_WIDTH  = CAR_WIDTH / 2;

    var carG = new Graphics();
    carG.lineStyle(0);
    carG.beginFill(0xFFFFFF, 0.8);
    carG.drawRect(0, 0, CAR_LENGTH, CAR_WIDTH);

    let carTexture = renderer.generateTexture(carG);

    let signalG = new Graphics();
    signalG.beginFill(TURN_SIGNAL_COLOR, 0.7).drawRect(0,0, TURN_SIGNAL_LENGTH, TURN_SIGNAL_WIDTH)
           .drawRect(0, 3 * CAR_WIDTH - TURN_SIGNAL_WIDTH, TURN_SIGNAL_LENGTH, TURN_SIGNAL_WIDTH).endFill();
    let turnSignalTexture = renderer.generateTexture(signalG);

    let signalLeft = new Texture(turnSignalTexture, new Rectangle(0, 0, TURN_SIGNAL_LENGTH, CAR_WIDTH));
    let signalStraight = new Texture(turnSignalTexture, new Rectangle(0, CAR_WIDTH, TURN_SIGNAL_LENGTH, CAR_WIDTH));
    let signalRight = new Texture(turnSignalTexture, new Rectangle(0, CAR_WIDTH * 2, TURN_SIGNAL_LENGTH, CAR_WIDTH));
    turnSignalTextures = [signalLeft, signalStraight, signalRight];


    carPool = [];
    if (debugMode)
        carContainer = new Container();
    else
        carContainer = new ParticleContainer(NUM_CAR_POOL, {rotation: true, tint: true});


    turnSignalContainer = new ParticleContainer(NUM_CAR_POOL, {rotation: true, tint: true});
    simulatorContainer.addChild(carContainer);
    simulatorContainer.addChild(turnSignalContainer);
    for (let i = 0, len = NUM_CAR_POOL;i < len;++i) {
        //var car = Sprite.fromImage("images/car.png")
        let car = new Sprite(carTexture);
        let signal = new Sprite(turnSignalTextures[1]);
        car.anchor.set(1, 0.5);

        if (debugMode) {
            car.interactive = true;
            car.on('mouseover', function () {
                selectedDOM.innerText = car.name;
                car.alpha = 0.8;
            });
            car.on('mouseout', function () {
                // selectedDOM.innerText = "";
                car.alpha = 1;
            });
        }
        signal.anchor.set(1, 0.5);
        carPool.push([car, signal]);
    }
    showCanvas();

    return true;
}

function appendText(id, text) {
    let p = document.createElement("span");
    p.innerText = text;
    document.getElementById("info").appendChild(p);
    document.getElementById("info").appendChild(document.createElement("br"));
}

var statsFile = "";
var withRange = false;
var nodeStats, nodeRange;

initCanvas();


function transCoord(point) {
    return [point[0], -point[1]];
}

PIXI.Graphics.prototype.drawLine = function(pointA, pointB) {
    this.moveTo(pointA.x, pointA.y);
    this.lineTo(pointB.x, pointB.y);
}

PIXI.Graphics.prototype.drawDashLine = function(pointA, pointB, dash = 16, gap = 8) {
    let direct = pointA.directTo(pointB);
    let distance = pointA.distanceTo(pointB);

    let currentPoint = pointA;
    let currentDistance = 0;
    let length;
    let finish = false;
    while (true) {
        this.moveTo(currentPoint.x, currentPoint.y);
        if (currentDistance + dash >= distance) {
            length = distance - currentDistance;
            finish = true;
        } else {
            length = dash
        }
        currentPoint = currentPoint.moveAlong(direct, length);
        this.lineTo(currentPoint.x, currentPoint.y);
        if (finish) break;
        currentDistance += length;

        if (currentDistance + gap >= distance) {
            break;
        } else {
            currentPoint = currentPoint.moveAlong(direct, gap);
            currentDistance += gap;
        }
    }
};

function drawNode(node, graphics) {
    graphics.beginFill(LANE_COLOR);
    let outline = node.outline;
    for (let i = 0 ; i < outline.length ; i+=2) {
        outline[i+1] = -outline[i+1];
        if (i == 0)
            graphics.moveTo(outline[i], outline[i+1]);
        else
            graphics.lineTo(outline[i], outline[i+1]);
    }
    graphics.endFill();

    if (debugMode) {
        graphics.hitArea = new PIXI.Polygon(outline);
        graphics.interactive = true;
        graphics.on("mouseover", function () {
            selectedDOM.innerText = node.id;
            graphics.alpha = 0.5;
        });
        graphics.on("mouseout", function () {
            graphics.alpha = 1;
        });
    }

}

function drawEdge(edge, graphics) {
    let from = edge.from;
    let to = edge.to;
    let points = edge.points;

    let pointA, pointAOffset, pointB, pointBOffset;
    let prevPointBOffset = null;

    let roadWidth = 0;
    edge.laneWidths.forEach(function(l){
        roadWidth += l;
    }, 0);

    let coords = [], coords1 = [];

    for (let i = 1;i < points.length;++i) {
        if (i == 1){
            pointA = points[0].moveAlongDirectTo(points[1], from.virtual ? 0 : from.width);
            pointAOffset = points[0].directTo(points[1]).rotate(ROTATE);
        } else {
            pointA = points[i-1];
            pointAOffset = prevPointBOffset;
        }
        if (i == points.length - 1) {
            pointB = points[i].moveAlongDirectTo(points[i-1], to.virtual ? 0 : to.width);
            pointBOffset = points[i-1].directTo(points[i]).rotate(ROTATE);
        } else {
            pointB = points[i];
            pointBOffset = points[i-1].directTo(points[i+1]).rotate(ROTATE);
        }
        prevPointBOffset = pointBOffset;

        lightG = new Graphics();
        lightG.lineStyle(TRAFFIC_LIGHT_WIDTH, 0xFFFFFF);
        lightG.drawLine(new Point(0, 0), new Point(1, 0));
        lightTexture = renderer.generateTexture(lightG);

        // Draw Traffic Lights
        if (i == points.length-1 && !to.virtual) {
            edgeTrafficLights = [];
            prevOffset = offset = 0;
            for (lane = 0;lane < edge.nLane;++lane) {
                offset += edge.laneWidths[lane];
                var light = new Sprite(lightTexture);
                light.anchor.set(0, 0.5);
                light.scale.set(offset - prevOffset, 1);
                point_ = pointB.moveAlong(pointBOffset, prevOffset);
                light.position.set(point_.x, point_.y);
                light.rotation = pointBOffset.getAngleInRadians();
                edgeTrafficLights.push(light);
                prevOffset = offset;
                trafficLightContainer.addChild(light);
            }
            trafficLightsG[edge.id] = edgeTrafficLights;
        }

        // Draw Roads
        graphics.lineStyle(LANE_BORDER_WIDTH, LANE_BORDER_COLOR, 1);
        graphics.drawLine(pointA, pointB);

        pointA1 = pointA.moveAlong(pointAOffset, roadWidth);
        pointB1 = pointB.moveAlong(pointBOffset, roadWidth);

        graphics.lineStyle(0);
        graphics.beginFill(LANE_COLOR);

        coords = coords.concat([pointA.x, pointA.y, pointB.x, pointB.y]);
        coords1 = coords1.concat([pointA1.y, pointA1.x, pointB1.y, pointB1.x]);

        graphics.drawPolygon([pointA.x, pointA.y, pointB.x, pointB.y, pointB1.x, pointB1.y, pointA1.x, pointA1.y]);
        graphics.endFill();

        offset = 0;
        for (let lane = 0, len = edge.nLane-1;lane < len;++lane) {
            offset += edge.laneWidths[lane];
            graphics.lineStyle(LANE_BORDER_WIDTH, LANE_INNER_COLOR);
            graphics.drawDashLine(pointA.moveAlong(pointAOffset, offset), pointB.moveAlong(pointBOffset, offset), LANE_DASH, LANE_GAP);
        }

        offset += edge.laneWidths[edge.nLane-1];

        // graphics.lineStyle(LANE_BORDER_WIDTH, LANE_BORDER_COLOR);
        // graphics.drawLine(pointA.moveAlong(pointAOffset, offset), pointB.moveAlong(pointBOffset, offset));
    }

    if (debugMode) {
        coords = coords.concat(coords1.reverse());
        graphics.interactive = true;
        graphics.hitArea = new PIXI.Polygon(coords);
        graphics.on("mouseover", function () {
            graphics.alpha = 0.5;
            selectedDOM.innerText = edge.id;
        });

        graphics.on("mouseout", function () {
            graphics.alpha = 1;
        });
    }
}

function run(delta) {
    let redraw = false;

    if (!hasReplayData) {
        return;
    }

    if (ready && (!controls.paused || redraw)) {
        try {
            drawStep(cnt);
        }catch (e) {
            infoAppend("Error occurred when drawing");
            ready = false;
        }
        if (!controls.paused) {
            frameElapsed += 1;
            if (frameElapsed >= 1 / controls.replaySpeed ** 2) {
                cnt += 1;
                frameElapsed = 0;
                if (cnt == totalStep) cnt = 0;
            }
        }
    }
}

function _statusToColor(status) {
    switch (status) {
        case 'r':
            return LIGHT_RED;
        case 'g':
            return LIGHT_GREEN;
        default:
            return 0x808080;  
    }
}

function stringHash(str) {
    let hash = 0;
    let p = 127, p_pow = 1;
    let m = 1e9 + 9;
    for (let i = 0; i < str.length; i++) {
        hash = (hash + str.charCodeAt(i) * p_pow) % m;
        p_pow = (p_pow * p) % m;
    }
    return hash;
}

function drawStep(step) {
    if (showChart && (step > chart.ptr || step == 0)) {
        if (step == 0) {
            chart.clear();
        }
        chart.ptr = step;
        chart.addData(chartLog[step]);
    }

    let [carLogs, tlLogs] = logs[step].split(';');

    tlLogs = tlLogs.split(',');
    carLogs = carLogs.split(',');
    
    let tlLog, tlEdge, tlStatus;
    let greenSignals = 0;
    for (let i = 0, len = tlLogs.length;i < len;++i) {
        tlLog = tlLogs[i].split(' ');
        tlEdge = tlLog[0];
        tlStatus = tlLog.slice(1);
        for (let j = 0, len = tlStatus.length;j < len;++j) {
            trafficLightsG[tlEdge][j].tint = _statusToColor(tlStatus[j]);
            if (tlStatus[j] == 'i' ) {
                trafficLightsG[tlEdge][j].alpha = 0;
            }else{
                if (tlStatus[j] == 'g') {
                    greenSignals += 1;
                }
                trafficLightsG[tlEdge][j].alpha = tlStatus[j] == 'g' ? 0.98 : 0.7;
                trafficLightsG[tlEdge][j].scale.set(trafficLightsG[tlEdge][j].scale.x, tlStatus[j] == 'g' ? 4 : 2.5);
            }
        }
    }

    carContainer.removeChildren();
    turnSignalContainer.removeChildren();
    let carLog, position, length, width;
    for (let i = 0, len = carLogs.length - 1;i < len;++i) {
        carLog = carLogs[i].split(' ');
        position = transCoord([parseFloat(carLog[0]), parseFloat(carLog[1])]);
        length = parseFloat(carLog[5]);
        width = parseFloat(carLog[6]);
        carPool[i][0].position.set(position[0], position[1]);
        carPool[i][0].rotation = 2*Math.PI - parseFloat(carLog[2]);
        carPool[i][0].name = carLog[3];
        let carColorId = stringHash(carLog[3]) % CAR_COLORS_NUM;
        carPool[i][0].tint = CAR_COLORS[carColorId];
        carPool[i][0].width = length;
        carPool[i][0].height = width;
        carContainer.addChild(carPool[i][0]);

        let laneChange = parseInt(carLog[4]) + 1;
        carPool[i][1].position.set(position[0], position[1]);
        carPool[i][1].rotation = carPool[i][0].rotation;
        carPool[i][1].texture = turnSignalTextures[laneChange];
        carPool[i][1].width = length;
        carPool[i][1].height = width;
        turnSignalContainer.addChild(carPool[i][1]);
    }
    nodeCarNum.innerText = carLogs.length-1;
    if (nodeTotalStep) nodeTotalStep.innerText = totalStep;
    nodeCurrentStep.innerText = cnt+1;
    nodeProgressPercentage.innerText = (cnt / totalStep * 100).toFixed(2) + "%";
    if (simProgressBadge) {
        simProgressBadge.textContent = greenSignals + " green lanes";
        simProgressBadge.className = "pill " + (greenSignals > 0 ? "pill-green" : "pill-purple");
    }
    if (statsFile != "") {
        if (withRange) nodeRange.value = stats[step][1];
        nodeStats.innerText = stats[step][0].toFixed(2);
    }
}

/*
Chart
 */
let chart = {
    max_steps: 3600,
    data: {
        labels: [],
        series: [[]]
    },
    options: {
        showPoint: false,
        lineSmooth: false,
        axisX: {
            showGrid: false,
            showLabel: false
        }
    },
    init : function(title, series_cnt, max_step){
        document.getElementById("chart-title").innerText = title;
        this.max_steps = max_step;
        this.data.labels = new Array(this.max_steps);
        this.data.series = [];
        for (let i = 0 ; i < series_cnt ; ++i)
            this.data.series.push([]);
        this.chart = new Chartist.Line('#chart', this.data, this.options);
    },
    addData: function (value) {
        for (let i = 0 ; i < value.length; ++i) {
            this.data.series[i].push(value[i]);
            if (this.data.series[i].length > this.max_steps) {
                this.data.series[i].shift();
            }
        }
        this.chart.update();
    },
    clear: function() {
        for (let i = 0 ; i < this.data.series.length ; ++i)
            this.data.series[i] = [];
    },
    ptr: 0
};

function parseCsv(text) {
    const lines = text.trim().split("\n");
    const headers = lines[0].split(",");
    return lines.slice(1).map((line) => {
        const values = line.split(",");
        const row = {};
        headers.forEach((header, idx) => row[header] = values[idx]);
        return row;
    });
}

function parseNdjson(text) {
    return text.trim().split("\n").map(function(line) {
        try {
            return JSON.parse(line);
        } catch (_error) {
            return null;
        }
    }).filter(Boolean);
}

function renderTable(table, rows, columns) {
    if (!table || rows.length === 0) return;
    const header = "<thead><tr>" + columns.map((col) => `<th>${col}</th>`).join("") + "</tr></thead>";
    const body = "<tbody>" + rows.map((row) => "<tr>" + columns.map((col) => `<td>${row[col] ?? ""}</td>`).join("") + "</tr>").join("") + "</tbody>";
    table.innerHTML = header + body;
}

function corridorMeta(corridor) {
    const mapping = {
        N: { detector_id: "D01", approach: "North", lane_label: "N-AGG", phase_number: 1 },
        S: { detector_id: "D02", approach: "South", lane_label: "S-AGG", phase_number: 2 },
        E: { detector_id: "D03", approach: "East", lane_label: "E-AGG", phase_number: 3 },
        W: { detector_id: "D04", approach: "West", lane_label: "W-AGG", phase_number: 4 }
    };
    return mapping[corridor] || { detector_id: "D00", approach: corridor, lane_label: corridor + "-AGG", phase_number: 0 };
}

function buildDetectorRowsFromTypical(rows) {
    return rows.filter(function(row) {
        return row && row.ok && row.departure_local && row.corridor;
    }).map(function(row) {
        const meta = corridorMeta(row.corridor);
        const vehicleCount = Math.max(1, Math.round((row.congestion_ratio || 0.8) * 18));
        return {
            timestamp: row.departure_local.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"),
            detector_id: meta.detector_id,
            approach: meta.approach,
            lane_label: meta.lane_label,
            vehicle_count: vehicleCount,
            avg_speed_kmh: Number(row.speed_kmh || 0).toFixed(2)
        };
    });
}

function buildSignalRowsFromTypical(rows) {
    const signals = [];
    rows.filter(function(row) {
        return row && row.ok && row.departure_local && row.corridor;
    }).forEach(function(row) {
        const meta = corridorMeta(row.corridor);
        const start = row.departure_local.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
        const green = Math.max(10, Math.round((row.congestion_ratio || 0.8) * 18));
        signals.push({
            timestamp: start,
            phase_number: meta.phase_number,
            signal_state: "GREEN ON",
            duration_sec: green,
            control_mode: "typical-derived"
        });
        signals.push({
            timestamp: start,
            phase_number: meta.phase_number,
            signal_state: "YELLOW ON",
            duration_sec: 3,
            control_mode: "typical-derived"
        });
        signals.push({
            timestamp: start,
            phase_number: meta.phase_number,
            signal_state: "RED ON",
            duration_sec: 2,
            control_mode: "typical-derived"
        });
    });
    return signals;
}

function buildDetectorRowsFromLiveHistory() {
    return liveDetectorHistory.slice(-16).flatMap(function(snapshot) {
        return Object.keys(snapshot.cameras).map(function(cam) {
            const counts = snapshot.cameras[cam].counts || {};
            const meta = corridorMeta(cam.charAt(0).toUpperCase());
            const approxSpeed = Math.max(8, 34 - (Number(counts.total) || 0) * 1.8);
            return {
                timestamp: snapshot.timestamp,
                detector_id: meta.detector_id,
                approach: meta.approach,
                lane_label: meta.lane_label,
                vehicle_count: Number(counts.total) || 0,
                avg_speed_kmh: approxSpeed.toFixed(2)
            };
        });
    });
}

function buildSignalRowsFromLiveHistory() {
    return liveDetectorHistory.slice(-16).flatMap(function(snapshot) {
        return Object.keys(snapshot.cameras).map(function(cam) {
            const counts = snapshot.cameras[cam].counts || {};
            const meta = corridorMeta(cam.charAt(0).toUpperCase());
            return {
                timestamp: snapshot.timestamp,
                phase_number: meta.phase_number,
                signal_state: (Number(counts.total) || 0) >= 6 ? "GREEN ON" : "YELLOW ON",
                duration_sec: Math.max(3, Math.min(24, 4 + (Number(counts.total) || 0) * 2)),
                control_mode: "video-analysis"
            };
        });
    });
}

function renderGroundTruth(payload) {
    if (!groundtruthList) return;
    groundtruthList.innerHTML = payload.validation_windows.map((item) => {
        const labels = item.labels.map((label) => `<span class="groundtruth-label">${label}</span>`).join("");
        return `
            <div class="groundtruth-item">
                <div class="groundtruth-time">${item.video} | ${item.start_time_s}s - ${item.end_time_s}s</div>
                <div class="mt-2">${item.notes}</div>
                <div class="groundtruth-labels">${labels}</div>
            </div>
        `;
    }).join("");
}

function buildMapTrafficChart(rows) {
    const canvas = document.getElementById("map-traffic-chart");
    if (!canvas || !rows.length || typeof Chart === "undefined") {
        return;
    }

    const totalsByTime = new Map();
    rows.forEach(function(row) {
        const key = row.timestamp || "Unknown";
        const next = (totalsByTime.get(key) || 0) + (Number(row.vehicle_count) || 0);
        totalsByTime.set(key, next);
    });

    mapTrafficSeries.labels = Array.from(totalsByTime.keys()).slice(0, 24).map(function(ts) {
        const date = new Date(ts);
        if (Number.isNaN(date.getTime())) {
            return ts;
        }
        return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    });
    mapTrafficSeries.values = Array.from(totalsByTime.values()).slice(0, 24);
    mapTrafficSeries.cursor = 0;
    const peak = mapTrafficSeries.values.length ? Math.max.apply(null, mapTrafficSeries.values) : 0;

    if (mapTrafficKpi) {
        mapTrafficKpi.textContent = peak ? peak + " vehicles / 15 min peak" : "-- vehicles / 15 min";
    }

    if (mapTrafficChart) {
        mapTrafficChart.destroy();
        mapTrafficChart = null;
    }

    mapTrafficChart = new Chart(canvas.getContext("2d"), {
        type: "line",
        data: {
            labels: [],
            datasets: [{
                label: "Vehicles",
                data: [],
                borderColor: "#3ecfff",
                backgroundColor: "rgba(62,207,255,.16)",
                fill: true,
                tension: 0.32,
                borderWidth: 2,
                pointRadius: [],
                pointHitRadius: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return " " + context.parsed.y + " vehicles";
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: "#94a3b8", maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
                    grid: { color: "rgba(255,255,255,.05)" }
                },
                y: {
                    ticks: { color: "#94a3b8" },
                    grid: { color: "rgba(255,255,255,.07)" }
                }
            }
        }
    });

    renderMapTrafficWindow();
    if (activeMapMode === "google-map") {
        startMapTrafficAnimation();
    }
}

function renderMapTrafficWindow() {
    if (!mapTrafficChart || !mapTrafficSeries.values.length) {
        return;
    }

    const windowSize = Math.min(mapTrafficSeries.windowSize, mapTrafficSeries.values.length);
    const start = mapTrafficSeries.cursor;
    const labels = [];
    const values = [];
    const radii = [];

    for (let i = 0; i < windowSize; i += 1) {
        const idx = (start + i) % mapTrafficSeries.values.length;
        labels.push(mapTrafficSeries.labels[idx]);
        values.push(mapTrafficSeries.values[idx]);
        radii.push(i === windowSize - 1 ? 4 : 0);
    }

    mapTrafficChart.data.labels = labels;
    mapTrafficChart.data.datasets[0].data = values;
    mapTrafficChart.data.datasets[0].pointRadius = radii;
    mapTrafficChart.update();
}

function stopMapTrafficAnimation() {
    if (mapTrafficSeries.timer) {
        clearInterval(mapTrafficSeries.timer);
        mapTrafficSeries.timer = null;
    }
}

function startMapTrafficAnimation() {
    if (!mapTrafficChart || !mapTrafficSeries.values.length || mapTrafficSeries.timer) {
        return;
    }

    renderMapTrafficWindow();
    mapTrafficSeries.timer = setInterval(function() {
        mapTrafficSeries.cursor = (mapTrafficSeries.cursor + 1) % mapTrafficSeries.values.length;
        renderMapTrafficWindow();
    }, 1300);
}

async function hydrateSandboxData() {
    try {
        const typicalText = await loadTextResource("sandbox_data/typical_2026-04-26.ndjson");
        const metadataText = await loadTextResource("sandbox_data/intersection_metadata.json");
        const groundTruthText = await loadTextResource("sandbox_data/ground_truth_validation.json");
        const typicalRows = parseNdjson(typicalText);
        const detectorRows = buildDetectorRowsFromTypical(typicalRows);
        const signalRows = buildSignalRowsFromTypical(typicalRows);

        if (!liveDetectorHistory.length) {
            renderTable(
                detectorTable,
                detectorRows.slice(0, 16),
                ["timestamp", "detector_id", "approach", "lane_label", "vehicle_count", "avg_speed_kmh"]
            );
            renderTable(
                signalTable,
                signalRows.slice(0, 16),
                ["timestamp", "phase_number", "signal_state", "duration_sec", "control_mode"]
            );
        }
        metadataPreview.textContent = JSON.stringify(JSON.parse(metadataText), null, 2);
        renderGroundTruth(JSON.parse(groundTruthText));
        if (!liveTrafficSeries.length) {
            buildMapTrafficChart(detectorRows);
        }
    } catch (e) {
        console.error("Sandbox data preview failed", e.message);
    }
}

hydrateSandboxData();
