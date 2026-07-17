const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const { createAnalysisBoundary } = require("./analysisRoutes");

class AnalysisJobConflictError extends Error {}

const findRouteHandler = (router, method, routePath) => {
  const layer = router.stack.find(
    (item) => item.route?.path === routePath && item.route?.methods?.[method.toLowerCase()]
  );
  assert.ok(layer, `Route ${method} ${routePath} not found.`);
  const routeLayer = layer.route.stack[layer.route.stack.length - 1];
  assert.ok(routeLayer, `Handler ${method} ${routePath} not found.`);
  return routeLayer.handle;
};

const invokeRoute = async (router, method, routePath, { body, params = {} } = {}) => {
  const handler = findRouteHandler(router, method, routePath);
  const req = {
    body,
    params,
    protocol: "http",
    get(name) {
      return name.toLowerCase() === "host" ? "localhost:5173" : undefined;
    },
  };
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

const createJobRepository = () => {
  const jobs = new Map();
  return {
    create(job) {
      const committed = { version: 1, ...job };
      jobs.set(committed.id, committed);
      return committed;
    },
    delete(id) {
      return jobs.delete(id);
    },
    get(id) {
      return jobs.get(id) || null;
    },
    list() {
      return Array.from(jobs.values());
    },
    update(id, patch) {
      const current = jobs.get(id);
      if (!current) return null;
      const next = {
        ...current,
        ...(typeof patch === "function" ? patch(current) : patch),
        version: Number(current.version || 0) + 1,
      };
      jobs.set(id, next);
      return next;
    },
  };
};

const createBoundary = ({ queueFailure } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "analysis-routes-"));
  const uploadRoot = path.join(root, "uploads");
  const modelRoot = path.join(root, "models");
  const configRoot = path.join(root, "configs");
  fs.mkdirSync(uploadRoot, { recursive: true });
  fs.mkdirSync(modelRoot, { recursive: true });
  fs.mkdirSync(configRoot, { recursive: true });

  const videoPath = path.join(uploadRoot, "clip.mp4");
  const modelPath = path.join(modelRoot, "ppe.pt");
  const roiConfigPath = path.join(configRoot, "roi.json");
  const scriptPath = path.join(root, "analyze.py");
  [videoPath, modelPath, roiConfigPath, scriptPath].forEach((item) => fs.writeFileSync(item, "{}"));

  const repository = createJobRepository();
  const contain = (allowedRoot, candidate, message) => {
    if (!candidate || !path.isAbsolute(candidate) || !fs.existsSync(candidate)) {
      const error = new Error(message);
      error.statusCode = 400;
      throw error;
    }
    const rootReal = fs.realpathSync.native(allowedRoot);
    const candidateReal = fs.realpathSync.native(candidate);
    const relativePath = path.relative(rootReal, candidateReal);
    if (relativePath === "" || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      const error = new Error(message);
      error.statusCode = 400;
      throw error;
    }
    return candidateReal;
  };

  const boundary = createAnalysisBoundary({
    AnalysisJobConflictError,
    analysisJobRepository: repository,
    analysisOutputRoot: root,
    analysisScriptPath: scriptPath,
    appendAnalysisHistory() {},
    buildHseSafetyRulesReport() {
      return {
        readiness: { readyCount: 1, totalCount: 1, items: [] },
        summary: { openFindingCount: 0, highSeverityCount: 0 },
      };
    },
    createAnalysisQueue({ jobRepository }) {
      return {
        enqueue(job) {
          if (queueFailure) {
            throw new Error(`/tmp/internal-path token=${queueFailure}`);
          }
          return jobRepository.create(job);
        },
        getQueuePosition() {
          return 1;
        },
        recover() {},
      };
    },
    defaultModelPath: modelPath,
    defaultRoiConfigPath: roiConfigPath,
    dumpTruckBedOpenScriptPath: scriptPath,
    enrichSummary(_req, summary) {
      return { ...summary, events: [], analysisFindings: [] };
    },
    env: {},
    fileExists: fs.existsSync,
    getLatestRunForSource() {
      return null;
    },
    getModuleConfig() {
      return { modelPath, roiConfigPath, requiredPpe: "helmet", restrictedZones: "zone-a" };
    },
    getPpeAnalysisDefinition() {
      return {
        analysisType: "no_helmet",
        eventType: "no_helmet",
        moduleKey: "ppe.no-helmet",
        findingLabel: "no helmet",
        matchRegion: "head",
      };
    },
    getSafeErrorLogMetadata(error) {
      return { message: error?.message || "error" };
    },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    operationalMetrics: {
      recordJobCompleted() {},
      recordJobFailed() {},
      recordJobQueued() {},
      recordJobStarted() {},
      setQueueDepth() {},
    },
    port: "5174",
    readHseSafetyRulesReport() {
      return null;
    },
    readMediaRegistry() {
      return [
        {
          id: "media-1",
          name: "Upload 1",
          location: "Pit",
          type: "upload",
          source: videoPath,
          analytics: ["PPE"],
        },
      ];
    },
    readModelVersions() {
      return [{ id: "model-1", moduleKey: "ppe.no-helmet", modelPath }];
    },
    resolveManagedConfigPath: (candidate) => contain(configRoot, candidate, "Config path is not allowed."),
    resolveManagedModelPath: (candidate) => contain(modelRoot, candidate, "Model path is not allowed."),
    resolveManagedVideoPath: (candidate) => contain(uploadRoot, candidate, "Video path is not allowed."),
    resolveModuleConfigEnvelope() {
      return {
        ok: true,
        resolvedModelPath: modelPath,
        config: { modelPath, roiConfigPath, vehicleModelPath: modelPath, trafficLightModelPath: modelPath },
        activeModel: { id: "model-1" },
        targetModuleKey: "ppe.no-helmet",
        usesDeploymentGate: false,
      };
    },
    runAnalysisCommand: async () => ({ stdout: "", stderr: "" }),
    uploadRoot,
    workingAtHeightScriptPath: scriptPath,
    redLightViolationScriptPath: scriptPath,
  });

  return {
    boundary,
    modelPath,
    repository,
    root,
    videoPath,
  };
};

