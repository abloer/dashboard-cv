const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const {
  MediaSourceConflictError,
  createJsonMediaSourceRepository,
} = require("./repositories/mediaSourceRepository");

const createRepository = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-source-repository-test-"));
  const filePath = path.join(root, "media-sources.json");
  const repository = createJsonMediaSourceRepository({
    filePath,
    normalizeItem: (item) => ({
      ...item,
      type: item.type || "upload",
      analytics: Array.isArray(item.analytics) ? item.analytics : [],
      status: item.status || "active",
      executionMode: item.executionMode || "manual",
      monitoringStatus: item.monitoringStatus || "idle",
      monitoringIntervalSeconds: item.monitoringIntervalSeconds ?? null,
    }),
  });
  return { filePath, repository };
};

describe("mediaSourceRepository JSON adapter", () => {
  it("creates, updates, and deletes media sources through the repository", () => {
    const { repository } = createRepository();

    const created = repository.create({
      id: "media-1",
      name: "Camera 1",
      location: "Pit A",
      source: "managed.mp4",
    });

    assert.equal(created.id, "media-1");
    assert.equal(created.version, 1);
    assert.deepEqual(repository.list().map((item) => item.id), ["media-1"]);

    const updated = repository.update("media-1", { name: "Camera 1 Updated" });
    assert.equal(updated.name, "Camera 1 Updated");
    assert.equal(updated.version, 2);

    const removed = repository.delete("media-1");
    assert.equal(removed.id, "media-1");
    assert.equal(removed.version, 2);
    assert.deepEqual(repository.list(), []);
  });

  it("rejects stale updates with optimistic concurrency", () => {
    const { repository } = createRepository();
    const created = repository.create({
      id: "media-2",
      name: "Camera 2",
      location: "Pit B",
      source: "managed-2.mp4",
    });

    const updated = repository.update("media-2", { status: "inactive" }, { expectedVersion: created.version });
    assert.equal(updated.version, 2);

    assert.throws(
      () => repository.update("media-2", { status: "active" }, { expectedVersion: created.version }),
      MediaSourceConflictError
    );
  });

  it("returns the committed data and persists it atomically to disk", () => {
    const { filePath, repository } = createRepository();

    const committed = repository.create({
      id: "media-3",
      name: "Camera 3",
      location: "Pit C",
      source: "managed-3.mp4",
      analytics: "invalid",
    });

    const stored = JSON.parse(fs.readFileSync(filePath, "utf8"));
    assert.deepEqual(stored, [committed]);
    assert.deepEqual(committed.analytics, []);
    assert.equal(committed.version, 1);
  });
});
