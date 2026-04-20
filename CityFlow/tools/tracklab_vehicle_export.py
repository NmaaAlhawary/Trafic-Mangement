import argparse
import importlib.util
import json
import sys
from pathlib import Path

import cv2
import pandas as pd
import torch
from omegaconf import OmegaConf

TRACKLAB_ROOT = Path("/Users/namaaalhawary/Desktop/Traffic/tracklab")
if str(TRACKLAB_ROOT) not in sys.path:
    sys.path.insert(0, str(TRACKLAB_ROOT))


def load_yolo_wrapper():
    module_path = TRACKLAB_ROOT / "tracklab/wrappers/bbox_detector/yolo_ultralytics_api.py"
    spec = importlib.util.spec_from_file_location("tracklab_yolo_ultralytics_api", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module.YOLOUltralytics


def parse_args():
    parser = argparse.ArgumentParser(
        description="Run TrackLab YOLO vehicle detection on a video and export COCO-style annotations."
    )
    parser.add_argument("video", help="Input video path")
    parser.add_argument(
        "--output",
        default="data/wts_annotations/tracklab_vehicle_detections.json",
        help="Output JSON path",
    )
    parser.add_argument(
        "--config",
        default=str(TRACKLAB_ROOT / "tracklab/configs/modules/bbox_detector/yolo_ultralytics_vehicle.yaml"),
        help="TrackLab bbox detector config YAML",
    )
    parser.add_argument("--device", default="cpu", help="Torch device, e.g. cpu or mps")
    return parser.parse_args()


def load_detector(config_path, device):
    cfg = OmegaConf.load(config_path)
    runtime_cfg = OmegaConf.create(
        {
            "model_dir": str(TRACKLAB_ROOT / "pretrained_models"),
            "project_dir": str(TRACKLAB_ROOT),
        }
    )
    cfg = OmegaConf.merge(runtime_cfg, cfg)
    YOLOUltralytics = load_yolo_wrapper()
    return YOLOUltralytics(cfg=cfg.cfg, device=device, batch_size=cfg.batch_size)


def export_detections(video_path, detector):
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise SystemExit(f"Failed to open video: {video_path}")

    rows = []
    frame_idx = 0
    detection_id = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            metadata = pd.Series({"video_id": 0}, name=frame_idx)
            batch = detector.preprocess(image=rgb, detections=pd.DataFrame(), metadata=metadata)
            _, collated = type(detector).collate_fn([(frame_idx, batch)])
            detections = detector.process(collated, pd.DataFrame(), pd.DataFrame([metadata]))

            for det in detections:
                bbox = det["bbox_ltwh"]
                rows.append(
                    {
                        "id": detection_id,
                        "image_id": frame_idx,
                        "category_id": int(det["category_id"]),
                        "bbox": [float(v) for v in bbox],
                        "score": float(det["bbox_conf"]),
                    }
                )
                detection_id += 1
            frame_idx += 1
    finally:
        cap.release()

    return {"annotations": rows}


def main():
    args = parse_args()
    video_path = Path(args.video)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    device = args.device
    if device == "cpu" and torch.backends.mps.is_available():
        device = "mps"

    detector = load_detector(args.config, device)
    payload = export_detections(video_path, detector)
    output_path.write_text(json.dumps(payload), encoding="utf-8")
    print(output_path)


if __name__ == "__main__":
    main()