describe("analysis route boundary", () => {
  it("returns existing defaults shape for analysis modules", async () => {
    const { boundary, modelPath, root } = createBoundary();

    const response = await invokeRoute(boundary.router, "GET", "/analysis/no-helmet/defaults");

    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.ok, true);
    assert.equal(response.payload.defaultModelPath, modelPath);
    assert.equal(response.payload.analysisOutputRoot, root);
    assert.equal(response.payload.serverPort, 5174);
    assert.deepEqual(response.payload.activeModel, { id: "model-1" });
  });

  it("queues an analysis job with resolved managed paths", async () => {
    const { boundary, repository, videoPath } = createBoundary();

    const response = await invokeRoute(boundary.router, "POST", "/analysis/no-helmet", {
      body: { mediaSourceId: "media-1", modelVersionId: "model-1" },
    });

    assert.equal(response.statusCode, 202);
    assert.equal(response.payload.ok, true);
    const job = repository.get(response.payload.jobId);
    assert.ok(job);
    assert.equal(job.status, "queued");
    assert.equal(job.mediaSourceId, "media-1");
    assert.equal(job.videoPath, fs.realpathSync.native(videoPath));
    assert.equal(job.commandArgs.includes("--video-path"), true);
  });

  it("returns sanitized job status responses", async () => {
    const { boundary } = createBoundary();
    const queued = await invokeRoute(boundary.router, "POST", "/analysis/no-helmet", {
      body: { mediaSourceId: "media-1" },
    });

    const response = await invokeRoute(boundary.router, "GET", "/analysis/no-helmet/jobs/:id", {
      params: { id: queued.payload.jobId },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.ok, true);
    assert.equal(response.payload.job.id, queued.payload.jobId);
    assert.equal(response.payload.job.queuePosition, 1);
  });

  it("rejects invalid payloads with HTTP 400", async () => {
    const { boundary } = createBoundary();

    const response = await invokeRoute(boundary.router, "POST", "/analysis/no-helmet", {
      body: { roiPolygon: [[0, 0]] },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.payload.ok, false);
    assert.equal(response.payload.message, "Invalid analysis payload");
  });

  it("rejects unmanaged paths without leaking the raw path", async () => {
    const { boundary, modelPath } = createBoundary();
    const unmanagedPath = path.join(os.tmpdir(), `unmanaged-${Date.now()}.mp4`);
    fs.writeFileSync(unmanagedPath, "video");

    const response = await invokeRoute(boundary.router, "POST", "/analysis/no-helmet", {
      body: { videoPath: unmanagedPath, modelPath },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.payload.message, "Video path is not allowed.");
    assert.doesNotMatch(JSON.stringify(response.payload), new RegExp(unmanagedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("sanitizes queue failure responses", async () => {
    const { boundary } = createBoundary({ queueFailure: "secret-token" });

    const response = await invokeRoute(boundary.router, "POST", "/analysis/no-helmet", {
      body: { mediaSourceId: "media-1" },
    });

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.payload, {
      ok: false,
      message: "Analysis failed",
      stdout: "",
      stderr: "",
    });
    assert.doesNotMatch(JSON.stringify(response.payload), /secret-token|internal-path/);
  });
});
