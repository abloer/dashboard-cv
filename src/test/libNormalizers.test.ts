import assert from "node:assert/strict";
import { buildFindingsAggregate, type AnalysisFinding } from "@/lib/analysisFindings";
import {
  COMMUNITY_DEMO_PRESET,
  DEFAULT_NO_HELMET_CONFIG,
  STRICT_DISTANCE_PRESET,
  normalizeSavedNoHelmetConfig,
} from "@/lib/noHelmetConfig";
import {
  DEFAULT_NO_SAFETY_VEST_CONFIG,
  normalizeSavedNoSafetyVestConfig,
} from "@/lib/noSafetyVestConfig";
import {
  DEFAULT_RED_LIGHT_VIOLATION_CONFIG,
  normalizeSavedRedLightConfig,
} from "@/lib/redLightViolationConfig";

const makeFinding = (patch: Partial<AnalysisFinding>): AnalysisFinding => ({
  id: "finding-1",
  runId: "run-1",
  sourceId: "source-1",
  sourceName: "Gate Camera",
  sourceLocation: "Gate",
  sourceType: "upload",
  category: "PPE",
  moduleKey: "ppe.no-helmet",
  findingType: "violation",
  title: "No helmet",
  detail: "Worker without helmet.",
  recommendation: "Inspect PPE compliance.",
  severity: "high",
  status: "open",
  riskScore: 80,
  metric: null,
  eventCount: 1,
  violatorCount: 1,
  startsAtSeconds: 1,
  endsAtSeconds: 2,
  durationSeconds: 1,
  roiId: null,
  zoneIds: [],
  requiredPpe: [],
  trackIds: [],
  labels: [],
  snapshotUrl: null,
  evidenceUrls: [],
  detectorEvidence: {
    analysisType: null,
    outputDir: null,
    createdAt: null,
  },
  configSnapshot: {},
  metadata: {},
  createdAt: "2026-05-21T00:00:00.000Z",
  updatedAt: "2026-05-21T00:00:00.000Z",
  ...patch,
});

export const run = async () => {
  const normalizedNoHelmet = normalizeSavedNoHelmetConfig({
    modelPath: "/Users/local/dev/model.pt",
    personLabels: COMMUNITY_DEMO_PRESET.personLabels,
    helmetLabels: COMMUNITY_DEMO_PRESET.helmetLabels,
    violationLabels: COMMUNITY_DEMO_PRESET.violationLabels,
    confidenceThreshold: COMMUNITY_DEMO_PRESET.confidenceThreshold,
    iouThreshold: "0.30",
    topRatio: "0.35",
    helmetOverlapThreshold: "0.30",
    violationOnFrames: COMMUNITY_DEMO_PRESET.violationOnFrames,
    cleanOffFrames: COMMUNITY_DEMO_PRESET.cleanOffFrames,
    frameStep: COMMUNITY_DEMO_PRESET.frameStep,
    imageSize: COMMUNITY_DEMO_PRESET.imageSize,
  });

  assert.equal(normalizedNoHelmet.modelPath, DEFAULT_NO_HELMET_CONFIG.modelPath);
  assert.equal(normalizedNoHelmet.confidenceThreshold, STRICT_DISTANCE_PRESET.confidenceThreshold);
  assert.equal(normalizedNoHelmet.violationLabels, STRICT_DISTANCE_PRESET.violationLabels);

  const normalizedVest = normalizeSavedNoSafetyVestConfig({
    modelPath: "/Users/local/dev/vest.pt",
    confidenceThreshold: "0.15",
  });
  assert.equal(normalizedVest.modelPath, DEFAULT_NO_SAFETY_VEST_CONFIG.modelPath);
  assert.equal(normalizedVest.confidenceThreshold, "0.15");

  const normalizedRedLight = normalizeSavedRedLightConfig({
    modelSource: "manual",
    vehicleModelPath: "models/custom-vehicle.pt",
  });
  assert.equal(normalizedRedLight.modelSource, "manual");
  assert.equal(normalizedRedLight.vehicleModelPath, "models/custom-vehicle.pt");
  assert.equal(normalizedRedLight.trafficLightModelPath, DEFAULT_RED_LIGHT_VIOLATION_CONFIG.trafficLightModelPath);

  const aggregate = buildFindingsAggregate([
    makeFinding({ id: "open-high", severity: "high", status: "open", createdAt: "2026-05-21T10:00:00.000Z" }),
    makeFinding({
      id: "medium-ack",
      category: "HSE",
      moduleKey: "hse.safety-rules",
      severity: "medium",
      status: "acknowledged",
      createdAt: "2026-05-21T11:00:00.000Z",
    }),
    makeFinding({ id: "ignored", status: "uncertain", severity: "low", createdAt: "2026-05-21T12:00:00.000Z" }),
  ]);

  assert.equal(aggregate.totalFindings, 2);
  assert.equal(aggregate.openFindings, 1);
  assert.equal(aggregate.highSeverityCount, 1);
  assert.equal(aggregate.mediumSeverityCount, 1);
  assert.equal(aggregate.lowSeverityCount, 0);
  assert.equal(aggregate.categoryCounts.PPE, 1);
  assert.equal(aggregate.categoryCounts.HSE, 1);
  assert.equal(aggregate.moduleCounts["ppe.no-helmet"], 1);
  assert.equal(aggregate.moduleCounts["hse.safety-rules"], 1);
  assert.equal(aggregate.latestCreatedAt, "2026-05-21T11:00:00.000Z");
};
