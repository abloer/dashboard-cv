from __future__ import annotations

import unittest
from pathlib import Path

from tools.no_helmet_analysis.core import (
  Detection,
  EventRecord,
  SimpleTracker,
  ViolationEventManager,
  match_helmets_to_people,
  match_violation_detections_to_people,
)
from tools.no_helmet_analysis.analyze_no_helmet import build_global_summary


class PipelineLogicTest(unittest.TestCase):
  def test_helmet_pairing_uses_top_band(self) -> None:
    roi = [(0, 0), (500, 0), (500, 500), (0, 500)]
    people = [Detection("person", 0.9, (100, 100, 220, 360))]
    helmets = [Detection("helmet", 0.8, (130, 100, 180, 160))]

    assessments = match_helmets_to_people(people, helmets, roi, top_ratio=0.35, overlap_threshold=0.3)

    self.assertTrue(assessments[0].in_roi)
    self.assertTrue(assessments[0].has_helmet)

  def test_person_outside_roi_is_not_violation_candidate(self) -> None:
    roi = [(0, 0), (80, 0), (80, 80), (0, 80)]
    people = [Detection("person", 0.9, (100, 100, 220, 360))]

    assessments = match_helmets_to_people(people, [], roi)

    self.assertFalse(assessments[0].in_roi)
    self.assertFalse(assessments[0].has_helmet)

  def test_event_smoothing_creates_single_event(self) -> None:
    tracker = SimpleTracker(iou_threshold=0.2)
    manager = ViolationEventManager(
      video_path="/tmp/input.mp4",
      roi_id="roi-1",
      output_dir=Path("/tmp/output"),
      violation_on_frames=3,
      clean_off_frames=5,
    )
    roi = [(0, 0), (500, 0), (500, 500), (0, 500)]
    all_events = []

    for frame_index in range(1, 13):
      detections = [Detection("person", 0.9, (100, 100, 220, 360))]
      helmets = [] if frame_index <= 6 else [Detection("helmet", 0.8, (130, 100, 180, 160))]
      assessments = match_helmets_to_people(detections, helmets, roi)
      updates = tracker.update(frame_index, frame_index / 10.0, assessments)
      all_events.extend(manager.process_updates(tracker.tracks, updates))

    all_events.extend(manager.flush(tracker.tracks))

    self.assertEqual(len(all_events), 1)
    self.assertEqual(all_events[0].event_type, "no_helmet")
    self.assertAlmostEqual(all_events[0].start_time_seconds, 0.1, places=2)
    self.assertGreaterEqual(all_events[0].end_time_seconds, 0.6)

  def test_direct_violation_labels_create_assessment(self) -> None:
    roi = [(0, 0), (500, 0), (500, 500), (0, 500)]
    people = [Detection("person", 0.95, (100, 100, 220, 360))]
    violations = [Detection("no-hardhat", 0.88, (110, 110, 210, 340))]

    assessments = match_violation_detections_to_people(people, [], violations, roi)

    self.assertEqual(len(assessments), 1)
    self.assertTrue(assessments[0].in_roi)
    self.assertFalse(assessments[0].has_helmet)
    self.assertAlmostEqual(assessments[0].violation_confidence, 0.88, places=2)

  def test_direct_violation_is_vetoed_when_hardhat_detected(self) -> None:
    roi = [(0, 0), (500, 0), (500, 500), (0, 500)]
    people = [Detection("person", 0.95, (100, 100, 220, 360))]
    helmets = [Detection("hardhat", 0.72, (130, 100, 175, 150))]
    violations = [Detection("no-hardhat", 0.90, (110, 110, 210, 340))]

    assessments = match_violation_detections_to_people(people, helmets, violations, roi)

    self.assertEqual(len(assessments), 1)
    self.assertTrue(assessments[0].has_helmet)
    self.assertAlmostEqual(assessments[0].helmet_confidence or 0, 0.72, places=2)
    self.assertAlmostEqual(assessments[0].violation_confidence, 0.0, places=2)

  def test_violation_mode_without_negative_label_is_not_flagged(self) -> None:
    roi = [(0, 0), (500, 0), (500, 500), (0, 500)]
    people = [Detection("person", 0.95, (100, 100, 220, 360))]

    assessments = match_violation_detections_to_people(people, [], [], roi)

    self.assertEqual(len(assessments), 1)
    self.assertTrue(assessments[0].has_helmet)
    self.assertAlmostEqual(assessments[0].violation_confidence, 0.0, places=2)

  def test_global_summary_groups_events_by_track(self) -> None:
    tracker = SimpleTracker(iou_threshold=0.2)
    roi = [(0, 0), (500, 0), (500, 500), (0, 500)]
    assessments = match_helmets_to_people(
      [Detection("person", 0.95, (100, 100, 220, 360))],
      [],
      roi,
    )
    updates = tracker.update(1, 0.1, assessments)
    self.assertEqual(len(updates), 1)
    track_id = next(iter(tracker.tracks))
    events = [
      EventRecord(
        event_id="event-0001",
        video_path="/tmp/input.mp4",
        event_type="no_helmet",
        start_time_seconds=5.75,
        end_time_seconds=8.75,
        max_confidence=0.58,
        track_id=track_id,
        snapshot_path="/tmp/snapshots/event-0001.jpg",
        roi_id="area-roi",
      ),
      EventRecord(
        event_id="event-0002",
        video_path="/tmp/input.mp4",
        event_type="no_helmet",
        start_time_seconds=18.30,
        end_time_seconds=19.04,
        max_confidence=0.47,
        track_id=track_id,
        snapshot_path="/tmp/snapshots/event-0002.jpg",
        roi_id="area-roi",
      ),
    ]

    summary = build_global_summary(events, tracker.tracks)

    self.assertEqual(summary["detected_track_count"], 1)
    self.assertEqual(summary["detected_tracks_in_roi_count"], 1)
    self.assertEqual(summary["stable_detected_track_count"], 1)
    self.assertEqual(summary["violator_count"], 1)
    self.assertEqual(summary["event_count"], 2)
    self.assertEqual(summary["snapshot_count"], 2)
    self.assertEqual(len(summary["detected_tracks"]), 1)
    self.assertEqual(len(summary["violators"]), 1)
    self.assertEqual(summary["violators"][0]["track_id"], track_id)
    self.assertEqual(summary["violators"][0]["event_count"], 2)
    self.assertIn("Estimasi jumlah orang yang terlihat di video adalah 1", summary["narrative"])
    self.assertIn("1 raw track", summary["narrative"])

  def test_global_summary_counts_detected_tracks_without_violations(self) -> None:
    tracker = SimpleTracker(iou_threshold=0.2)
    roi = [(0, 0), (500, 0), (500, 500), (0, 500)]
    assessments = match_helmets_to_people(
      [Detection("person", 0.95, (100, 100, 220, 360))],
      [Detection("hardhat", 0.8, (130, 100, 175, 150))],
      roi,
    )
    tracker.update(1, 0.1, assessments)

    summary = build_global_summary([], tracker.tracks)

    self.assertEqual(summary["detected_track_count"], 1)
    self.assertEqual(summary["detected_tracks_in_roi_count"], 1)
    self.assertEqual(summary["stable_detected_track_count"], 0)
    self.assertEqual(summary["violator_count"], 0)
    self.assertEqual(summary["event_count"], 0)
    self.assertIn("Tidak ada pelanggaran", summary["narrative"])


if __name__ == "__main__":
  unittest.main()
