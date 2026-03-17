from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable


BBox = tuple[float, float, float, float]
Point = tuple[float, float]


@dataclass(frozen=True)
class Detection:
  label: str
  confidence: float
  bbox: BBox


@dataclass(frozen=True)
class PersonAssessment:
  detection: Detection
  in_roi: bool
  has_helmet: bool
  helmet_confidence: float | None
  violation_confidence: float


@dataclass
class EventCandidate:
  start_time_seconds: float
  max_confidence: float
  best_frame_index: int


@dataclass
class EventRecord:
  event_id: str
  video_path: str
  event_type: str
  start_time_seconds: float
  end_time_seconds: float
  max_confidence: float
  track_id: int
  snapshot_path: str
  roi_id: str


@dataclass
class Track:
  track_id: int
  bbox: BBox
  last_seen_frame: int
  first_seen_time_seconds: float
  last_seen_time_seconds: float
  observed_frame_count: int = 1
  seen_in_roi: bool = False
  last_violation_time_seconds: float | None = None
  violation_streak: int = 0
  clean_streak: int = 0
  candidate: EventCandidate | None = None
  active_event: EventCandidate | None = None
  closed_events: list[EventRecord] = field(default_factory=list)


@dataclass
class TrackUpdate:
  frame_index: int
  time_seconds: float
  assessment: PersonAssessment | None


def bbox_center(bbox: BBox) -> Point:
  x1, y1, x2, y2 = bbox
  return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)


def bbox_area(bbox: BBox) -> float:
  x1, y1, x2, y2 = bbox
  return max(0.0, x2 - x1) * max(0.0, y2 - y1)


def bbox_iou(left: BBox, right: BBox) -> float:
  lx1, ly1, lx2, ly2 = left
  rx1, ry1, rx2, ry2 = right
  ix1 = max(lx1, rx1)
  iy1 = max(ly1, ry1)
  ix2 = min(lx2, rx2)
  iy2 = min(ly2, ry2)
  intersection = bbox_area((ix1, iy1, ix2, iy2))
  if intersection <= 0:
    return 0.0

  union = bbox_area(left) + bbox_area(right) - intersection
  return 0.0 if union <= 0 else intersection / union


def bbox_intersection_ratio(inner: BBox, outer: BBox) -> float:
  ix1 = max(inner[0], outer[0])
  iy1 = max(inner[1], outer[1])
  ix2 = min(inner[2], outer[2])
  iy2 = min(inner[3], outer[3])
  intersection = bbox_area((ix1, iy1, ix2, iy2))
  area = bbox_area(inner)
  return 0.0 if area <= 0 else intersection / area


def point_in_polygon(point: Point, polygon: Iterable[Point]) -> bool:
  x, y = point
  vertices = list(polygon)
  if len(vertices) < 3:
    return False

  inside = False
  j = len(vertices) - 1
  for i in range(len(vertices)):
    xi, yi = vertices[i]
    xj, yj = vertices[j]
    intersects = ((yi > y) != (yj > y)) and (
      x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi
    )
    if intersects:
      inside = not inside
    j = i
  return inside


def top_band(person_bbox: BBox, ratio: float) -> BBox:
  x1, y1, x2, y2 = person_bbox
  height = max(0.0, y2 - y1)
  return (x1, y1, x2, y1 + (height * ratio))


def person_in_roi(person_bbox: BBox, roi_polygon: Iterable[Point]) -> bool:
  return point_in_polygon(bbox_center(person_bbox), roi_polygon)


def point_in_bbox(point: Point, bbox: BBox) -> bool:
  x, y = point
  x1, y1, x2, y2 = bbox
  return x1 <= x <= x2 and y1 <= y <= y2


