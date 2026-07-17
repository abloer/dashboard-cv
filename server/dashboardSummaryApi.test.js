const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const testRuntimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-summary-api-test-"));
const mediaRegistryPath = path.join(testRuntimeRoot, "media-sources.json");
const analysisHistoryPath = path.join(testRuntimeRoot, "analysis-history.json");
const outputDir = path.join(testRuntimeRoot, "run-output");

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  mediaRegistryPath,
  JSON.stringify(
    [
      {
        id: "media-dashboard-1",
        version: 1,
        name: "Gate Camera",
        location: "North Gate",
        source: path.join(testRuntimeRoot, "gate.mp4"),
        type: "upload",
        status: "active",
        analytics: ["PPE"],
        executionMode: "manual",
        monitoringStatus: "idle",
        monitoringIntervalSeconds: null,
        createdAt: "2026-05-28T01:00:00.000Z",
        updatedAt: "2026-05-28T01:00:00.000Z",
      },
    ],
    null,
    2
  )
);
fs.writeFileSync(
  analysisHistoryPath,
  JSON.stringify(
    [
      {
        id: "run-dashboard-1",
        analysisType: "no_helmet",
        mediaSourceId: "media-dashboard-1",
        sourceName: "Gate Camera",
        location: "North Gate",
        videoPath: path.join(testRuntimeRoot, "gate.mp4"),
        outputDir,
        eventCount: 2,
        violatorCount: 1,
        stableDetectedTrackCount: 1,
        rawDetectedTrackCount: 2,
        createdAt: "2026-05-28T01:10:00.000Z",
      },
    ],
    null,
    2
  )
);

process.env.AUTH_REQUIRED = "true";
process.env.AUTH_TOKEN_OPERATOR = "test-operator-token";
process.env.AUTH_SESSION_SECRET = "test-session-secret";
process.env.ARTIFACT_URL_SECRET = "test-artifact-secret";
process.env.CORS_ORIGINS = "http://localhost:8080";
process.env.ANALYSIS_OUTPUT_ROOT = testRuntimeRoot;
process.env.MEDIA_REGISTRY_PATH = mediaRegistryPath;
process.env.ANALYSIS_HISTORY_PATH = analysisHistoryPath;

const { app } = require("./index");

const findRouteHandler = (method, routePath) => {
  const stack = [...app._router.stack];
  let layer = null;
  while (stack.length > 0 && !layer) {
    const item = stack.shift();
    if (item.route?.path === routePath && item.route?.methods?.[method.toLowerCase()]) {
      layer = item;
      break;
    }
    if (Array.isArray(item.handle?.stack)) {
      stack.push(...item.handle.stack);
    }
  }
  assert.ok(layer, `Route ${method} ${routePath} not found.`);
  const routeLayer = layer.route.stack.find((item) => item.method === method.toLowerCase());
  assert.ok(routeLayer, `Handler ${method} ${routePath} not found.`);
  return routeLayer.handle;
};

const invokeRoute = async (method, routePath, { params = {} } = {}) => {
  const handler = findRouteHandler(method, routePath);
  const req = { params };
  const res = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  await handler(req, res);
  return res;
};

describe("dashboard summary API boundary", () => {
  it("returns the existing dashboard summary response shape", async () => {
    const response = await invokeRoute("GET", "/dashboard-summary");

    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.ok, true);
    assert.equal(response.payload.summary.totalSources, 1);
    assert.equal(response.payload.summary.activeSources, 1);
    assert.equal(response.payload.summary.totalNoHelmetRuns, 1);
    assert.equal(response.payload.summary.totalNoHelmetEvents, 2);
    assert.equal(response.payload.summary.totalViolatorTracks, 1);
    assert.equal(response.payload.summary.sourceSummaries[0].mediaSourceId, "media-dashboard-1");
    assert.equal(response.payload.summary.sourceSummaries[0].runCount, 1);
    assert.equal(response.payload.summary.latestAnalysisSummary.id, "run-dashboard-1");
  });

  it("returns source latest analysis summaries and preserves 404 behavior", async () => {
    const response = await invokeRoute("GET", "/dashboard-summary/source/:id/latest-analysis", {
      params: { id: "media-dashboard-1" },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.ok, true);
    assert.equal(response.payload.source.id, "media-dashboard-1");
    assert.equal(response.payload.latestAnalysisSummary.id, "run-dashboard-1");
    assert.equal(response.payload.latestPpeByModule.noHelmet.id, "run-dashboard-1");

    const notFound = await invokeRoute("GET", "/dashboard-summary/source/:id/latest-analysis", {
      params: { id: "missing-source" },
    });
    assert.equal(notFound.statusCode, 404);
    assert.equal(notFound.payload.message, "Media source not found.");
  });
});
