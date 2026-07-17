const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const testRuntimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "model-version-api-test-"));
const testModelVersionsPath = path.join(testRuntimeRoot, "model-versions.json");

process.env.AUTH_REQUIRED = "true";
process.env.AUTH_TOKEN_OPERATOR = "test-operator-token";
process.env.AUTH_SESSION_SECRET = "test-session-secret";
process.env.ARTIFACT_URL_SECRET = "test-artifact-secret";
process.env.CORS_ORIGINS = "http://localhost:8080";
process.env.ANALYSIS_OUTPUT_ROOT = testRuntimeRoot;
process.env.MODEL_VERSIONS_PATH = testModelVersionsPath;

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

const invokeRoute = async (method, routePath, { body = {}, params = {} } = {}) => {
  const handler = findRouteHandler(method, routePath);
  const req = { body, params };
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

describe("model version API optimistic concurrency", () => {
  it("lists model versions with version metadata", async () => {
    const res = await invokeRoute("GET", "/models/versions");

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.ok, true);
    assert.ok(res.payload.items.length > 0);
    assert.equal(typeof res.payload.items[0].version, "number");
  });

  it("updates model version status with expected version", async () => {
    const list = await invokeRoute("GET", "/models/versions");
    const target = list.payload.items.find((item) => item.status === "active");

    const updated = await invokeRoute("PATCH", "/models/versions/:id", {
      params: { id: target.id },
      body: {
        status: "approved",
        expectedVersion: target.version,
      },
    });

    assert.equal(updated.statusCode, 200);
    assert.equal(updated.payload.item.id, target.id);
    assert.equal(updated.payload.item.status, "approved");
    assert.equal(updated.payload.item.version, target.version + 1);
  });

  it("rejects stale model version status updates with HTTP 409", async () => {
    const list = await invokeRoute("GET", "/models/versions");
    const target = list.payload.items[0];

    const first = await invokeRoute("PATCH", "/models/versions/:id", {
      params: { id: target.id },
      body: {
        status: "active",
        expectedVersion: target.version,
      },
    });
    assert.equal(first.statusCode, 200);

    const stale = await invokeRoute("PATCH", "/models/versions/:id", {
      params: { id: target.id },
      body: {
        status: "rejected",
        expectedVersion: target.version,
      },
    });

    assert.equal(stale.statusCode, 409);
    assert.equal(stale.payload.code, "MODEL_VERSION_CONFLICT");
  });
});
