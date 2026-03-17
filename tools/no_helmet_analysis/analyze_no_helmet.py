from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
from dataclasses import asdict
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
  sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from tools.no_helmet_analysis.core import (
  Detection,
  EventRecord,
  SimpleTracker,
  Track,
  ViolationEventManager,
  match_helmets_to_people,
  match_violation_detections_to_people,
)


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Analyze a video file and generate no-helmet violation events."
  )
  parser.add_argument("--video-path", required=True, help="Path to the input video.")
  parser.add_argument("--roi-config-path", required=True, help="Path to the ROI JSON config.")
  parser.add_argument("--output-dir", required=True, help="Directory for summary and snapshots.")
  parser.add_argument("--model-path", required=True, help="Path to a PPE model with person and helmet classes.")
  parser.add_argument("--person-label", action="append", dest="person_labels", default=["person"])
  parser.add_argument("--helmet-label", action="append", dest="helmet_labels", default=["helmet", "hardhat"])
  parser.add_argument("--violation-label", action="append", dest="violation_labels", default=[])
  parser.add_argument("--confidence-threshold", type=float, default=0.2)
  parser.add_argument("--iou-threshold", type=float, default=0.3)
  parser.add_argument("--top-ratio", type=float, default=0.35)
  parser.add_argument("--helmet-overlap-threshold", type=float, default=0.3)
  parser.add_argument("--violation-on-frames", type=int, default=2)
  parser.add_argument("--clean-off-frames", type=int, default=2)
  parser.add_argument("--frame-step", type=int, default=5, help="Analyze every Nth frame.")
  parser.add_argument("--image-size", type=int, default=960, help="YOLO inference image size.")
  parser.add_argument("--keep-frames", action="store_true", help="Keep extracted frames on disk.")
  return parser.parse_args()


def require_binary(binary_name: str) -> None:
  import shutil
  if shutil.which(binary_name) is None:
    raise SystemExit(
      f"Missing required binary '{binary_name}'. Install ffmpeg/ffprobe before running this pipeline."
    )


def load_roi_config(path: Path) -> tuple[str, list[tuple[float, float]], bool]:
  data = json.loads(path.read_text())
  roi_id = data.get("roi_id", "default-roi")
  polygon = data.get("polygon")
  normalized = bool(data.get("normalized", False))
  if not isinstance(polygon, list) or len(polygon) < 3:
    raise SystemExit("ROI config must contain a polygon with at least 3 points.")
  points = [(float(point[0]), float(point[1])) for point in polygon]
  return roi_id, points, normalized


def ffprobe_metadata(video_path: Path) -> dict[str, Any]:
  command = [
    "ffprobe",
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,avg_frame_rate,nb_frames,duration",
    "-of",
    "json",
    str(video_path),
  ]
  result = subprocess.run(command, capture_output=True, text=True, check=True)
  payload = json.loads(result.stdout)
  stream = payload["streams"][0]
  fps = parse_rate(stream["avg_frame_rate"])
  duration = float(stream.get("duration") or 0.0)
  width = int(stream["width"])
  height = int(stream["height"])
  return {
    "fps": fps,
    "duration_seconds": duration,
    "width": width,
    "height": height,
  }


def parse_rate(value: str) -> float:
  numerator, denominator = value.split("/")
  denominator_value = float(denominator)
  return 0.0 if denominator_value == 0 else float(numerator) / denominator_value