def match_helmets_to_people(
  people: list[Detection],
  helmets: list[Detection],
  roi_polygon: Iterable[Point],
  top_ratio: float = 0.35,
  overlap_threshold: float = 0.3,
) -> list[PersonAssessment]:
  assessments: list[PersonAssessment] = []

  for person in people:
    in_roi = person_in_roi(person.bbox, roi_polygon)
    matched_helmet: Detection | None = None
    person_top = top_band(person.bbox, top_ratio)

    for helmet in helmets:
      center = bbox_center(helmet.bbox)
      if not point_in_polygon(center, [
        (person_top[0], person_top[1]),
        (person_top[2], person_top[1]),
        (person_top[2], person_top[3]),
        (person_top[0], person_top[3]),
      ]):
        continue
      overlap_ratio = bbox_intersection_ratio(helmet.bbox, person_top)
      if overlap_ratio < overlap_threshold:
        continue
      if matched_helmet is None or helmet.confidence > matched_helmet.confidence:
        matched_helmet = helmet

    has_helmet = matched_helmet is not None
    helmet_confidence = matched_helmet.confidence if matched_helmet else None
    violation_confidence = max(
      0.0,
      min(1.0, person.confidence - (helmet_confidence or 0.0) * 0.5),
    )
    assessments.append(
      PersonAssessment(
        detection=person,
        in_roi=in_roi,
        has_helmet=has_helmet,
        helmet_confidence=helmet_confidence,
        violation_confidence=violation_confidence,
      )
    )
  return assessments


def match_violation_detections_to_people(
  people: list[Detection],
  helmets: list[Detection],
  violations: list[Detection],
  roi_polygon: Iterable[Point],
  top_ratio: float = 0.35,
  helmet_overlap_threshold: float = 0.15,
  overlap_threshold: float = 0.1,
) -> list[PersonAssessment]:
  assessments: list[PersonAssessment] = []

  if not people:
    for violation in violations:
      assessments.append(
        PersonAssessment(
          detection=violation,
          in_roi=person_in_roi(violation.bbox, roi_polygon),
          has_helmet=False,
          helmet_confidence=None,
          violation_confidence=violation.confidence,
        )
      )
    return assessments

  for person in people:
    in_roi = person_in_roi(person.bbox, roi_polygon)
    matched_violation: Detection | None = None
    matched_helmet: Detection | None = None
    person_top = top_band(person.bbox, top_ratio)

    for helmet in helmets:
      center = bbox_center(helmet.bbox)
      if not point_in_polygon(center, [
        (person_top[0], person_top[1]),
        (person_top[2], person_top[1]),
        (person_top[2], person_top[3]),
        (person_top[0], person_top[3]),
      ]):
        continue
      overlap_ratio = bbox_intersection_ratio(helmet.bbox, person_top)
      if overlap_ratio < helmet_overlap_threshold:
        continue
      if matched_helmet is None or helmet.confidence > matched_helmet.confidence:
        matched_helmet = helmet

    for violation in violations:
      center = bbox_center(violation.bbox)
      if not point_in_bbox(center, person.bbox):
        continue
      overlap_ratio = bbox_intersection_ratio(violation.bbox, person.bbox)
      if overlap_ratio < overlap_threshold and bbox_iou(violation.bbox, person.bbox) < overlap_threshold:
        continue
      if matched_violation is None or violation.confidence > matched_violation.confidence:
        matched_violation = violation

    has_helmet = matched_helmet is not None
    helmet_confidence = matched_helmet.confidence if matched_helmet else None
    violation_confidence = 0.0
    if matched_violation is not None and not has_helmet:
      violation_confidence = matched_violation.confidence

    assessments.append(
      PersonAssessment(
        detection=person,
        in_roi=in_roi,
        has_helmet=has_helmet or matched_violation is None,
        helmet_confidence=helmet_confidence,
        violation_confidence=violation_confidence,
      )
    )
  return assessments


class SimpleTracker:
  def __init__(self, iou_threshold: float = 0.3) -> None:
    self._iou_threshold = iou_threshold
    self._next_track_id = 1
    self._tracks: dict[int, Track] = {}

  @property
  def tracks(self) -> dict[int, Track]:
    return self._tracks

  def update(self, frame_index: int, time_seconds: float, assessments: list[PersonAssessment]) -> dict[int, TrackUpdate]:
    updates: dict[int, TrackUpdate] = {}
    unmatched_track_ids = set(self._tracks.keys())
    unmatched_assessments = set(range(len(assessments)))

    pairs: list[tuple[float, int, int]] = []
    for track_id, track in self._tracks.items():
      for index, assessment in enumerate(assessments):
        iou = bbox_iou(track.bbox, assessment.detection.bbox)
        if iou >= self._iou_threshold:
          pairs.append((iou, track_id, index))

    for _iou, track_id, assessment_index in sorted(pairs, reverse=True):
      if track_id not in unmatched_track_ids or assessment_index not in unmatched_assessments:
        continue
      track = self._tracks[track_id]
      assessment = assessments[assessment_index]
      track.bbox = assessment.detection.bbox
      track.last_seen_frame = frame_index
      track.last_seen_time_seconds = time_seconds
      track.observed_frame_count += 1
      track.seen_in_roi = track.seen_in_roi or assessment.in_roi
      updates[track_id] = TrackUpdate(frame_index, time_seconds, assessment)
      unmatched_track_ids.remove(track_id)
      unmatched_assessments.remove(assessment_index)

    for assessment_index in unmatched_assessments:
      assessment = assessments[assessment_index]
      track = Track(
        track_id=self._next_track_id,
        bbox=assessment.detection.bbox,
        last_seen_frame=frame_index,
        first_seen_time_seconds=time_seconds,
        last_seen_time_seconds=time_seconds,
        seen_in_roi=assessment.in_roi,
      )
      self._tracks[track.track_id] = track
      updates[track.track_id] = TrackUpdate(frame_index, time_seconds, assessment)
      self._next_track_id += 1

    for track_id in unmatched_track_ids:
      track = self._tracks[track_id]
      updates[track_id] = TrackUpdate(frame_index, time_seconds, None)

    return updates


