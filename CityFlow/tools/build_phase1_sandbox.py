import csv
import json
from datetime import datetime, timedelta
from pathlib import Path
import random


ROOT = Path("/Users/namaaalhawary/Desktop/Traffic/CityFlow")
OUT = ROOT / "frontend" / "sandbox_data"
VIDEOS = ROOT / "data" / "wts_videos"


def build_detector_counts():
    random.seed(7)
    detectors = [f"D{idx:02d}" for idx in range(1, 23)]
    start = datetime(2026, 4, 20, 0, 0, 0)
    rows = []
    for slot in range(96):
        ts = start + timedelta(minutes=15 * slot)
        peak_factor = 1.0
        hour = ts.hour
        if 7 <= hour <= 9:
            peak_factor = 1.85
        elif 16 <= hour <= 18:
            peak_factor = 1.65
        elif 0 <= hour <= 4:
            peak_factor = 0.35

        for idx, detector in enumerate(detectors):
            base = 18 + (idx % 5) * 7
            count = int(base * peak_factor + random.randint(0, 12))
            rows.append(
                {
                    "timestamp": ts.isoformat(),
                    "intersection_id": "INT-001",
                    "detector_id": detector,
                    "approach": ["N", "E", "S", "W"][idx % 4],
                    "lane_label": f"{['N', 'E', 'S', 'W'][idx % 4]}-{(idx % 3) + 1}",
                    "vehicle_count": count,
                }
            )
    return rows


def build_signal_logs():
    start = datetime(2026, 4, 20, 0, 0, 0)
    phases = [1, 2, 3, 4]
    states = [("GREEN ON", 35), ("YELLOW ON", 4), ("RED ON", 21)]
    rows = []
    current = start
    for _ in range(180):
        for phase in phases:
            for state, seconds in states:
                rows.append(
                    {
                        "timestamp": current.isoformat(),
                        "intersection_id": "INT-001",
                        "phase_number": phase,
                        "signal_state": state,
                    }
                )
                current += timedelta(seconds=seconds)
    return rows


def build_metadata():
    return {
        "intersection_id": "INT-001",
        "site_name": "Phase 1 Traffic Sandbox",
        "camera": {
            "camera_id": "WTS CAM 02",
            "stream_url": "http://127.0.0.1:8010/video_feed",
            "location": {"x": 0, "y": -65, "height_m": 12.5},
            "field_of_view_deg": 78,
            "frame_size": [1920, 1080],
            "ingest_fps_range": [5, 15],
            "codec_assumption": "H.264/H.265",
        },
        "lane_configurations": [
            {"approach": "North", "lanes": ["N-1 through", "N-2 through", "N-3 left"]},
            {"approach": "East", "lanes": ["E-1 through", "E-2 through", "E-3 right"]},
            {"approach": "South", "lanes": ["S-1 through", "S-2 through", "S-3 left"]},
            {"approach": "West", "lanes": ["W-1 through", "W-2 through", "W-3 right"]},
        ],
        "stop_lines": {
            "North": [698, 520, 760, 520],
            "East": [890, 700, 890, 760],
            "South": [698, 900, 760, 900],
            "West": [520, 700, 520, 760],
        },
        "monitoring_zones": [
            {"zone_id": "Q-N", "type": "queue_spillback", "points": [[640, 150], [820, 150], [820, 460], [640, 460]]},
            {"zone_id": "Q-E", "type": "queue_spillback", "points": [[920, 640], [1280, 640], [1280, 820], [920, 820]]},
            {"zone_id": "INC-BOX", "type": "incident_core", "points": [[620, 620], [860, 620], [860, 860], [620, 860]]},
        ],
    }


def build_ground_truth():
    return {
        "validation_windows": [
            {
                "video": "sense02.mp4",
                "start_time_s": 14,
                "end_time_s": 31,
                "labels": ["congestion-event", "queue-spillback-marker"],
                "notes": "Eastbound queue extends beyond stop line and occupies upstream lane.",
            },
            {
                "video": "sense02.mp4",
                "start_time_s": 43,
                "end_time_s": 57,
                "labels": ["abnormal-stopping", "incident-label"],
                "notes": "One vehicle remains stationary in the conflict zone for multiple cycles.",
            },
            {
                "video": "sense01.mp4",
                "start_time_s": 20,
                "end_time_s": 34,
                "labels": ["unexpected-trajectory"],
                "notes": "Vehicle performs non-standard lateral movement across the monitored approach.",
            },
        ]
    }


def build_manifest():
    clips = []
    for video in sorted(VIDEOS.glob("sense*.mp4")):
        clips.append(
            {
                "filename": video.name,
                "role": "training/calibration",
                "notes": "Representative CCTV-like clip for Phase 1 sandbox testing.",
            }
        )
    return {
        "objective": "Traffic Data Sandbox Build",
        "scope": [
            "CCTV-like input environment",
            "Historical CCTV training/calibration pack",
            "Detector count dataset",
            "Signal timing logs",
            "Intersection metadata",
            "Ground truth and annotation layer",
        ],
        "historical_pack": clips,
    }


def write_csv(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    write_csv(OUT / "detector_counts_15min.csv", build_detector_counts())
    write_csv(OUT / "signal_timing_log.csv", build_signal_logs())
    write_json(OUT / "intersection_metadata.json", build_metadata())
    write_json(OUT / "ground_truth_validation.json", build_ground_truth())
    write_json(OUT / "historical_pack_manifest.json", build_manifest())
    print(OUT)


if __name__ == "__main__":
    main()