class UltralyticsDetector:
  def __init__(
    self,
    model_path: str,
    confidence_threshold: float,
    person_labels: list[str],
    helmet_labels: list[str],
    image_size: int,
  ) -> None:
    try:
      import cv2
      from ultralytics import YOLO
    except ModuleNotFoundError as exc:
      raise SystemExit(
        "Missing Python dependencies. Install the packages from "
        "tools/no_helmet_analysis/requirements.txt before running this pipeline."
      ) from exc

    self.cv2 = cv2
    self.model = YOLO(model_path)
    self.confidence_threshold = confidence_threshold
    self.image_size = image_size
    self.person_labels = {label.lower() for label in person_labels}
    self.helmet_labels = {label.lower() for label in helmet_labels}
    self.violation_labels = {label.lower() for label in []}

  def predict(self, frame) -> list[Detection]:
    results = self.model.predict(
      frame,
      verbose=False,
      conf=self.confidence_threshold,
      imgsz=self.image_size,
    )
    detections: list[Detection] = []
    for result in results:
      names = result.names
      for box in result.boxes:
        cls_id = int(box.cls.item())
        label = str(names[cls_id]).lower()
        confidence = float(box.conf.item())
        x1, y1, x2, y2 = [float(value) for value in box.xyxy[0].tolist()]
        detections.append(Detection(label=label, confidence=confidence, bbox=(x1, y1, x2, y2)))
    return detections

  def annotate_and_save(
    self,
    frame,
    event: EventRecord,
    track_bbox: tuple[float, float, float, float],
    roi_polygon: list[tuple[float, float]],
  ) -> None:
    annotated = frame.copy()
    for index in range(len(roi_polygon)):
      start = roi_polygon[index]
      end = roi_polygon[(index + 1) % len(roi_polygon)]
      self.cv2.line(
        annotated,
        (int(start[0]), int(start[1])),
        (int(end[0]), int(end[1])),
        (0, 255, 255),
        2,
      )
    x1, y1, x2, y2 = [int(value) for value in track_bbox]
    self.cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 0, 255), 2)
    label = f"{event.event_type} track={event.track_id} conf={event.max_confidence:.2f}"
    self.cv2.putText(
      annotated,
      label,
      (x1, max(30, y1 - 10)),
      self.cv2.FONT_HERSHEY_SIMPLEX,
      0.7,
      (0, 0, 255),
      2,
      self.cv2.LINE_AA,
    )
    snapshot_path = Path(event.snapshot_path)
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    self.cv2.imwrite(str(snapshot_path), annotated)


def normalize_roi(
  polygon: list[tuple[float, float]],
  width: int,
  height: int,
  normalized: bool,
) -> list[tuple[float, float]]:
  if not normalized:
    return polygon
  return [(x * width, y * height) for x, y in polygon]


def is_stable_track(track_summary: dict[str, Any]) -> bool:
  # Treat very short-lived IDs as tracker fragments unless they also carry a violation event.
  return track_summary["event_count"] > 0 or track_summary["observed_frame_count"] >= 10


