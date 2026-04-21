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
let cctvDetectionState = {
    fps: 10,
    sourceWidth: 1920,
    sourceHeight: 1080,
    sourceName: "sense02.mp4",
    loaded: false
};
let mapTrafficChart = null;
let mapTrafficSeries = { labels: [], values: [], cursor: 0, timer: null, windowSize: 8 };

const GOOGLE_MAP_URL = "https://www.google.com/maps/embed?pb=!1m28!1m12!1m3!1d1279.8671332617787!2d35.88637445138584!3d31.96695723296919!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!4m13!3e6!4m5!1s0x151ca05b4ebccd5d%3A0x726d6db1e88866ef!2sWadi%20Saqra%20Int.%2C%20Amman!3m2!1d31.9666926!2d35.8870141!4m5!1s0x151ca05b4ebccd5d%3A0x726d6db1e88866ef!2sWadi%20Saqra%20Int.%2C%20Amman!3m2!1d31.9666926!2d35.8870141!5e1!3m2!1sen!2sjo!4v1776713852283!5m2!1sen!2sjo";
const DETECTION_COLORS = {
    2: "#3ecfff",
    5: "#22d97a",
    7: "#fbbf24"
};
const DETECTION_LABELS = {
    2: "Car",
    3: "Motorbike",
    5: "Bus",
    7: "Truck"
};
const junctionCamVideos = Array.from(document.querySelectorAll(".junction-cam-video"));

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
    startMapTrafficAnimation();
    if (nodeCanvas) {
        nodeCanvas.classList.add("d-none");
    }
}

// Map each data-cam value to a live stream port
const CAM_PORTS = { north: "8010", south: "8011", east: "8012", west: "8013" };

function syncJunctionCameraFeeds(fallbackUrl) {
    var host = window.location.hostname || "127.0.0.1";
    junctionCamVideos.forEach(function(video, index) {
        if (!video) return;
        var cam = video.dataset.cam;
        var port = CAM_PORTS[cam];
        // Try live stream first; fall back to video file if stream unavailable
        if (port) {
            var streamUrl = "http://" + host + ":" + port + "/video_feed";
            // Use an img probe to test if the stream is alive
            var probe = new Image();
            probe.onload = function() {
                // Stream is alive — switch to <img> style stream via the video's poster trick
                // We can't use <img> inside <video>, so just set the src to the stream URL
                // (MJPEG streams work as video src in most browsers)
                if (video.dataset.src !== streamUrl) {
                    video.src = streamUrl;
                    video.dataset.src = streamUrl;
                }
                video.play().catch(function() {});
            };
            probe.onerror = function() {
                // Stream not available — use fallback video with offset
                if (video.dataset.src !== fallbackUrl) {
                    video.src = fallbackUrl;
                    video.dataset.src = fallbackUrl;
                    video.currentTime = Math.min(index * 0.7, 2.1);
                }
                video.playbackRate = 0.9;
                video.play().catch(function() {});
            };
            probe.src = streamUrl;
        } else {
            if (video.dataset.src !== fallbackUrl) {
                video.src = fallbackUrl;
                video.dataset.src = fallbackUrl;
                video.currentTime = Math.min(index * 0.7, 2.1);
            }
            video.playbackRate = 0.9;
            video.play().catch(function() {});
        }
    });
}

// Initialise junction cams with live streams immediately on page load
function initJunctionCameraStreams() {
    var host = window.location.hostname || "127.0.0.1";
    junctionCamVideos.forEach(function(video) {
        if (!video) return;
        var cam = video.dataset.cam;
        var segment = video.dataset.segment || "";
        var port = CAM_PORTS[cam];
        if (!port) return;
        var streamUrl = "http://" + host + ":" + port + "/video_feed";
        // Replace <video> with <img> for MJPEG stream display
        var img = document.createElement("img");
        img.src = streamUrl;
        img.className = "junction-cam-video";
        img.dataset.cam = cam;
        if (segment) {
            img.dataset.segment = segment;
        }
        img.alt = "CAM " + cam + " video02";
        img.onerror = function() {
            // If stream fails, keep the original <video> element visible with a placeholder
            img.style.display = "none";
            video.style.display = "block";
        };
        video.parentNode.insertBefore(img, video);
        video.style.display = "none";
    });
}
initJunctionCameraStreams();

