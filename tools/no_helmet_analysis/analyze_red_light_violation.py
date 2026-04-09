from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

if __package__ in (None, ""):
  sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from tools.no_helmet_analysis.analyze_no_helmet import (  # noqa: E402
  UltralyticsDetector,
  ffprobe_metadata,
  load_roi_config,
  normalize_roi,
  require_binary,
  write_summary,
)
from tools.no_helmet_analysis.core import (  # noqa: E402
  PersonAssessment,
  SimpleTracker,
  Track,
  ViolationEventManager,
  person_in_roi,
)


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Analyze a video and flag vehicles crossing a stop line while the signal is red."
  )
  parser.add_argument("--video-path", required=True)
  parser.add_argument("--roi-config-path", required=True)
  parser.add_argument("--output-dir", required=True)
  parser.add_argument("--vehicle-model-path", required=True)
  parser.add_argument("--traffic-light-model-path", required=True)
  parser.add_argument("--vehicle-label", action="append", dest="vehicle_labels", default=[])
  parser.add_argument("--red-light-label", action="append", dest="red_light_labels", default=[])
  parser.add_argument("--green-light-label", action="append", dest="green_light_labels", default=[])
  parser.add_argument("--confidence-threshold", type=float, default=0.30)
  parser.add_argument("--iou-threshold", type=float, default=0.30)
  parser.add_argument("--frame-step", type=int, default=2)
  parser.add_argument("--image-size", type=int, default=1280)
  parser.add_argument("--crossing-window-seconds", type=float, default=2.5)
  parser.add_argument("--event-type", default="red_light_violation")
  parser.add_argument("--finding-label", default="red light violation")
  return parser.parse_args()


def detect_signal_state(detections, red_labels, green_labels) -> str:
  best_red = max((item.confidence for item in detections if item.label in red_labels), default=0.0)
  best_green = max((item.confidence for item in detections if item.label in green_labels), default=0.0)
  if best_red <= 0 and best_green <= 0:
    return "unknown"
  return "red" if best_red >= best_green else "green"


def assess_vehicles_in_red(vehicles, roi_polygon, signal_state):
  assessments: list[PersonAssessment] = []
  for vehicle in vehicles:
    in_roi = person_in_roi(vehicle.bbox, roi_polygon)
    is_violation = signal_state == "red" and in_roi
    assessments.append(
      PersonAssessment(
        detection=vehicle,
        in_roi=in_roi,
        has_helmet=not is_violation,
        helmet_confidence=None,
        violation_confidence=vehicle.confidence if is_violation else 0.0,
        assessment_state="violation" if is_violation else "compliant",
        positive_ppe_confidence=None,
        violation_mode="red-light" if is_violation else None,
      )
    )
  return assessments


def strip_positive_ppe_flags(tracks: dict[int, Track]) -> dict[int, Track]:
  for track in tracks.values():
    track.positive_ppe_seen = False
    track.max_positive_ppe_confidence = 0.0
  return tracks


def main() -> int:
  args = parse_args()
  require_binary("ffmpeg")
  require_binary("ffprobe")

  video_path = Path(args.video_path).expanduser().resolve()
  roi_config_path = Path(args.roi_config_path).expanduser().resolve()
  output_dir = Path(args.output_dir).expanduser().resolve()
  output_dir.mkdir(parents=True, exist_ok=True)
  roi_id, polygon, normalized = load_roi_config(roi_config_path)

  metadata = ffprobe_metadata(video_path)
  metadata["video_path"] = str(video_path)
  roi_polygon = normalize_roi(polygon, metadata["width"], metadata["height"], normalized)

  vehicle_labels = args.vehicle_labels or ["truck", "car", "pickup", "bus", "vehicle"]
  red_light_labels = args.red_light_labels or ["red-light", "red_signal", "red"]
  green_light_labels = args.green_light_labels or ["green-light", "green_signal", "green"]

  vehicle_detector = UltralyticsDetector(
    model_path=args.vehicle_model_path,
    confidence_threshold=args.confidence_threshold,
    person_labels=vehicle_labels,
    helmet_labels=[],
    image_size=args.image_size,
  )
  traffic_light_detector = UltralyticsDetector(
    model_path=args.traffic_light_model_path,
    confidence_threshold=args.confidence_threshold,
    person_labels=[],
    helmet_labels=[],
    image_size=args.image_size,
  )
  tracker = SimpleTracker(iou_threshold=args.iou_threshold)
  analyzed_fps = metadata["fps"] / max(1, args.frame_step) if metadata["fps"] > 0 else 0.0
  violation_on_frames = max(1, math.ceil(args.crossing_window_seconds * max(analyzed_fps, 1.0)))
  manager = ViolationEventManager(
    video_path=str(video_path),
    roi_id=roi_id,
    output_dir=output_dir,
    event_type=args.event_type,
    violation_on_frames=violation_on_frames,
    clean_off_frames=2,
    veto_on_positive_evidence=False,
  )

  all_events = []
  best_frames = {}
  analyzed_frame_count = 0
  capture = vehicle_detector.cv2.VideoCapture(str(video_path))
  if not capture.isOpened():
    raise SystemExit(f"Unable to open video for analysis: {video_path}")

  frame_index = 0
  while True:
    ok, frame = capture.read()
    if not ok:
      break
    frame_index += 1
    if (frame_index - 1) % max(1, args.frame_step) != 0:
      continue

    analyzed_frame_count += 1
    vehicle_detections = vehicle_detector.predict(frame)
    traffic_light_detections = traffic_light_detector.predict(frame)
    signal_state = detect_signal_state(traffic_light_detections, set(red_light_labels), set(green_light_labels))
    assessments = assess_vehicles_in_red(vehicle_detections, roi_polygon, signal_state)
    time_seconds = (
      capture.get(vehicle_detector.cv2.CAP_PROP_POS_MSEC) / 1000.0
      if capture.get(vehicle_detector.cv2.CAP_PROP_POS_MSEC) > 0
      else ((frame_index - 1) / metadata["fps"] if metadata["fps"] > 0 else 0.0)
    )
    updates = tracker.update(frame_index, time_seconds, assessments)
    completed = manager.process_updates(tracker.tracks, updates)

    for event in completed:
      best_frame = best_frames.get(event.track_id)
      if best_frame is not None:
        best_frame_image, best_bbox, _best_frame_index = best_frame
        vehicle_detector.annotate_and_save(best_frame_image, event, best_bbox, roi_polygon)
      all_events.append(event)

    for track_id, update in updates.items():
      assessment = update.assessment
      track = tracker.tracks[track_id]
      candidate_matches = track.candidate is not None and track.candidate.best_frame_index == frame_index
      active_matches = track.active_event is not None and track.active_event.best_frame_index == frame_index
      if assessment and (candidate_matches or active_matches):
        best_frames[track_id] = (frame.copy(), assessment.detection.bbox, frame_index)

  capture.release()

  flushed = manager.flush(tracker.tracks)
  for event in flushed:
    best_frame = best_frames.get(event.track_id)
    if best_frame is not None:
      best_frame_image, best_bbox, _best_frame_index = best_frame
      vehicle_detector.annotate_and_save(best_frame_image, event, best_bbox, roi_polygon)
    all_events.append(event)

  write_summary(
    output_dir,
    all_events,
    metadata,
    analyzed_frame_count,
    strip_positive_ppe_flags(tracker.tracks),
    args.finding_label,
    veto_on_positive_evidence=False,
  )
  print(json.dumps({"ok": True, "output_dir": str(output_dir), "event_count": len(all_events)}, indent=2))
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