def build_global_summary(events: list[EventRecord], tracks: dict[int, Track]) -> dict[str, Any]:
  detected_tracks: list[dict[str, Any]] = []
  events_by_track: dict[int, list[EventRecord]] = {}
  for event in events:
    events_by_track.setdefault(event.track_id, []).append(event)

  for track in sorted(tracks.values(), key=lambda item: item.track_id):
    track_events = sorted(events_by_track.get(track.track_id, []), key=lambda item: item.start_time_seconds)
    detected_tracks.append(
      {
        "track_id": track.track_id,
        "in_roi": track.seen_in_roi,
        "observed_frame_count": track.observed_frame_count,
        "first_seen_seconds": track.first_seen_time_seconds,
        "last_seen_seconds": track.last_seen_time_seconds,
        "event_count": len(track_events),
        "snapshot_count": sum(1 for event in track_events if event.snapshot_path),
        "max_violation_confidence": max((event.max_confidence for event in track_events), default=0.0),
        "total_violation_duration_seconds": sum(
          max(0.0, event.end_time_seconds - event.start_time_seconds) for event in track_events
        ),
        "roi_ids": sorted({event.roi_id for event in track_events}),
        "event_ids": [event.event_id for event in track_events],
      }
    )

  detected_track_count = len(detected_tracks)
  detected_tracks_in_roi_count = sum(1 for track in detected_tracks if track["in_roi"])
  stable_detected_tracks = [track for track in detected_tracks if is_stable_track(track)]
  stable_detected_track_count = len(stable_detected_tracks)
  stable_detected_tracks_in_roi_count = sum(1 for track in stable_detected_tracks if track["in_roi"])

  if not detected_tracks:
    return {
      "detected_track_count": 0,
      "detected_tracks_in_roi_count": 0,
      "stable_detected_track_count": 0,
      "stable_detected_tracks_in_roi_count": 0,
      "violator_count": 0,
      "event_count": 0,
      "snapshot_count": 0,
      "first_event_seconds": None,
      "last_event_seconds": None,
      "total_violation_duration_seconds": 0.0,
      "narrative": "Tidak ada orang yang terdeteksi pada video yang dianalisis.",
      "detected_tracks": [],
      "stable_detected_tracks": [],
      "violators": [],
    }

  grouped: dict[int, dict[str, Any]] = {}
  snapshot_count = 0
  total_violation_duration_seconds = 0.0

  for event in events:
    total_violation_duration_seconds += max(0.0, event.end_time_seconds - event.start_time_seconds)
    if event.snapshot_path:
      snapshot_count += 1

    summary = grouped.setdefault(
      event.track_id,
      {
        "track_id": event.track_id,
        "event_count": 0,
        "snapshot_count": 0,
        "first_event_seconds": event.start_time_seconds,
        "last_event_seconds": event.end_time_seconds,
        "max_confidence": event.max_confidence,
        "total_violation_duration_seconds": 0.0,
        "roi_ids": set(),
        "event_ids": [],
      },
    )
    summary["event_count"] += 1
    summary["snapshot_count"] += 1 if event.snapshot_path else 0
    summary["first_event_seconds"] = min(summary["first_event_seconds"], event.start_time_seconds)
    summary["last_event_seconds"] = max(summary["last_event_seconds"], event.end_time_seconds)
    summary["max_confidence"] = max(summary["max_confidence"], event.max_confidence)
    summary["total_violation_duration_seconds"] += max(0.0, event.end_time_seconds - event.start_time_seconds)
    summary["roi_ids"].add(event.roi_id)
    summary["event_ids"].append(event.event_id)

  violators = [
    {
      **summary,
      "roi_ids": sorted(summary["roi_ids"]),
    }
    for summary in sorted(grouped.values(), key=lambda item: item["track_id"])
  ]

  first_event_seconds = min((event.start_time_seconds for event in events), default=None)
  last_event_seconds = max((event.end_time_seconds for event in events), default=None)
  violator_count = len(violators)
  if len(events) == 0:
    narrative = (
      f"Estimasi jumlah orang yang terlihat di video adalah {stable_detected_track_count}, "
      f"berdasarkan track stabil yang berhasil dipertahankan sistem. "
      f"Sebagai detail teknis, tracker sempat membuat {detected_track_count} raw track dan "
      f"{stable_detected_tracks_in_roi_count} track stabil berada di area kerja/ROI. "
      "Tidak ada pelanggaran no helmet yang tercatat pada run ini."
    )
  else:
    narrative = (
      f"Estimasi jumlah orang yang terlihat di video adalah {stable_detected_track_count}, "
      f"berdasarkan track stabil yang berhasil dipertahankan sistem. "
      f"Dari jumlah tersebut, {stable_detected_tracks_in_roi_count} berada di area kerja/ROI dan "
      f"{violator_count} pekerja/track unik melakukan pelanggaran no helmet. "
      f"Sebagai detail teknis, tracker sempat membuat {detected_track_count} raw track. "
      f"Sistem mencatat {len(events)} event dengan {snapshot_count} screencapture bukti "
      f"pada rentang {(first_event_seconds or 0.0):.2f} s sampai {(last_event_seconds or 0.0):.2f} s."
    )

  return {
    "detected_track_count": detected_track_count,
    "detected_tracks_in_roi_count": detected_tracks_in_roi_count,
    "stable_detected_track_count": stable_detected_track_count,
    "stable_detected_tracks_in_roi_count": stable_detected_tracks_in_roi_count,
    "violator_count": violator_count,
    "event_count": len(events),
    "snapshot_count": snapshot_count,
    "first_event_seconds": first_event_seconds,
    "last_event_seconds": last_event_seconds,
    "total_violation_duration_seconds": total_violation_duration_seconds,
    "narrative": narrative,
    "detected_tracks": detected_tracks,
    "stable_detected_tracks": stable_detected_tracks,
    "violators": violators,
  }


