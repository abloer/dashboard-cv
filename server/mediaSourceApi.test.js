const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const testRuntimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "media-source-api-test-"));
const testUploadRoot = path.join(testRuntimeRoot, "uploads");
const testRegistryPath = path.join(testRuntimeRoot, "media-sources.json");
const testVideoPath = path.join(testUploadRoot, "managed-video.mp4");

fs.mkdirSync(testUploadRoot, { recursive: true });
fs.writeFileSync(testVideoPath, "not-a-real-video");

process.env.AUTH_REQUIRED = "true";
process.env.AUTH_TOKEN_OPERATOR = "test-operator-token";
process.env.AUTH_SESSION_SECRET = "test-session-secret";
process.env.ARTIFACT_URL_SECRET = "test-artifact-secret";
process.env.CORS_ORIGINS = "http://localhost:8080";
process.env.ANALYSIS_OUTPUT_ROOT = testRuntimeRoot;
process.env.MEDIA_REGISTRY_PATH = testRegistryPath;

const { app } = require("./index");

const mediaPayload = (overrides = {}) => ({
  name: "Managed Upload",
  location: "Pit A",
  source: testVideoPath,
  type: "upload",
  status: "active",
  analytics: ["PPE"],
  executionMode: "scheduled",
  monitoringStatus: "idle",
  monitoringIntervalSeconds: 15,
  note: "",
  ...overrides,
});

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
  const req = {
    body,
    params,
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

const createSource = async (overrides = {}) => {
  const res = await invokeRoute("POST", "/media-sources", {
    body: mediaPayload(overrides),
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.ok, true);
  return res.payload.item;
};

describe("media source API optimistic concurrency", () => {
  it("updates and deletes with a valid expected version and returns committed versions", async () => {
    const created = await createSource({ name: "Update Delete Source" });

    const updateResult = await invokeRoute("PUT", "/media-sources/:id", {
      params: { id: created.id },
      body: mediaPayload({
        name: "Updated Source",
        expectedVersion: created.version,
      }),
    });

    assert.equal(updateResult.statusCode, 200);
    assert.equal(updateResult.payload.item.name, "Updated Source");
    assert.equal(updateResult.payload.item.version, created.version + 1);

    const deleteResult = await invokeRoute("DELETE", "/media-sources/:id", {
      params: { id: created.id },
      body: { expectedVersion: updateResult.payload.item.version },
    });

    assert.equal(deleteResult.statusCode, 200);
    assert.equal(deleteResult.payload.item.id, created.id);
    assert.equal(deleteResult.payload.item.version, updateResult.payload.item.version);
  });

  it("rejects stale update and delete versions with HTTP 409", async () => {
    const created = await createSource({ name: "Stale Source" });
    const freshUpdate = await invokeRoute("PUT", "/media-sources/:id", {
      params: { id: created.id },
      body: mediaPayload({
        name: "Fresh Update",
        expectedVersion: created.version,
      }),
    });
    assert.equal(freshUpdate.statusCode, 200);

    const staleUpdate = await invokeRoute("PUT", "/media-sources/:id", {
      params: { id: created.id },
      body: mediaPayload({
        name: "Stale Update",
        expectedVersion: created.version,
      }),
    });
    assert.equal(staleUpdate.statusCode, 409);
    assert.equal(staleUpdate.payload.code, "MEDIA_SOURCE_VERSION_CONFLICT");

    const staleDelete = await invokeRoute("DELETE", "/media-sources/:id", {
      params: { id: created.id },
      body: { expectedVersion: created.version },
    });
    assert.equal(staleDelete.statusCode, 409);
    assert.equal(staleDelete.payload.code, "MEDIA_SOURCE_VERSION_CONFLICT");
  });

  it("applies expected version checks to status and monitoring patches", async () => {
    const created = await createSource({ name: "Patch Source" });

    const statusResult = await invokeRoute("PATCH", "/media-sources/:id/status", {
      params: { id: created.id },
      body: {
        status: "inactive",
        expectedVersion: created.version,
      },
    });
    assert.equal(statusResult.statusCode, 200);
    assert.equal(statusResult.payload.item.version, created.version + 1);

    const monitoringResult = await invokeRoute("PATCH", "/media-sources/:id/monitoring", {
      params: { id: created.id },
      body: {
        monitoringStatus: "running",
        monitoringIntervalSeconds: 20,
        expectedVersion: statusResult.payload.item.version,
      },
    });
    assert.equal(monitoringResult.statusCode, 200);
    assert.equal(monitoringResult.payload.item.version, statusResult.payload.item.version + 1);

    const staleStatusResult = await invokeRoute("PATCH", "/media-sources/:id/status", {
      params: { id: created.id },
      body: {
        status: "active",
        expectedVersion: created.version,
      },
    });
    assert.equal(staleStatusResult.statusCode, 409);
    assert.equal(staleStatusResult.payload.code, "MEDIA_SOURCE_VERSION_CONFLICT");
  });
});
