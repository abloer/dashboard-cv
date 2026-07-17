const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const { createAnalysisSummaryHelpers } = require("./analysisSummaries");

const definitions = {
  no_helmet: {
    analysisType: "no_helmet",
    moduleKey: "ppe.no-helmet",
    findingType: "missing-helmet",
    findingLabel: "no helmet",
    title: "Pekerja tanpa helm terdeteksi",
    detailLabel: "no helmet",
    recommendation: "Tindak lanjuti pelanggaran helm.",
    requiredPpe: ["helmet"],
    labels: ["person", "helmet", "no-helmet"],
  },
};

const createHelpers = ({ history = [] } = {}) =>
  createAnalysisSummaryHelpers({
    dumpTruckBedOpenDefinition: {
      analysisType: "dump_truck_bed_open",
      moduleKey: "operations.dump-truck-bed-open",
      findingType: "dump-truck-bed-open",
      title: "Dump truck bergerak dengan bak terbuka",
      recommendation: "Verifikasi visual dump truck.",
      labels: ["dump-truck"],
    },
    fileExists: fs.existsSync,
    ppeAnalysisDefinitions: definitions,
    publicSnapshotUrl(_req, snapshotPath) {
      return `/signed/${path.basename(snapshotPath)}`;
    },
    readAnalysisHistory() {
      return history;
    },
    redLightViolationDefinition: {
      analysisType: "red_light_violation",
      moduleKey: "operations.red-light-violation",
      findingType: "red-light-violation",
      title: "Pelanggaran lampu merah terdeteksi",
      recommendation: "Verifikasi visual kendaraan.",
      labels: ["vehicle"],
    },
    workingAtHeightDefinition: {
      analysisType: "working_at_height",
      moduleKey: "hse.working-at-height",
      findingType: "working-at-height",
      title: "Aktivitas bekerja di ketinggian terdeteksi",
      recommendation: "Verifikasi area elevasi.",
      requiredPpe: ["helmet"],
      labels: ["person"],
    },
  });

describe("analysis summary helpers", () => {
  it("enriches detector summaries with signed snapshot URLs and findings", () => {
    const helpers = createHelpers();
    const summary = helpers.enrichSummary(
      { protocol: "http", get: () => "localhost:5173" },
      {
        event_count: 1,
        events: [
          {
            event_id: "event-1",
            event_type: "no_helmet",
            track_id: 7,
            roi_id: "roi-a",
            max_confidence: 0.91,
            start_time_seconds: 1,
            end_time_seconds: 4,
            snapshot_path: "/tmp/snapshot.jpg",
          },
        ],
      },
      {
        analysisType: "no_helmet",
        runId: "run-1",
        sourceId: "source-1",
        sourceName: "Camera 1",
      }
    );

    assert.equal(summary.events[0].snapshotUrl, "/signed/snapshot.jpg");
    assert.equal(summary.analysisFindings.length, 1);
    assert.equal(summary.analysisFindings[0].moduleKey, "ppe.no-helmet");
    assert.equal(summary.analysisFindings[0].severity, "high");
  });

  it("builds HSE safety reports from latest analysis history without changing shape", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "analysis-summary-helper-"));
    const outputDir = path.join(root, "run-1");
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(
      path.join(outputDir, "summary.json"),
      JSON.stringify({
        event_count: 1,
        duration_seconds: 10,
        global_summary: {
          violator_count: 1,
          snapshot_count: 1,
          narrative: "Helmet violation detected.",
        },
        events: [
          {
            event_id: "event-1",
            event_type: "no_helmet",
            track_id: 1,
            roi_id: "roi-a",
            max_confidence: 0.8,
            snapshot_path: path.join(outputDir, "snapshot.jpg"),
          },
        ],
      })
    );

    const helpers = createHelpers({
      history: [
        {
          id: "run-1",
          analysisType: "no_helmet",
          mediaSourceId: "source-1",
          sourceName: "Camera 1",
          location: "Pit A",
          outputDir,
          eventCount: 1,
          violatorCount: 1,
          createdAt: "2026-06-22T00:00:00.000Z",
        },
      ],
    });

    const report = helpers.buildHseSafetyRulesReport(
      { protocol: "http", get: () => "localhost:5173" },
      {
        id: "source-1",
        name: "Camera 1",
        location: "Pit A",
        type: "camera",
        status: "active",
        analytics: ["HSE"],
        executionMode: "scheduled",
        monitoringStatus: "running",
        monitoringIntervalSeconds: 30,
      },
      {
        modelPath: path.join(outputDir, "summary.json"),
        requiredPpe: "helmet,safety vest",
        restrictedZones: "zone-a",
      },
      { runId: "hse-run-1", createdAt: "2026-06-22T00:01:00.000Z", outputDir }
    );

    assert.equal(report.source.id, "source-1");
    assert.equal(report.readiness.totalCount, 4);
    assert.equal(report.latestEvidence.analysisType, "no_helmet");
    assert.equal(report.summary.latestNoHelmetEventCount, 1);
    assert.equal(Array.isArray(report.analysisFindings), true);
    assert.equal(report.summary.openFindingCount > 0, true);
  });
});
