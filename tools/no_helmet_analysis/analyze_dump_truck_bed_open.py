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
  Detection,
  PersonAssessment,
  SimpleTracker,
  Track,
  ViolationEventManager,
  bbox_center,
  bbox_intersection_ratio,
  bbox_iou,
  person_in_roi,
  point_in_bbox,
)


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Analyze a video and flag dump trucks moving with the bed still open."
  )
  parser.add_argument("--video-path", required=True)
  parser.add_argument("--roi-config-path", required=True)
  parser.add_argument("--output-dir", required=True)
  parser.add_argument("--model-path", required=True)
  parser.add_argument("--truck-label", action="append", dest="truck_labels", default=[])
  parser.add_argument("--bed-open-label", action="append", dest="bed_open_labels", default=[])
  parser.add_argument("--bed-closed-label", action="append", dest="bed_closed_labels", default=[])
  parser.add_argument("--confidence-threshold", type=float, default=0.30)
  parser.add_argument("--iou-threshold", type=float, default=0.30)
  parser.add_argument("--frame-step", type=int, default=2)
  parser.add_argument("--image-size", type=int, default=1280)
  parser.add_argument("--movement-threshold", type=float, default=0.10)
  parser.add_argument("--minimum-moving-seconds", type=float, default=2.0)
  parser.add_argument("--event-type", default="dump_truck_bed_open")
  parser.add_argument("--finding-label", default="dump truck bed open")
  return parser.parse_args()


def _match_state_detection(
  truck_bbox,
  candidates: list[Detection],
) -> Detection | None:
  matched: Detection | None = None
  for item in candidates:
    center = bbox_center(item.bbox)
    if not point_in_bbox(center, truck_bbox):
      continue
    overlap_ratio = bbox_intersection_ratio(item.bbox, truck_bbox)
    if overlap_ratio < 0.10 and bbox_iou(item.bbox, truck_bbox) < 0.10:
      continue
    if matched is None or item.confidence > matched.confidence:
      matched = item
  return matched


def _estimate_movement_ratio(
  truck_bbox,
  existing_tracks: dict[int, Track],
  movement_denominator: float,
  iou_threshold: float,
) -> float:
  best_previous_bbox = None
  best_iou = 0.0
  for track in existing_tracks.values():
    overlap = bbox_iou(track.bbox, truck_bbox)
    if overlap >= iou_threshold and overlap > best_iou:
      best_iou = overlap
      best_previous_bbox = track.bbox

  if best_previous_bbox is None or movement_denominator <= 0:
    return 0.0

  previous_center = bbox_center(best_previous_bbox)
  current_center = bbox_center(truck_bbox)
  distance = math.dist(previous_center, current_center)
  return distance / movement_denominator


def assess_dump_trucks(
  trucks: list[Detection],
  bed_open_detections: list[Detection],
  bed_closed_detections: list[Detection],
  roi_polygon,
  existing_tracks: dict[int, Track],
  movement_threshold: float,
  movement_denominator: float,
  iou_threshold: float,
) -> list[PersonAssessment]:
  assessments: list[PersonAssessment] = []

  for truck in trucks:
    in_roi = person_in_roi(truck.bbox, roi_polygon)
    matched_open = _match_state_detection(truck.bbox, bed_open_detections)
    matched_closed = _match_state_detection(truck.bbox, bed_closed_detections)
    movement_ratio = _estimate_movement_ratio(
      truck.bbox,
      existing_tracks,
      movement_denominator,
      iou_threshold,
    )
    is_moving = movement_ratio >= movement_threshold
    is_violation = in_roi and is_moving and matched_open is not None and matched_closed is None

    positive_confidence = matched_closed.confidence if matched_closed is not None else None
    violation_confidence = matched_open.confidence if is_violation and matched_open is not None else 0.0

    assessments.append(
      PersonAssessment(
        detection=truck,
        in_roi=in_roi,
        has_helmet=not is_violation,
        helmet_confidence=positive_confidence,
        violation_confidence=violation_confidence,
        assessment_state="violation" if is_violation else "compliant",
        positive_ppe_confidence=positive_confidence,
        violation_mode="bed-open-moving" if is_violation else None,
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

  detector = UltralyticsDetector(
    model_path=args.model_path,
    confidence_threshold=args.confidence_threshold,
    person_labels=args.truck_labels or ["dump-truck", "truck", "hauling-truck"],
    helmet_labels=[],
    image_size=args.image_size,
  )
  tracker = SimpleTracker(iou_threshold=args.iou_threshold)
  analyzed_fps = metadata["fps"] / max(1, args.frame_step) if metadata["fps"] > 0 else 0.0
  violation_on_frames = max(1, math.ceil(args.minimum_moving_seconds * max(analyzed_fps, 1.0)))
  manager = ViolationEventManager(
    video_path=str(video_path),
    roi_id=roi_id,
    output_dir=output_dir,
    event_type=args.event_type,
    violation_on_frames=violation_on_frames,
    clean_off_frames=2,
    veto_on_positive_evidence=True,
  )

  all_events = []
  best_frames = {}
  analyzed_frame_count = 0
  capture = detector.cv2.VideoCapture(str(video_path))
  if not capture.isOpened():
    raise SystemExit(f"Unable to open video for analysis: {video_path}")

  movement_denominator = max(float(metadata["width"]), float(metadata["height"]), 1.0)
  truck_labels = set(args.truck_labels or ["dump-truck", "truck", "hauling-truck"])
  bed_open_labels = set(args.bed_open_labels or ["bed-open", "bak-terbuka", "dump-bed-open"])
  bed_closed_labels = set(args.bed_closed_labels or ["bed-closed", "bak-tertutup", "dump-bed-closed"])

  frame_index = 0
  while True:
    ok, frame = capture.read()
    if not ok:
      break
    frame_index += 1
    if (frame_index - 1) % max(1, args.frame_step) != 0:
      continue

    analyzed_frame_count += 1
    detections = detector.predict(frame)
    trucks = [item for item in detections if item.label in truck_labels]
    bed_open_detections = [item for item in detections if item.label in bed_open_labels]
    bed_closed_detections = [item for item in detections if item.label in bed_closed_labels]
    assessments = assess_dump_trucks(
      trucks,
      bed_open_detections,
      bed_closed_detections,
      roi_polygon,
      tracker.tracks,
      args.movement_threshold,
      movement_denominator,
      args.iou_threshold,
    )
    time_seconds = (
      capture.get(detector.cv2.CAP_PROP_POS_MSEC) / 1000.0
      if capture.get(detector.cv2.CAP_PROP_POS_MSEC) > 0
      else ((frame_index - 1) / metadata["fps"] if metadata["fps"] > 0 else 0.0)
    )
    updates = tracker.update(frame_index, time_seconds, assessments)
    completed = manager.process_updates(tracker.tracks, updates)

    for event in completed:
      best_frame = best_frames.get(event.track_id)
      if best_frame is not None:
        best_frame_image, best_bbox, _best_frame_index = best_frame
        detector.annotate_and_save(best_frame_image, event, best_bbox, roi_polygon)
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
      detector.annotate_and_save(best_frame_image, event, best_bbox, roi_polygon)
    all_events.append(event)

  write_summary(
    output_dir,
    all_events,
    metadata,
    analyzed_frame_count,
    strip_positive_ppe_flags(tracker.tracks),
    args.finding_label,
    veto_on_positive_evidence=True,
  )
  print(json.dumps({"ok": True, "output_dir": str(output_dir), "event_count": len(all_events)}, indent=2))
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
