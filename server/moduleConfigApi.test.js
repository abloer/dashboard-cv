const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const testRuntimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "module-config-api-test-"));
const testConfigPath = path.join(testRuntimeRoot, "module-configs.json");

process.env.AUTH_REQUIRED = "true";
process.env.AUTH_TOKEN_OPERATOR = "test-operator-token";
process.env.AUTH_SESSION_SECRET = "test-session-secret";
process.env.ARTIFACT_URL_SECRET = "test-artifact-secret";
process.env.CORS_ORIGINS = "http://localhost:8080";
process.env.ANALYSIS_OUTPUT_ROOT = testRuntimeRoot;
process.env.MODULE_CONFIGS_PATH = testConfigPath;

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

describe("module config API optimistic concurrency", () => {
  it("reads default config with version", async () => {
    const res = await invokeRoute("GET", "/module-configs/:moduleKey", {
      params: { moduleKey: "no-helmet" },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.ok, true);
    assert.equal(res.payload.version, 1);
    assert.equal(res.payload.config.modelSource, "deployment-gate");
  });

  it("updates config with valid expected version and returns committed version", async () => {
    const current = await invokeRoute("GET", "/module-configs/:moduleKey", {
      params: { moduleKey: "no-helmet" },
    });

    const nextConfig = {
      ...current.payload.config,
      operationalNotes: "Updated through route-level test.",
    };
    const updated = await invokeRoute("PUT", "/module-configs/:moduleKey", {
      params: { moduleKey: "no-helmet" },
      body: {
        expectedVersion: current.payload.version,
        config: nextConfig,
      },
    });

    assert.equal(updated.statusCode, 200);
    assert.equal(updated.payload.version, current.payload.version + 1);
    assert.equal(updated.payload.config.operationalNotes, "Updated through route-level test.");
  });

  it("rejects stale updates with HTTP 409", async () => {
    const current = await invokeRoute("GET", "/module-configs/:moduleKey", {
      params: { moduleKey: "safety-rules" },
    });

    const first = await invokeRoute("PUT", "/module-configs/:moduleKey", {
      params: { moduleKey: "safety-rules" },
      body: {
        expectedVersion: current.payload.version,
        config: {
          ...current.payload.config,
          supervisorEscalationNote: "First update.",
        },
      },
    });
    assert.equal(first.statusCode, 200);

    const stale = await invokeRoute("PUT", "/module-configs/:moduleKey", {
      params: { moduleKey: "safety-rules" },
      body: {
        expectedVersion: current.payload.version,
        config: {
          ...current.payload.config,
          supervisorEscalationNote: "Stale update.",
        },
      },
    });

    assert.equal(stale.statusCode, 409);
    assert.equal(stale.payload.code, "MODULE_CONFIG_VERSION_CONFLICT");
  });
});
