const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  createOperationalMetrics,
  createObservabilityRouter,
  createRateLimiter,
  createSensitiveRateLimitMiddleware,
} = require("./observability");

const createReq = ({ method = "GET", path = "/", ip = "127.0.0.1" } = {}) => ({
  method,
  originalUrl: path,
  url: path,
  ip,
  socket: { remoteAddress: ip },
  header(name) {
    if (String(name).toLowerCase() === "x-forwarded-for") {
      return undefined;
    }
    return undefined;
  },
});

const createRes = () => ({
  statusCode: 200,
  payload: null,
  headers: {},
  setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = value;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.payload = payload;
    return this;
  },
});

const getRouteHandler = (router, routePath) => {
  const layer = router.stack.find((item) => item.route?.path === routePath);
  assert.ok(layer, `Missing route ${routePath}`);
  return layer.route.stack[0].handle;
};

const createRouteRes = () => ({
  statusCode: 200,
  headers: {},
  body: null,
  setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = value;
  },
  json(payload) {
    this.body = JSON.stringify(payload);
    return this;
  },
  send(payload) {
    this.body = payload;
    return this;
  },
});

const runRoute = (router, routePath) => {
  const res = createRouteRes();
  getRouteHandler(router, routePath)({}, res);
  return {
    status: res.statusCode,
    contentType: res.headers["content-type"],
    body: res.body,
  };
};

describe("observability boundary", () => {
  it("keeps health response shape public and deterministic", async () => {
    const router = createObservabilityRouter({
      metrics: createOperationalMetrics(),
      analysisOutputRoot: "/safe/runtime",
      health: {
        supabaseEnabled: false,
        analysisScriptPath: "/safe/tools/analyze.py",
        fileExists: () => true,
        analysisPythonCommand: "python3",
        defaultRoiConfigPath: "/safe/config/roi.json",
        analysisOutputRoot: "/safe/runtime",
      },
    });

    const response = runRoute(router, "/health");
    const payload = JSON.parse(response.body);

    assert.equal(response.status, 200);
    assert.deepEqual(payload, {
      ok: true,
      supabaseEnabled: false,
      analysisScriptPath: "/safe/tools/analyze.py",
      analysisScriptReady: true,
      analysisPythonCommand: "python3",
      defaultRoiConfigPath: "/safe/config/roi.json",
      analysisOutputRoot: "/safe/runtime",
    });
  });

  it("renders metrics without raw identifiers or query secrets", async () => {
    const metrics = createOperationalMetrics();
    metrics.recordRequest({
      method: "GET",
      path: "/analysis/ppe.no-helmet/jobs/job-123?token=secret",
      status: 200,
      durationMs: 25,
    });

    const router = createObservabilityRouter({
      metrics,
      analysisOutputRoot: "/safe/runtime",
      getDirectorySize: () => 2048,
      health: {
        supabaseEnabled: false,
        analysisScriptPath: "/safe/tools/analyze.py",
        fileExists: () => true,
        analysisPythonCommand: "python3",
        defaultRoiConfigPath: "/safe/config/roi.json",
        analysisOutputRoot: "/safe/runtime",
      },
    });

    const response = runRoute(router, "/metrics");

    assert.equal(response.status, 200);
    assert.match(response.contentType, /text\/plain/);
    assert.match(response.body, /dashboard_runtime_analysis_disk_usage_bytes 2048/);
    assert.match(response.body, /path="\/analysis\/\{moduleKey\}\/jobs\/\{id\}"/);
    assert.equal(response.body.includes("job-123"), false);
    assert.equal(response.body.includes("secret"), false);
  });

  it("rate limits auth session and source validation paths", () => {
    const middleware = createSensitiveRateLimitMiddleware({
      authSessionRateLimiter: createRateLimiter({ windowMs: 1000, max: 1 }),
      sourcePreviewRateLimiter: createRateLimiter({ windowMs: 1000, max: 1 }),
      getRequestClientKey: () => "client-a",
    });

    const authFirst = createRes();
    let authNextCount = 0;
    middleware(createReq({ method: "POST", path: "/auth/session" }), authFirst, () => {
      authNextCount += 1;
    });
    const authSecond = createRes();
    middleware(createReq({ method: "POST", path: "/auth/session" }), authSecond, () => {});

    const previewFirst = createRes();
    let previewNextCount = 0;
    middleware(createReq({ method: "POST", path: "/analysis/source-preview" }), previewFirst, () => {
      previewNextCount += 1;
    });
    const previewSecond = createRes();
    middleware(createReq({ method: "POST", path: "/analysis/source-preview" }), previewSecond, () => {});

    assert.equal(authNextCount, 1);
    assert.equal(authSecond.statusCode, 429);
    assert.deepEqual(authSecond.payload, { ok: false, message: "Too many requests." });
    assert.equal(previewNextCount, 1);
    assert.equal(previewSecond.statusCode, 429);
    assert.deepEqual(previewSecond.payload, { ok: false, message: "Too many requests." });
  });
});
