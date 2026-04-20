import argparse
import json
import os
import time
from collections import defaultdict

try:
    import cv2
except ImportError as exc:
    raise SystemExit(
        "OpenCV is required. Install it with: pip install opencv-python"
    ) from exc

try:
    from flask import Flask, Response, render_template_string
except ImportError as exc:
    raise SystemExit(
        "Flask is required. Install it with: pip install flask"
    ) from exc


PAGE_TEMPLATE = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{ title }}</title>
  <style>
    :root {
      --bg: #050505;
      --panel: #101010;
      --text: #f2f2f2;
      --muted: #9da3a6;
      --accent: #3cff75;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top, #1a1a1a 0%, #050505 55%),
        linear-gradient(180deg, #0a0a0a, #020202);
      color: var(--text);
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      display: grid;
      place-items: center;
    }
    .shell {
      width: min(96vw, 1600px);
      padding: 24px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      color: var(--muted);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-size: 13px;
    }
    .live {
      color: var(--accent);
      font-weight: 700;
    }
    .frame {
      background: #000;
      border: 1px solid #242424;
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
    }
    img {
      display: block;
      width: 100%;
      height: auto;
      background: #000;
    }
    .footer {
      margin-top: 14px;
      color: var(--muted);
      font-size: 14px;
    }
    code {
      color: #fff;
    }
  </style>
</head>
<body>
  <main class="shell">
    <div class="header">
      <div>{{ camera_id }}</div>
      <div class="live">Live Replay</div>
    </div>
    <section class="frame">
      <img src="{{ video_url }}" alt="CCTV stream">
    </section>
    <div class="footer">
      Press <code>Ctrl+C</code> in the terminal to stop the server.
    </div>
  </main>
</body>
</html>
"""


def parse_args():
    parser = argparse.ArgumentParser(
        description="Serve a looping CCTV-style traffic video on localhost."
    )
    parser.add_argument("video", help="Path to the input video file")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host")
    parser.add_argument("--port", type=int, default=8010, help="Bind port")
    parser.add_argument("--width", type=int, default=1920, help="Output width")
    parser.add_argument("--height", type=int, default=1080, help="Output height")
    parser.add_argument("--fps", type=float, default=30.0, help="Playback fps")
    parser.add_argument("--title", default="CCTV Feed", help="Page title")
    parser.add_argument("--camera-id", default="CAM 01", help="Overlay camera id")
    parser.add_argument(
        "--annotations",
        help="Path to a COCO-like JSON file or a directory of JSON files with annotations",
    )
    parser.add_argument(
        "--show-labels",
        action="store_true",
        help="Draw labels like track_id / phase_number / score next to boxes",
    )
    return parser.parse_args()


def draw_overlay(frame, camera_id, frame_index):
    h, w = frame.shape[:2]
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")

    cv2.rectangle(frame, (24, 24), (440, 122), (0, 0, 0), -1)
    cv2.putText(
        frame,
        f"{camera_id}  LIVE",
        (40, 62),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.9,
        (0, 255, 0),
        2,
        cv2.LINE_AA,
    )
    cv2.putText(
        frame,
        timestamp,
        (40, 96),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.75,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )
    cv2.putText(
        frame,
        f"FRAME {frame_index}",
        (w - 250, h - 28),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.75,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )


def color_for_value(value):
    palette = [
        (0, 255, 0),
        (0, 200, 255),
        (255, 180, 0),
        (255, 0, 140),
        (120, 255, 120),
        (255, 120, 120),
    ]
    return palette[hash(str(value)) % len(palette)]


def load_annotations(path):
    if not path:
        return {}

    if os.path.isdir(path):
        files = sorted(
            os.path.join(path, name)
            for name in os.listdir(path)
            if name.endswith(".json")
        )
    else:
        files = [path]

    by_frame = defaultdict(list)
    for file_path in files:
        with open(file_path, "r", encoding="utf-8") as fh:
            payload = json.load(fh)

        annotations = payload["annotations"] if isinstance(payload, dict) and "annotations" in payload else payload
        for ann in annotations:
            if "image_id" not in ann or "bbox" not in ann:
                continue
            by_frame[int(ann["image_id"])].append(ann)
    return by_frame


def draw_annotations(frame, frame_annotations, show_labels):
    for ann in frame_annotations:
        x, y, w, h = ann["bbox"]
        x1, y1 = int(round(x)), int(round(y))
        x2, y2 = int(round(x + w)), int(round(y + h))

        label_value = (
            ann.get("track_id")
            or ann.get("phase_number")
            or ann.get("category_id")
            or ann.get("id")
            or "det"
        )
        color = color_for_value(label_value)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

        if not show_labels:
            continue

        label_parts = []
        if "track_id" in ann:
            label_parts.append(f"id:{ann['track_id']}")
        elif "phase_number" in ann:
            label_parts.append(f"phase:{ann['phase_number']}")
        if "bbox_conf" in ann:
            label_parts.append(f"{ann['bbox_conf']:.2f}")
        elif "score" in ann:
            label_parts.append(f"{ann['score']:.2f}")
        elif "scores" in ann and ann["scores"]:
            try:
                label_parts.append(f"{max(ann['scores']):.2f}")
            except TypeError:
                pass
        label = " ".join(label_parts) or str(label_value)

        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
        cv2.rectangle(frame, (x1, max(0, y1 - th - 10)), (x1 + tw + 10, y1), color, -1)
        cv2.putText(
            frame,
            label,
            (x1 + 5, y1 - 6),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (0, 0, 0),
            2,
            cv2.LINE_AA,
        )


def create_app(args):
    app = Flask(__name__)
    annotations_by_frame = load_annotations(args.annotations)

    def frame_stream():
        cap = cv2.VideoCapture(args.video)
        if not cap.isOpened():
            raise RuntimeError(f"Failed to open video: {args.video}")

        frame_index = 0
        frame_delay = max(1.0 / max(args.fps, 0.1), 0.001)

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    frame_index = 0
                    continue

                frame = cv2.resize(frame, (args.width, args.height))
                draw_overlay(frame, args.camera_id, frame_index)

                frame_annotations = annotations_by_frame.get(frame_index, [])
                if not frame_annotations:
                    frame_annotations = annotations_by_frame.get(frame_index + 1, [])
                if frame_annotations:
                    draw_annotations(frame, frame_annotations, args.show_labels)

                ok, encoded = cv2.imencode(
                    ".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85]
                )
                if not ok:
                    continue

                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n"
                    + encoded.tobytes()
                    + b"\r\n"
                )
                frame_index += 1
                time.sleep(frame_delay)
        finally:
            cap.release()

    @app.route("/")
    def index():
        return render_template_string(
            PAGE_TEMPLATE,
            title=args.title,
            camera_id=args.camera_id,
            video_url="/video_feed",
        )

    @app.route("/video_feed")
    def video_feed():
        return Response(
            frame_stream(),
            mimetype="multipart/x-mixed-replace; boundary=frame",
        )

    return app


def main():
    args = parse_args()
    if not os.path.exists(args.video):
        raise SystemExit(f"Video not found: {args.video}")

    app = create_app(args)
    app.run(host=args.host, port=args.port, debug=False, threaded=True)


if __name__ == "__main__":
    main()
