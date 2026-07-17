const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const testRuntimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-cv-server-test-"));
const testUploadRoot = path.join(testRuntimeRoot, "uploads");
const testModelRoot = path.join(testRuntimeRoot, "models");
fs.mkdirSync(testUploadRoot, { recursive: true });
fs.mkdirSync(testModelRoot, { recursive: true });
const testVideoPath = path.join(testUploadRoot, "managed-video.mp4");
const testModelPath = path.join(testModelRoot, "managed-model.pt");
fs.writeFileSync(testVideoPath, "not-a-real-video");
fs.writeFileSync(testModelPath, "not-a-real-model");

process.env.AUTH_REQUIRED = "true";
process.env.AUTH_TOKEN_VIEWER = "test-viewer-token";
process.env.AUTH_TOKEN_OPERATOR = "test-operator-token";
process.env.AUTH_TOKEN_ADMIN = "test-admin-token";
process.env.AUTH_SESSION_SECRET = "test-session-secret";
process.env.AUTH_SESSION_EXCHANGE_ENABLED = "true";
process.env.AUTH_SESSION_EXCHANGE_KEY = "test-exchange-key";
process.env.ARTIFACT_URL_SECRET = "test-artifact-secret";
process.env.CORS_ORIGINS = "http://localhost:5173,http://localhost:8080";
process.env.ANALYSIS_OUTPUT_ROOT = testRuntimeRoot;
process.env.ANALYSIS_DEFAULT_MODEL_PATH = testModelPath;
process.env.ANALYSIS_ALLOWED_MODEL_ROOTS = fs.realpathSync.native(testModelRoot);

const {
  authenticateRequest,
  cleanupAnalysisArtifacts,
  createAuthSessionForExchange,
  createArtifactSignature,
  createOperationalMetrics,
  createRateLimiter,
  createRequestContextMiddleware,
  createSessionToken,
  createStructuredLogger,
  getRequiredRole,
  isCorsOriginAllowed,
  resolveModuleAnalysisInputPaths,
  resolveArtifactRequestPath,
  resolveManagedModelPath,
  resolveManagedVideoPath,
  resolvePpeAnalysisInputPaths,
  resolveRedLightAnalysisInputPaths,
  renderPrometheusMetrics,
  validateMediaSourcePayloadForStorage,
  validateAuthRuntimeConfig,
  validateSourcePreviewInput,
  verifyArtifactSignature,
} = require("./index");

const createReq = ({ method = "GET", path = "/media-sources", token, cookie, query, originalUrl } = {}) => ({
  method,
  path,
  query: query || {},
  originalUrl: originalUrl || path,
  url: originalUrl || path,
  header(name) {
    if (name.toLowerCase() === "authorization" && token) {
      return `Bearer ${token}`;
    }
    if (name.toLowerCase() === "cookie" && cookie) {
      return cookie;
    }
    return undefined;
  },
});

const createContextRes = () => {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.setHeader = (name, value) => {
    res.headers[name.toLowerCase()] = value;
  };
  return res;
};

const createRes = () => {
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
  return res;
};

