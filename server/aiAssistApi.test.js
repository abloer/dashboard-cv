const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const testRuntimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-assist-api-test-"));

process.env.AUTH_REQUIRED = "true";
process.env.AUTH_TOKEN_OPERATOR = "test-operator-token";
process.env.AUTH_SESSION_SECRET = "test-session-secret";
process.env.ARTIFACT_URL_SECRET = "test-artifact-secret";
process.env.CORS_ORIGINS = "http://localhost:8080";
process.env.ANALYSIS_OUTPUT_ROOT = testRuntimeRoot;
process.env.AI_ASSIST_CONFIG_PATH = path.join(testRuntimeRoot, "ai-assist-config.json");

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

const invokeRoute = async (method, routePath, { body = {} } = {}) => {
  const handler = findRouteHandler(method, routePath);
  const req = { body };
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

describe("AI assist API boundary", () => {
  it("updates and persists AI assist config", async () => {
    const updated = await invokeRoute("PATCH", "/ai-assist/config", {
      body: {
        enabled: true,
        mode: "remote-openai",
        baseUrl: "http://127.0.0.1:9999/v1",
        apiKey: "test-key",
        gemmaModel: "gemma-test",
        requestTimeoutMs: 5000,
      },
    });

    assert.equal(updated.statusCode, 200);
    assert.equal(updated.payload.config.enabled, true);
    assert.equal(updated.payload.config.mode, "remote-openai");
    assert.equal(updated.payload.config.gemmaModel, "gemma-test");

    const persisted = JSON.parse(fs.readFileSync(process.env.AI_ASSIST_CONFIG_PATH, "utf8"));
    assert.equal(persisted.enabled, true);
    assert.equal(persisted.requestTimeoutMs, 5000);
  });

  it("rejects disabled provider requests without calling external AI", async () => {
    await invokeRoute("PATCH", "/ai-assist/config", {
      body: {
        enabled: false,
      },
    });

    const response = await invokeRoute("POST", "/ai-assist/operator-summary", {
      body: {
        source: {
          name: "Gate Camera",
          location: "North Gate",
          type: "camera",
        },
        finding: {
          title: "Worker near restricted area",
          detail: "A worker entered a restricted zone.",
          recommendation: "Verify with operator.",
        },
      },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.payload.ok, false);
    assert.match(response.payload.message, /AI assist belum diaktifkan/);
  });
});
