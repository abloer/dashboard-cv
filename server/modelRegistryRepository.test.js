const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const {
  ModelRegistryConflictError,
  ModelVersionConflictError,
  createJsonModelRegistryCollectionRepository,
  createJsonModelVersionRepository,
} = require("./repositories/modelRegistryRepository");

const createRepository = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "model-registry-repository-test-"));
  const filePath = path.join(root, "model-versions.json");
  const repository = createJsonModelVersionRepository({
    filePath,
    defaultItems: [
      {
        id: "baseline",
        name: "Baseline",
        moduleKey: "ppe.no-helmet",
        domain: "PPE",
        labels: ["person", "helmet"],
        modelPath: "baseline.pt",
        sourceJobId: null,
        evaluationSummary: "Default baseline",
        status: "active",
      },
    ],
    normalizeItem: (item) => ({
      ...item,
      labels: Array.isArray(item.labels) ? item.labels : [],
      sourceJobId: item.sourceJobId || null,
      createdAt: item.createdAt || "2026-05-21T00:00:00.000Z",
      updatedAt: item.updatedAt || "2026-05-21T00:00:00.000Z",
    }),
  });
  return { filePath, repository };
};

describe("modelRegistryRepository model version adapter", () => {
  it("lists seeded model versions with versions", () => {
    const { repository } = createRepository();

    const items = repository.list();

    assert.equal(items.length, 1);
    assert.equal(items[0].id, "baseline");
    assert.equal(items[0].version, 1);
  });

  it("updates model version status with expected version", () => {
    const { repository } = createRepository();
    const current = repository.get("baseline");

    const updated = repository.updateStatus("baseline", "approved", {
      expectedVersion: current.version,
    });

    assert.equal(updated.status, "approved");
    assert.equal(updated.version, current.version + 1);
  });

  it("rejects stale model version updates", () => {
    const { repository } = createRepository();
    const current = repository.get("baseline");
    repository.updateStatus("baseline", "approved", { expectedVersion: current.version });

    assert.throws(
      () => repository.updateStatus("baseline", "rejected", { expectedVersion: current.version }),
      ModelVersionConflictError
    );
  });

  it("persists normalized JSON and creates training-derived model versions", () => {
    const { filePath, repository } = createRepository();

    const candidate = repository.upsert({
      id: "model-version-train-1",
      name: "Dataset Candidate",
      moduleKey: "ppe.no-helmet",
      domain: "PPE",
      labels: ["person"],
      modelPath: "candidate.pt",
      sourceJobId: "train-1",
      evaluationSummary: "Candidate from training job",
      status: "candidate",
    });

    const stored = JSON.parse(fs.readFileSync(filePath, "utf8"));
    assert.equal(candidate.version, 1);
    assert.equal(candidate.sourceJobId, "train-1");
    assert.ok(stored.some((item) => item.id === "model-version-train-1" && item.version === 1));
  });
});

const createCollectionRepository = (name) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `model-registry-${name}-test-`));
  const filePath = path.join(root, `${name}.json`);
  const repository = createJsonModelRegistryCollectionRepository({
    filePath,
    conflictCode: `MODEL_${name.toUpperCase()}_CONFLICT`,
    normalizeItem: (item) => ({
      ...item,
      labels: Array.isArray(item.labels) ? item.labels : [],
      createdAt: item.createdAt || "2026-05-21T00:00:00.000Z",
      updatedAt: item.updatedAt || "2026-05-21T00:00:00.000Z",
    }),
  });
  return { filePath, repository };
};

describe("modelRegistryRepository collection adapter", () => {
  it("creates and updates datasets with atomic normalized JSON", () => {
    const { filePath, repository } = createCollectionRepository("dataset");

    const created = repository.create({
      id: "dataset-1",
      name: "Dataset 1",
      labels: "invalid",
    });
    const updated = repository.update("dataset-1", { name: "Dataset 1 Ready" }, { expectedVersion: created.version });
    const stored = JSON.parse(fs.readFileSync(filePath, "utf8"));

    assert.equal(created.version, 1);
    assert.equal(updated.version, 2);
    assert.deepEqual(stored[0].labels, []);
    assert.equal(stored[0].name, "Dataset 1 Ready");
  });

  it("rejects stale dataset updates", () => {
    const { repository } = createCollectionRepository("dataset");
    const created = repository.create({ id: "dataset-1", name: "Dataset 1" });
    repository.update("dataset-1", { name: "Dataset 2" }, { expectedVersion: created.version });

    assert.throws(
      () => repository.update("dataset-1", { name: "Dataset 3" }, { expectedVersion: created.version }),
      ModelRegistryConflictError
    );
  });

  it("creates and updates training jobs with stale conflict", () => {
    const { repository } = createCollectionRepository("training_job");
    const created = repository.create({ id: "train-1", status: "queued" });
    const updated = repository.update("train-1", { status: "running" }, { expectedVersion: created.version });

    assert.equal(updated.status, "running");
    assert.throws(
      () => repository.update("train-1", { status: "failed" }, { expectedVersion: created.version }),
      ModelRegistryConflictError
    );
  });

  it("creates and updates evaluations with stale conflict", () => {
    const { repository } = createCollectionRepository("evaluation");
    const created = repository.create({ id: "evaluation-1", status: "draft" });
    const updated = repository.update("evaluation-1", { status: "reviewed" }, { expectedVersion: created.version });

    assert.equal(updated.status, "reviewed");
    assert.throws(
      () => repository.update("evaluation-1", { status: "approved" }, { expectedVersion: created.version }),
      ModelRegistryConflictError
    );
  });

  it("creates and updates benchmarks with stale conflict", () => {
    const { repository } = createCollectionRepository("benchmark");
    const created = repository.create({ id: "benchmark-1", status: "draft" });
    const updated = repository.update("benchmark-1", { status: "reviewed" }, { expectedVersion: created.version });

    assert.equal(updated.status, "reviewed");
    assert.throws(
      () => repository.update("benchmark-1", { status: "approved" }, { expectedVersion: created.version }),
      ModelRegistryConflictError
    );
  });
});
