const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const testRuntimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "model-registry-api-test-"));

process.env.AUTH_REQUIRED = "true";
process.env.AUTH_TOKEN_OPERATOR = "test-operator-token";
process.env.AUTH_SESSION_SECRET = "test-session-secret";
process.env.ARTIFACT_URL_SECRET = "test-artifact-secret";
process.env.CORS_ORIGINS = "http://localhost:8080";
process.env.ANALYSIS_OUTPUT_ROOT = testRuntimeRoot;
process.env.MODEL_DATASETS_PATH = path.join(testRuntimeRoot, "model-datasets.json");
process.env.MODEL_TRAINING_JOBS_PATH = path.join(testRuntimeRoot, "model-training-jobs.json");
process.env.MODEL_VERSIONS_PATH = path.join(testRuntimeRoot, "model-versions.json");
process.env.MODEL_EVALUATIONS_PATH = path.join(testRuntimeRoot, "model-evaluations.json");
process.env.MODEL_BENCHMARKS_PATH = path.join(testRuntimeRoot, "model-benchmarks.json");

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

const createReadyDataset = async () => {
  const res = await invokeRoute("POST", "/models/datasets", {
    body: {
      name: "PPE Ready Dataset",
      domain: "PPE",
      labels: ["person", "helmet"],
      sourceType: "upload",
      imageCount: 12,
      annotationCount: 12,
      status: "ready",
      description: "Ready test dataset",
      storagePath: "datasets/ppe-ready",
    },
  });
  assert.equal(res.statusCode, 201);
  return res.payload.item;
};

describe("model registry API repository-backed writes", () => {
  it("creates and updates datasets with expectedVersion", async () => {
    const dataset = await createReadyDataset();

    const updated = await invokeRoute("PATCH", "/models/datasets/:id", {
      params: { id: dataset.id },
      body: {
        status: "archived",
        expectedVersion: dataset.version,
      },
    });

    assert.equal(updated.statusCode, 200);
    assert.equal(updated.payload.item.status, "archived");
    assert.equal(updated.payload.item.version, dataset.version + 1);
  });

  it("rejects stale dataset updates with HTTP 409", async () => {
    const dataset = await createReadyDataset();
    await invokeRoute("PATCH", "/models/datasets/:id", {
      params: { id: dataset.id },
      body: {
        status: "draft",
        expectedVersion: dataset.version,
      },
    });

    const stale = await invokeRoute("PATCH", "/models/datasets/:id", {
      params: { id: dataset.id },
      body: {
        status: "archived",
        expectedVersion: dataset.version,
      },
    });

    assert.equal(stale.statusCode, 409);
    assert.equal(stale.payload.code, "MODEL_DATASET_CONFLICT");
  });

  it("creates and updates training jobs with stale conflict", async () => {
    const dataset = await createReadyDataset();
    const created = await invokeRoute("POST", "/models/training-jobs", {
      body: {
        datasetId: dataset.id,
        targetModule: "ppe.no-helmet",
        baseModelPath: "models/base.pt",
        epochs: 2,
        imageSize: 640,
        notes: "test training",
      },
    });
    assert.equal(created.statusCode, 201);

    const updated = await invokeRoute("PATCH", "/models/training-jobs/:id", {
      params: { id: created.payload.item.id },
      body: {
        status: "running",
        expectedVersion: created.payload.item.version,
      },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.payload.item.version, created.payload.item.version + 1);

    const stale = await invokeRoute("PATCH", "/models/training-jobs/:id", {
      params: { id: created.payload.item.id },
      body: {
        status: "failed",
        expectedVersion: created.payload.item.version,
      },
    });
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.payload.code, "MODEL_TRAINING_JOB_CONFLICT");
  });

  it("creates and updates evaluations with stale conflict", async () => {
    const versions = await invokeRoute("GET", "/models/versions");
    const modelVersion = versions.payload.items.find((item) => item.moduleKey === "ppe.no-helmet");
    const created = await invokeRoute("POST", "/models/evaluations", {
      body: {
        modelVersionId: modelVersion.id,
        status: "draft",
        precision: 0.8,
        recall: 0.7,
        map50: 0.75,
        falsePositiveNotes: "",
        falseNegativeNotes: "",
        benchmarkNotes: "initial",
      },
    });
    assert.equal(created.statusCode, 201);

    const updated = await invokeRoute("PATCH", "/models/evaluations/:id", {
      params: { id: created.payload.item.id },
      body: {
        status: "reviewed",
        benchmarkNotes: "reviewed",
        expectedVersion: created.payload.item.version,
      },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.payload.item.version, created.payload.item.version + 1);

    const stale = await invokeRoute("PATCH", "/models/evaluations/:id", {
      params: { id: created.payload.item.id },
      body: {
        status: "approved",
        expectedVersion: created.payload.item.version,
      },
    });
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.payload.code, "MODEL_EVALUATION_CONFLICT");
  });

  it("creates and updates benchmarks with stale conflict", async () => {
    const dataset = await createReadyDataset();
    const versions = await invokeRoute("GET", "/models/versions");
    const modelVersion = versions.payload.items.find((item) => item.moduleKey === "ppe.no-helmet");
    const created = await invokeRoute("POST", "/models/benchmarks", {
      body: {
        datasetId: dataset.id,
        modelVersionId: modelVersion.id,
        baselineModelPath: "models/base.pt",
        recommendation: "keep-current",
        status: "draft",
        precisionDelta: null,
        recallDelta: null,
        falsePositiveDelta: null,
        falseNegativeDelta: null,
        benchmarkNotes: "initial",
      },
    });
    assert.equal(created.statusCode, 201);

    const updated = await invokeRoute("PATCH", "/models/benchmarks/:id", {
      params: { id: created.payload.item.id },
      body: {
        status: "reviewed",
        recommendation: "fine-tune",
        expectedVersion: created.payload.item.version,
      },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.payload.item.version, created.payload.item.version + 1);

    const stale = await invokeRoute("PATCH", "/models/benchmarks/:id", {
      params: { id: created.payload.item.id },
      body: {
        status: "approved",
        expectedVersion: created.payload.item.version,
      },
    });
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.payload.code, "MODEL_BENCHMARK_CONFLICT");
  });
});