class ViolationEventManager:
  def __init__(
    self,
    video_path: str,
    roi_id: str,
    output_dir: Path,
    violation_on_frames: int = 3,
    clean_off_frames: int = 5,
  ) -> None:
    self.video_path = video_path
    self.roi_id = roi_id
    self.output_dir = output_dir
    self.violation_on_frames = violation_on_frames
    self.clean_off_frames = clean_off_frames
    self._event_counter = 1

  def process_updates(self, tracks: dict[int, Track], updates: dict[int, TrackUpdate]) -> list[EventRecord]:
    completed: list[EventRecord] = []
    for track_id, update in updates.items():
      track = tracks[track_id]
      assessment = update.assessment
      is_violation = bool(assessment and assessment.in_roi and not assessment.has_helmet)

      if is_violation and assessment:
        track.violation_streak += 1
        track.clean_streak = 0
        track.last_violation_time_seconds = update.time_seconds
        if track.violation_streak == 1:
          track.candidate = EventCandidate(
            start_time_seconds=update.time_seconds,
            max_confidence=assessment.violation_confidence,
            best_frame_index=update.frame_index,
          )
        elif track.candidate is not None and assessment.violation_confidence >= track.candidate.max_confidence:
          track.candidate.max_confidence = assessment.violation_confidence
          track.candidate.best_frame_index = update.frame_index

        if track.active_event is None and track.violation_streak >= self.violation_on_frames and track.candidate is not None:
          track.active_event = EventCandidate(
            start_time_seconds=track.candidate.start_time_seconds,
            max_confidence=track.candidate.max_confidence,
            best_frame_index=track.candidate.best_frame_index,
          )
      else:
        track.clean_streak += 1
        track.violation_streak = 0
        track.candidate = None

      if track.active_event is not None and assessment and is_violation and assessment.violation_confidence >= track.active_event.max_confidence:
        track.active_event.max_confidence = assessment.violation_confidence
        track.active_event.best_frame_index = update.frame_index

      should_close = track.active_event is not None and track.clean_streak >= self.clean_off_frames
      if should_close:
        completed.append(self._close_event(track))

    return completed

  def flush(self, tracks: dict[int, Track]) -> list[EventRecord]:
    completed: list[EventRecord] = []
    for track in tracks.values():
      if track.active_event is not None:
        track.clean_streak = self.clean_off_frames
        completed.append(self._close_event(track))
    return completed

  def _close_event(self, track: Track) -> EventRecord:
    assert track.active_event is not None
    end_time = track.last_violation_time_seconds or track.last_seen_time_seconds
    event_id = f"event-{self._event_counter:04d}"
    snapshot_path = str(self.output_dir / "snapshots" / f"{event_id}.jpg")
    record = EventRecord(
      event_id=event_id,
      video_path=self.video_path,
      event_type="no_helmet",
      start_time_seconds=track.active_event.start_time_seconds,
      end_time_seconds=end_time,
      max_confidence=track.active_event.max_confidence,
      track_id=track.track_id,
      snapshot_path=snapshot_path,
      roi_id=self.roi_id,
    )
    track.closed_events.append(record)
    track.active_event = None
    track.candidate = None
    track.violation_streak = 0
    track.clean_streak = 0
    self._event_counter += 1
    return record