function clearCctvOverlay() {
    if (!cctvOverlayCanvas) {
        return;
    }
    const context = cctvOverlayCanvas.getContext("2d");
    context.clearRect(0, 0, cctvOverlayCanvas.width, cctvOverlayCanvas.height);
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

function normaliseDetectionPayload(payload) {
    cctvDetectionFrames = new Map();
    const annotations = payload && Array.isArray(payload.annotations) ? payload.annotations : [];
    annotations.forEach(function(item) {
        if (!item || typeof item.image_id !== "number" || !Array.isArray(item.bbox) || item.bbox.length < 4) {
            return;
        }
        if ((item.score ?? 0) < 0.35) {
            return;
        }
        if (!cctvDetectionFrames.has(item.image_id)) {
            cctvDetectionFrames.set(item.image_id, []);
        }
        cctvDetectionFrames.get(item.image_id).push(item);
    });
    cctvDetectionState.loaded = cctvDetectionFrames.size > 0;
}

async function loadCctvDetections() {
    const urls = [
        "testdata/sense02_tracklab_vehicle.json",
        "sandbox_data/annotations/sense02_tracklab_vehicle.json"
    ];

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

    infoAppend("YOLO detections unavailable for sense02.mp4");
}

function drawCctvDetectionsForFrame(frameIndex) {
    if (!cctvOverlayCanvas || !cctvDetectionState.loaded) {
        clearCctvOverlay();
        return;
    }

    resizeCctvOverlay();
    const context = cctvOverlayCanvas.getContext("2d");
    const width = cctvOverlayCanvas.width;
    const height = cctvOverlayCanvas.height;
    const sx = width / cctvDetectionState.sourceWidth;
    const sy = height / cctvDetectionState.sourceHeight;
    const items = cctvDetectionFrames.get(frameIndex) || [];

    context.clearRect(0, 0, width, height);
    context.lineWidth = 2;
    context.font = "12px JetBrains Mono";
    context.textBaseline = "top";

    items.forEach(function(item) {
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
    return new Promise(function(resolve, reject) {
        if (!cctvVideo) {
            reject(new Error("No video element"));
            return;
        }

        let settled = false;

        function cleanup() {
            cctvVideo.removeEventListener("loadeddata", onLoaded);
            cctvVideo.removeEventListener("error", onError);
        }

        function onLoaded() {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            resolve(url);
        }

        function onError() {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            reject(new Error("Video unavailable"));
        }

        cctvVideo.addEventListener("loadeddata", onLoaded, { once: true });
        cctvVideo.addEventListener("error", onError, { once: true });
        cctvVideo.src = url;
        cctvVideo.load();
    });
}

async function enableVideoFallback(params, sourceVideo) {
    if (!cctvVideo || !cctvStatus || !cctvLink) {
        return false;
    }

    var directVideo = params.get("cctvVideo");
    var candidates = [];

    if (directVideo) {
        candidates.push(directVideo);
    }
    if (sourceVideo) {
        candidates.push("testdata/" + sourceVideo);
        candidates.push(sourceVideo);
    }
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
            setCctvMode("video");
            cctvVideo.play().catch(function() {});
            cctvStatus.textContent = "";
            cctvLink.href = candidate;
            cctvLink.textContent = "↗ Open video";
            syncJunctionCameraFeeds(candidate);
            return true;
        } catch (error) {
            continue;
        }
    }

    return false;
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
    var sourceVideo = "sense02.mp4";

    try {
        const config = await fetch("sandbox_data/cctv_stream_config.json?_=" + Date.now());
        if (config.ok) {
            const payload = await config.json();
            if (payload && payload.source_video) {
                sourceVideo = payload.source_video;
                cctvDetectionState.sourceName = payload.source_video;
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

    loadCctvDetections();
    ensureCctvDetectionLoop();

    cctvStream.src = cctvFeedUrl;
    cctvLink.href = cctvBaseUrl + "/";
    cctvStatus.textContent = "";

    cctvStream.addEventListener("load", function () {
        setCctvMode("stream");
        cctvStatus.textContent = "";
        cctvLink.textContent = "↗ Open server";
    });

    cctvStream.addEventListener("error", async function () {
        cctvStatus.textContent = "";
        cctvLink.textContent = "↗ Open server";

        var foundVideo = await enableVideoFallback(params, sourceVideo);
        if (!foundVideo) {
            cctvStatus.textContent = "Video unavailable";
        }
    });
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

function renderTable(table, rows, columns) {
    if (!table || rows.length === 0) return;
    const header = "<thead><tr>" + columns.map((col) => `<th>${col}</th>`).join("") + "</tr></thead>";
    const body = "<tbody>" + rows.map((row) => "<tr>" + columns.map((col) => `<td>${row[col] ?? ""}</td>`).join("") + "</tr>").join("") + "</tbody>";
    table.innerHTML = header + body;
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
        const detectorText = await loadTextResource("sandbox_data/detector_counts_15min.csv");
        const signalText = await loadTextResource("sandbox_data/signal_timing_log.csv");
        const metadataText = await loadTextResource("sandbox_data/intersection_metadata.json");
        const groundTruthText = await loadTextResource("sandbox_data/ground_truth_validation.json");

        renderTable(detectorTable, parseCsv(detectorText).slice(0, 10), ["timestamp", "detector_id", "approach", "lane_label", "vehicle_count"]);
        renderTable(signalTable, parseCsv(signalText).slice(0, 10), ["timestamp", "intersection_id", "phase_number", "signal_state"]);
        metadataPreview.textContent = JSON.stringify(JSON.parse(metadataText), null, 2);
        renderGroundTruth(JSON.parse(groundTruthText));
        buildMapTrafficChart(parseCsv(detectorText));
    } catch (e) {
        console.error("Sandbox data preview failed", e.message);
    }
}

hydrateSandboxData();