def write_summary(
  output_dir: Path,
  events: list[EventRecord],
  metadata: dict[str, Any],
  analyzed_frame_count: int,
  tracks: dict[int, Track],
) -> None:
  output_dir.mkdir(parents=True, exist_ok=True)
  summary = {
    "video_path": metadata["video_path"],
    "duration_seconds": metadata["duration_seconds"],
    "fps": metadata["fps"],
    "frame_width": metadata["width"],
    "frame_height": metadata["height"],
    "analyzed_frame_count": analyzed_frame_count,
    "event_count": len(events),
    "global_summary": build_global_summary(events, tracks),
    "events": [asdict(event) for event in events],
  }
  (output_dir / "summary.json").write_text(json.dumps(summary, indent=2))

  csv_path = output_dir / "events.csv"
  with csv_path.open("w", newline="") as handle:
    writer = csv.DictWriter(
      handle,
      fieldnames=[
        "event_id",
        "video_path",
        "event_type",
        "start_time_seconds",
        "end_time_seconds",
        "max_confidence",
        "track_id",
        "snapshot_path",
        "roi_id",
      ],
    )
    writer.writeheader()
    for event in events:
      writer.writerow(asdict(event))


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
    person_labels=args.person_labels,
    helmet_labels=args.helmet_labels,
    image_size=args.image_size,
  )
  detector.violation_labels = {label.lower() for label in args.violation_labels}
  tracker = SimpleTracker(iou_threshold=args.iou_threshold)
  manager = ViolationEventManager(
    video_path=str(video_path),
    roi_id=roi_id,
    output_dir=output_dir,
    violation_on_frames=args.violation_on_frames,
    clean_off_frames=args.clean_off_frames,
  )

  all_events: list[EventRecord] = []
  best_frames: dict[int, tuple[Any, tuple[float, float, float, float], int]] = {}
  analyzed_frame_count = 0

  capture = detector.cv2.VideoCapture(str(video_path))
  if not capture.isOpened():
    raise SystemExit(f"Unable to open video for analysis: {video_path}")

  persisted_dir = output_dir / "decoded_frames"
  if args.keep_frames:
    persisted_dir.mkdir(parents=True, exist_ok=True)

  frame_index = 0
  while True:
      ok, frame = capture.read()
      if not ok:
        break
      frame_index += 1
      if (frame_index - 1) % max(1, args.frame_step) != 0:
        continue

      analyzed_frame_count += 1
      if args.keep_frames:
        detector.cv2.imwrite(str(persisted_dir / f"frame-{frame_index:06d}.jpg"), frame)
      detections = detector.predict(frame)
      people = [d for d in detections if d.label in detector.person_labels]
      helmets = [d for d in detections if d.label in detector.helmet_labels]
      direct_violations = [d for d in detections if d.label in detector.violation_labels]
      if detector.violation_labels:
        assessments = match_violation_detections_to_people(
          people=people,
          helmets=helmets,
          violations=direct_violations,
          roi_polygon=roi_polygon,
          top_ratio=args.top_ratio,
          helmet_overlap_threshold=args.helmet_overlap_threshold,
          overlap_threshold=args.helmet_overlap_threshold,
        )
      else:
        assessments = match_helmets_to_people(
          people=people,
          helmets=helmets,
          roi_polygon=roi_polygon,
          top_ratio=args.top_ratio,
          overlap_threshold=args.helmet_overlap_threshold,
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

  write_summary(output_dir, all_events, metadata, analyzed_frame_count, tracker.tracks)
  print(json.dumps({"ok": True, "output_dir": str(output_dir), "event_count": len(all_events)}, indent=2))
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