const runAuth = (req) => {
  const res = createRes();
  let nextCalled = false;
  authenticateRequest(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
};

describe("API auth, RBAC, and CORS boundary", () => {
  it("treats health checks as public", () => {
    assert.equal(getRequiredRole(createReq({ path: "/health" })), null);
  });

  it("requires a bearer token for protected mutation endpoints", () => {
    const { res, nextCalled } = runAuth(createReq({ method: "POST", path: "/media-sources" }));

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.payload.ok, false);
  });

  it("allows viewer tokens on read-only endpoints", () => {
    const req = createReq({ method: "GET", path: "/media-sources", token: "test-viewer-token" });
    const { res, nextCalled } = runAuth(req);

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
    assert.equal(req.auth.role, "viewer");
  });

  it("rejects viewer tokens on mutation endpoints", () => {
    const { res, nextCalled } = runAuth(
      createReq({ method: "POST", path: "/media-sources", token: "test-viewer-token" })
    );

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.payload.ok, false);
  });

  it("allows operator tokens on mutation endpoints", () => {
    const req = createReq({ method: "POST", path: "/media-sources", token: "test-operator-token" });
    const { res, nextCalled } = runAuth(req);

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
    assert.equal(req.auth.role, "operator");
  });

  it("allows signed httpOnly session cookies instead of frontend bearer tokens", () => {
    const sessionToken = createSessionToken({ role: "operator", subject: "test-operator" });
    const req = createReq({
      method: "POST",
      path: "/media-sources",
      cookie: `cv_session=${encodeURIComponent(sessionToken)}`,
    });
    const { res, nextCalled } = runAuth(req);

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
    assert.equal(req.auth.role, "operator");
  });

  it("guards auth session exchange and rejects invalid tokens", () => {
    assert.throws(
      () => createAuthSessionForExchange({ token: "bad-token", exchangeKey: "test-exchange-key" }),
      /Token is invalid/
    );
    assert.throws(
      () =>
        createAuthSessionForExchange({
          token: "test-operator-token",
          exchangeKey: "wrong-exchange-key",
        }),
      /exchange key is invalid/
    );

    const session = createAuthSessionForExchange({
      token: "test-operator-token",
      exchangeKey: "test-exchange-key",
    });
    assert.equal(session.identity.role, "operator");
    assert.equal(typeof session.sessionToken, "string");
  });

  it("requires admin tokens for sync", () => {
    const operatorResult = runAuth(
      createReq({ method: "POST", path: "/sync", token: "test-operator-token" })
    );
    const adminReq = createReq({ method: "POST", path: "/sync", token: "test-admin-token" });
    const adminResult = runAuth(adminReq);

    assert.equal(operatorResult.nextCalled, false);
    assert.equal(operatorResult.res.statusCode, 403);
    assert.equal(adminResult.nextCalled, true);
    assert.equal(adminReq.auth.role, "admin");
  });

  it("requires admin tokens for metrics", () => {
    const viewerResult = runAuth(
      createReq({ method: "GET", path: "/metrics", token: "test-viewer-token" })
    );
    const adminReq = createReq({ method: "GET", path: "/metrics", token: "test-admin-token" });
    const adminResult = runAuth(adminReq);

    assert.equal(getRequiredRole(createReq({ method: "GET", path: "/metrics" })), "admin");
    assert.equal(viewerResult.nextCalled, false);
    assert.equal(viewerResult.res.statusCode, 403);
    assert.equal(adminResult.nextCalled, true);
    assert.equal(adminReq.auth.role, "admin");
  });

  it("renders operational metrics without raw request bodies or secrets", () => {
    const metrics = createOperationalMetrics();
    metrics.recordRequest({
      method: "GET",
      path: "/media-sources/media-123/status?token=secret",
      status: 200,
      durationMs: 73,
    });
    metrics.recordJobQueued({ moduleKey: "ppe.no-helmet" });
    metrics.recordJobStarted({ moduleKey: "ppe.no-helmet" });
    metrics.recordJobCompleted({ moduleKey: "ppe.no-helmet", durationMs: 1250 });
    metrics.recordJobFailed({ moduleKey: "ppe.no-helmet", durationMs: 300, failureType: "python" });
    metrics.recordUpload(4096);
    metrics.setQueueDepth(2);

    const rendered = renderPrometheusMetrics({ metrics, diskUsageBytes: 8192 });

    assert.match(rendered, /dashboard_api_requests_total\{method="GET",path="\/media-sources\/\{id\}\/status",status="200"\} 1/);
    assert.match(rendered, /dashboard_analysis_jobs_total\{moduleKey="ppe.no-helmet",status="completed"\} 1/);
    assert.match(rendered, /dashboard_analysis_ffmpeg_python_failures_total\{moduleKey="ppe.no-helmet",failureType="python"\} 1/);
    assert.match(rendered, /dashboard_upload_bytes_total 4096/);
    assert.match(rendered, /dashboard_runtime_analysis_disk_usage_bytes 8192/);
    assert.equal(rendered.includes("secret"), false);
    assert.equal(rendered.includes("media-123"), false);
  });

  it("applies the configured CORS origin allowlist", () => {
    assert.equal(isCorsOriginAllowed("http://localhost:5173"), true);
    assert.equal(isCorsOriginAllowed("http://localhost:8080"), true);
    assert.equal(isCorsOriginAllowed("https://evil.example"), false);
  });

  it("fails auth runtime validation for placeholder production secrets", () => {
    assert.throws(
      () =>
        validateAuthRuntimeConfig({
          AUTH_REQUIRED: "true",
          AUTH_SESSION_SECRET: "replace-with-a-long-random-session-secret",
          ARTIFACT_URL_SECRET: "replace-with-a-long-random-artifact-secret",
          AUTH_JWT_SECRET: "",
          AUTH_SESSION_EXCHANGE_ENABLED: "false",
        }),
      /Invalid auth configuration/
    );
  });

  it("passes auth runtime validation with guarded session exchange", () => {
    assert.deepEqual(
      validateAuthRuntimeConfig({
        AUTH_REQUIRED: "true",
        AUTH_SESSION_SECRET: "session-secret",
        ARTIFACT_URL_SECRET: "artifact-secret",
        AUTH_TOKEN_OPERATOR: "operator-token",
        AUTH_SESSION_EXCHANGE_ENABLED: "true",
        AUTH_SESSION_EXCHANGE_KEY: "exchange-secret",
      }),
      { ok: true }
    );
  });

  it("enforces simple in-memory rate limits", () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 2 });

    assert.equal(limiter.consume("client-a", 0).allowed, true);
    assert.equal(limiter.consume("client-a", 100).allowed, true);
    assert.equal(limiter.consume("client-a", 200).allowed, false);
    assert.equal(limiter.consume("client-a", 1200).allowed, true);
  });

  it("adds request id response header and logs structured request context", () => {
    const logLines = [];
    const testLogger = createStructuredLogger({
      sink: {
        log(line) {
          logLines.push(JSON.parse(line));
        },
      },
      now: () => "2026-05-26T00:00:00.000Z",
    });
    const middleware = createRequestContextMiddleware(testLogger);
    const req = createReq({
      method: "GET",
      path: "/media-sources",
      originalUrl: "/media-sources?token=secret",
    });
    req.auth = { role: "viewer", subject: "session-user-123" };
    const res = createContextRes();
    let nextCalled = false;

    middleware(req, res, () => {
      nextCalled = true;
    });
    res.emit("finish");

    assert.equal(nextCalled, true);
    assert.match(res.headers["x-request-id"], /^[A-Za-z0-9._:-]{1,128}$/);
    assert.equal(req.requestId, res.headers["x-request-id"]);
    assert.equal(logLines[0].event, "request_start");
    assert.equal(logLines[0].path, "/media-sources");
    assert.equal(logLines[1].event, "request_end");
    assert.equal(logLines[1].requestId, req.requestId);
    assert.equal(logLines[1].role, "viewer");
    assert.equal(logLines[1].authSubjectType, "authenticated");
    assert.equal("token" in logLines[1], false);
  });

  it("validates signed artifact URLs and rejects expired signatures", () => {
    const encodedPath = "previews%2Fframe.jpg";
    const expires = Math.floor(Date.now() / 1000) + 60;
    const signature = createArtifactSignature(encodedPath, expires);

    assert.equal(verifyArtifactSignature(encodedPath, expires, signature), true);
    assert.equal(verifyArtifactSignature(encodedPath, expires - 120, signature), false);
  });

  it("treats valid signed artifact URLs as public but does not resolve traversal paths", () => {
    const encodedPath = "..%2F..%2Fetc%2Fpasswd";
    const expires = Math.floor(Date.now() / 1000) + 60;
    const signature = createArtifactSignature(encodedPath, expires);
    const req = createReq({
      method: "GET",
      path: "/analysis-output/../../etc/passwd",
      originalUrl: `/analysis-output/${encodedPath}?expires=${expires}&signature=${signature}`,
      query: { expires: String(expires), signature },
    });

    assert.equal(getRequiredRole(req), null);
    assert.equal(resolveArtifactRequestPath(req), null);
  });

  it("requires admin role for artifact cleanup", () => {
    const req = createReq({
      method: "POST",
      path: "/analysis-output/cleanup",
    });

    assert.equal(getRequiredRole(req), "admin");
  });

  it("keeps queued and running job artifacts during cleanup", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-cleanup-active-"));
    const queuedDir = path.join(root, "queued-run");
    const runningDir = path.join(root, "running-run");
    fs.mkdirSync(queuedDir, { recursive: true });
    fs.mkdirSync(runningDir, { recursive: true });
    fs.writeFileSync(path.join(queuedDir, "snapshot.jpg"), "queued");
    fs.writeFileSync(path.join(runningDir, "summary.json"), "running");
    const oldDate = new Date("2026-05-01T00:00:00.000Z");
    fs.utimesSync(queuedDir, oldDate, oldDate);
    fs.utimesSync(runningDir, oldDate, oldDate);

    const result = cleanupAnalysisArtifacts({
      outputRoot: root,
      jobs: [
        { status: "queued", outputDir: queuedDir },
        { status: "running", outputDir: runningDir },
      ],
      maxAgeMs: 1,
      maxBytes: 1,
      now: () => new Date("2026-05-27T00:00:00.000Z").getTime(),
    });

    assert.equal(result.deletedCount, 0);
    assert.equal(result.skippedCount, 2);
    assert.equal(fs.existsSync(queuedDir), true);
    assert.equal(fs.existsSync(runningDir), true);
  });

  it("deletes expired artifacts inside the configured root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-cleanup-expired-"));
    const expiredDir = path.join(root, "expired-run");
    const freshDir = path.join(root, "fresh-run");
    fs.mkdirSync(expiredDir, { recursive: true });
    fs.mkdirSync(freshDir, { recursive: true });
    fs.writeFileSync(path.join(expiredDir, "summary.json"), "expired");
    fs.writeFileSync(path.join(freshDir, "summary.json"), "fresh");
    const oldDate = new Date("2026-05-01T00:00:00.000Z");
    const freshDate = new Date("2026-05-27T00:00:00.000Z");
    fs.utimesSync(path.join(expiredDir, "summary.json"), oldDate, oldDate);
    fs.utimesSync(expiredDir, oldDate, oldDate);
    fs.utimesSync(path.join(freshDir, "summary.json"), freshDate, freshDate);
    fs.utimesSync(freshDir, freshDate, freshDate);

    const result = cleanupAnalysisArtifacts({
      outputRoot: root,
      jobs: [],
      maxAgeMs: 24 * 60 * 60 * 1000,
      maxBytes: 0,
      now: () => new Date("2026-05-27T00:00:00.000Z").getTime(),
    });

    assert.equal(result.deletedCount, 1);
    assert.equal(result.bytesReclaimed > 0, true);
    assert.equal(fs.existsSync(expiredDir), false);
    assert.equal(fs.existsSync(freshDir), true);
  });

  it("ignores cleanup candidates that resolve outside the artifact root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-cleanup-root-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-cleanup-outside-"));
    const outsideFile = path.join(outside, "outside.txt");
    fs.writeFileSync(outsideFile, "do-not-delete");

    const result = cleanupAnalysisArtifacts({
      outputRoot: root,
      jobs: [],
      maxAgeMs: 1,
      maxBytes: 1,
      candidatePaths: [outsideFile],
      now: () => new Date("2026-05-27T00:00:00.000Z").getTime(),
    });

    assert.equal(result.deletedCount, 0);
    assert.equal(result.skippedCount, 1);
    assert.equal(fs.existsSync(outsideFile), true);
  });

  it("rejects unmanaged absolute paths supplied by clients", () => {
    assert.throws(() => resolveManagedVideoPath("/etc/passwd"), /allowed server-managed directory/);
    assert.throws(() => resolveManagedModelPath("/etc/passwd"), /allowed server-managed directory/);
  });

  it("rejects disallowed source preview schemes before probing", async () => {
    await assert.rejects(
      () => validateSourcePreviewInput("file:///etc/passwd"),
      /scheme is not allowed/
    );
    await assert.rejects(
      () => validateSourcePreviewInput("http://127.0.0.1:8080/camera"),
      /scheme is not allowed/
    );
  });

  it("rejects private source preview IPs by default", async () => {
    await assert.rejects(
      () => validateSourcePreviewInput("rtsp://192.168.1.10/live"),
      /private or internal/
    );
  });

  it("applies source SSRF validation to camera media sources", async () => {
    await assert.rejects(
      () =>
        validateMediaSourcePayloadForStorage({
          name: "Camera internal",
          location: "Pit",
          source: "rtsp://127.0.0.1/live",
          type: "camera",
          status: "active",
          analytics: ["PPE"],
          executionMode: "continuous",
          monitoringStatus: "running",
          note: "",
        }),
      /host is not allowed|private or internal/
    );
  });

  it("rejects unmanaged upload media source paths", async () => {
    await assert.rejects(
      () =>
        validateMediaSourcePayloadForStorage({
          name: "Unmanaged upload",
          location: "Pit",
          source: "/etc/passwd",
          type: "upload",
          status: "active",
          analytics: ["PPE"],
          executionMode: "manual",
          monitoringStatus: "idle",
          note: "",
        }),
      /allowed server-managed directory/
    );
  });

  it("resolves no-helmet analysis paths from managed media source ID", () => {
    const resolved = resolvePpeAnalysisInputPaths(
      "no_helmet",
      { mediaSourceId: "media-managed", modelVersionId: "model-no-helmet" },
      {
        mediaSources: [
          {
            id: "media-managed",
            name: "Managed Upload",
            source: testVideoPath,
            type: "upload",
            analytics: ["PPE"],
          },
        ],
        modelVersions: [
          {
            id: "model-no-helmet",
            moduleKey: "ppe.no-helmet",
            modelPath: testModelPath,
          },
        ],
      }
    );

    assert.equal(resolved.mediaSourceId, "media-managed");
    assert.equal(resolved.videoPath, fs.realpathSync.native(testVideoPath));
    assert.equal(resolved.modelPath, fs.realpathSync.native(testModelPath));
    assert.equal(fs.existsSync(resolved.modelPath), true);
    assert.notEqual(resolved.modelPath, "/etc/passwd");
  });

  it("returns clear errors for invalid no-helmet analysis IDs and unmanaged legacy paths", () => {
    assert.throws(
      () => resolvePpeAnalysisInputPaths("no_helmet", { mediaSourceId: "missing" }, { mediaSources: [] }),
      /Media source not found/
    );
    assert.throws(
      () => resolvePpeAnalysisInputPaths("no_helmet", { videoPath: "/etc/passwd", modelPath: testModelPath }),
      /allowed server-managed directory/
    );
  });

  it("resolves ID-based paths for all remaining analysis modules", () => {
    const mediaSources = [
      {
        id: "media-managed",
        name: "Managed Upload",
        source: testVideoPath,
        type: "upload",
        analytics: ["PPE", "HSE", "Operations"],
      },
    ];
    const modelVersions = [
      {
        id: "model-safety-vest",
        moduleKey: "ppe.no-safety-vest",
        modelPath: testModelPath,
      },
      {
        id: "model-life-vest",
        moduleKey: "ppe.no-life-vest",
        modelPath: testModelPath,
      },
      {
        id: "model-working-height",
        moduleKey: "hse.working-at-height",
        modelPath: testModelPath,
      },
      {
        id: "model-red-light",
        moduleKey: "operations.red-light-violation",
        modelPath: testModelPath,
      },
      {
        id: "model-dump-truck",
        moduleKey: "operations.dump-truck-bed-open",
        modelPath: testModelPath,
      },
    ];

    const cases = [
      {
        label: "no_safety_vest",
        resolve: () =>
          resolvePpeAnalysisInputPaths(
            "no_safety_vest",
            { mediaSourceId: "media-managed", modelVersionId: "model-safety-vest" },
            { mediaSources, modelVersions }
          ),
      },
      {
        label: "no_life_vest",
        resolve: () =>
          resolvePpeAnalysisInputPaths(
            "no_life_vest",
            { mediaSourceId: "media-managed", modelVersionId: "model-life-vest" },
            { mediaSources, modelVersions }
          ),
      },
      {
        label: "working_at_height",
        resolve: () =>
          resolveModuleAnalysisInputPaths({
            payload: { mediaSourceId: "media-managed", modelVersionId: "model-working-height" },
            configKey: "working-at-height",
            configPathField: "zoneConfigPath",
            configPathLabel: "Zone config path",
            options: { mediaSources, modelVersions },
          }),
      },
      {
        label: "red_light_violation",
        resolve: () =>
          resolveRedLightAnalysisInputPaths(
            { mediaSourceId: "media-managed", modelVersionId: "model-red-light" },
            { mediaSources, modelVersions }
          ),
      },
      {
        label: "dump_truck_bed_open",
        resolve: () =>
          resolveModuleAnalysisInputPaths({
            payload: { mediaSourceId: "media-managed", modelVersionId: "model-dump-truck" },
            configKey: "dump-truck-bed-open",
            configPathField: "roiConfigPath",
            configPathLabel: "ROI config path",
            options: { mediaSources, modelVersions },
          }),
      },
    ];

    for (const testCase of cases) {
      const resolved = testCase.resolve();
      assert.equal(resolved.mediaSourceId, "media-managed", testCase.label);
      assert.equal(resolved.videoPath, fs.realpathSync.native(testVideoPath), testCase.label);
    }
  });

  it("rejects invalid IDs, unmanaged legacy paths, and incompatible model versions for all remaining modules", () => {
    const mediaSources = [
      {
        id: "media-managed",
        name: "Managed Upload",
        source: testVideoPath,
        type: "upload",
        analytics: ["PPE", "HSE", "Operations"],
      },
    ];
    const incompatibleModels = [
      {
        id: "wrong-model",
        moduleKey: "ppe.no-helmet",
        modelPath: testModelPath,
      },
    ];

    const cases = [
      {
        label: "no_safety_vest",
        resolveMissing: () => resolvePpeAnalysisInputPaths("no_safety_vest", { mediaSourceId: "missing" }, { mediaSources: [] }),
        resolveUnmanaged: () => resolvePpeAnalysisInputPaths("no_safety_vest", { videoPath: "/etc/passwd", modelPath: testModelPath }),
        resolveIncompatible: () =>
          resolvePpeAnalysisInputPaths(
            "no_safety_vest",
            { mediaSourceId: "media-managed", modelVersionId: "wrong-model" },
            { mediaSources, modelVersions: incompatibleModels }
          ),
      },
      {
        label: "no_life_vest",
        resolveMissing: () => resolvePpeAnalysisInputPaths("no_life_vest", { mediaSourceId: "missing" }, { mediaSources: [] }),
        resolveUnmanaged: () => resolvePpeAnalysisInputPaths("no_life_vest", { videoPath: "/etc/passwd", modelPath: testModelPath }),
        resolveIncompatible: () =>
          resolvePpeAnalysisInputPaths(
            "no_life_vest",
            { mediaSourceId: "media-managed", modelVersionId: "wrong-model" },
            { mediaSources, modelVersions: incompatibleModels }
          ),
      },
      {
        label: "working_at_height",
        resolveMissing: () =>
          resolveModuleAnalysisInputPaths({ payload: { mediaSourceId: "missing" }, configKey: "working-at-height", options: { mediaSources: [] } }),
        resolveUnmanaged: () =>
          resolveModuleAnalysisInputPaths({ payload: { videoPath: "/etc/passwd", modelPath: testModelPath }, configKey: "working-at-height" }),
        resolveIncompatible: () =>
          resolveModuleAnalysisInputPaths({
            payload: { mediaSourceId: "media-managed", modelVersionId: "wrong-model" },
            configKey: "working-at-height",
            options: { mediaSources, modelVersions: incompatibleModels },
          }),
      },
      {
        label: "red_light_violation",
        resolveMissing: () => resolveRedLightAnalysisInputPaths({ mediaSourceId: "missing" }, { mediaSources: [] }),
        resolveUnmanaged: () =>
          resolveRedLightAnalysisInputPaths({
            videoPath: "/etc/passwd",
            vehicleModelPath: testModelPath,
            trafficLightModelPath: testModelPath,
          }),
        resolveIncompatible: () =>
          resolveRedLightAnalysisInputPaths(
            { mediaSourceId: "media-managed", modelVersionId: "wrong-model" },
            { mediaSources, modelVersions: incompatibleModels }
          ),
      },
      {
        label: "dump_truck_bed_open",
        resolveMissing: () =>
          resolveModuleAnalysisInputPaths({ payload: { mediaSourceId: "missing" }, configKey: "dump-truck-bed-open", options: { mediaSources: [] } }),
        resolveUnmanaged: () =>
          resolveModuleAnalysisInputPaths({ payload: { videoPath: "/etc/passwd", modelPath: testModelPath }, configKey: "dump-truck-bed-open" }),
        resolveIncompatible: () =>
          resolveModuleAnalysisInputPaths({
            payload: { mediaSourceId: "media-managed", modelVersionId: "wrong-model" },
            configKey: "dump-truck-bed-open",
            options: { mediaSources, modelVersions: incompatibleModels },
          }),
      },
    ];

    for (const testCase of cases) {
      assert.throws(testCase.resolveMissing, /Media source not found/, testCase.label);
      assert.throws(testCase.resolveUnmanaged, /allowed server-managed directory/, testCase.label);
      assert.throws(testCase.resolveIncompatible, /not compatible/, testCase.label);
    }
  });
});
