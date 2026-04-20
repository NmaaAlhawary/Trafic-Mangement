import argparse
import os
import time

try:
    import cv2
except ImportError as exc:
    raise SystemExit(
        "OpenCV is required. Install it with: pip install opencv-python"
    ) from exc


def parse_args():
    parser = argparse.ArgumentParser(
        description="Loop a traffic video as a CCTV-style replay feed."
    )
    parser.add_argument("video", help="Path to the input video file")
    parser.add_argument("--width", type=int, default=1920, help="Output width")
    parser.add_argument("--height", type=int, default=1080, help="Output height")
    parser.add_argument(
        "--window-title", default="CCTV Feed", help="OpenCV window title"
    )
    parser.add_argument(
        "--camera-id", default="CAM 01", help="Overlay camera identifier"
    )
    parser.add_argument(
        "--delay-ms",
        type=int,
        default=30,
        help="Delay between frames in milliseconds",
    )
    return parser.parse_args()


def draw_overlay(frame, camera_id, frame_index):
    h, w = frame.shape[:2]
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")

    cv2.rectangle(frame, (24, 24), (430, 122), (0, 0, 0), -1)
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


def main():
    args = parse_args()

    if not os.path.exists(args.video):
        raise SystemExit(f"Video not found: {args.video}")

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        raise SystemExit(f"Failed to open video: {args.video}")

    frame_index = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                frame_index = 0
                continue

            frame = cv2.resize(frame, (args.width, args.height))
            draw_overlay(frame, args.camera_id, frame_index)
            cv2.imshow(args.window_title, frame)
            frame_index += 1

            key = cv2.waitKey(args.delay_ms) & 0xFF
            if key in (27, ord("q")):
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
