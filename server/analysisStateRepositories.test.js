const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const {
  AnalysisJobConflictError,
  createJsonAnalysisHistoryRepository,
  createJsonAnalysisJobRepository,
} = require("./repositories/analysisStateRepositories");

const createTempFile = (name) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "analysis-state-repository-test-"));
  return path.join(root, name);
};

describe("analysisHistoryRepository JSON adapter", () => {
  it("appends analysis history atomically and returns committed data", () => {
    const filePath = createTempFile("analysis-history.json");
    const repository = createJsonAnalysisHistoryRepository({
      filePath,
      normalizeEntry: (entry) => ({
        ...entry,
        eventCount: Number(entry.eventCount || 0),
      }),
    });

    const first = repository.append({ id: "run-1", analysisType: "no_helmet", eventCount: "2" });
    const second = repository.append({ id: "run-2", analysisType: "no_life_vest", eventCount: 3 });

    assert.equal(first.eventCount, 2);
    assert.equal(second.eventCount, 3);
    assert.deepEqual(repository.list().map((item) => item.id), ["run-2", "run-1"]);

    const stored = JSON.parse(fs.readFileSync(filePath, "utf8"));
    assert.deepEqual(stored, repository.list());
  });
});

describe("analysisJobRepository JSON adapter", () => {
  it("updates job status lifecycle with committed versions", () => {
    const filePath = createTempFile("analysis-jobs.json");
    const repository = createJsonAnalysisJobRepository({
      filePath,
      normalizeJob: (job) => ({
        ...job,
        status: job.status || "queued",
        stdout: job.stdout || "",
        stderr: job.stderr || "",
      }),
    });

    const created = repository.create({
      id: "job-1",
      runId: "run-1",
      status: "queued",
      message: "Queued",
      createdAt: "2026-05-21T00:00:00.000Z",
    });
    assert.equal(created.version, 1);

    const running = repository.update(
      "job-1",
      { status: "running", startedAt: "2026-05-21T00:01:00.000Z" },
      { expectedVersion: created.version }
    );
    assert.equal(running.status, "running");
    assert.equal(running.version, 2);

    const completed = repository.update("job-1", {
      status: "completed",
      completedAt: "2026-05-21T00:02:00.000Z",
      summary: { event_count: 4 },
    });
    assert.equal(completed.status, "completed");
    assert.equal(completed.version, 3);
    assert.deepEqual(repository.get("job-1"), completed);
  });

  it("rejects stale job updates with optimistic concurrency", () => {
    const filePath = createTempFile("analysis-jobs.json");
    const repository = createJsonAnalysisJobRepository({ filePath });
    const created = repository.create({ id: "job-2", status: "queued" });

    repository.update("job-2", { status: "running" }, { expectedVersion: created.version });

    assert.throws(
      () => repository.update("job-2", { status: "failed" }, { expectedVersion: created.version }),
      AnalysisJobConflictError
    );
  });

  it("persists normalized job metadata atomically", () => {
    const filePath = createTempFile("analysis-jobs.json");
    const repository = createJsonAnalysisJobRepository({
      filePath,
      normalizeJob: (job) => ({
        ...job,
        status: job.status || "queued",
        message: job.message || "",
      }),
    });

    const committed = repository.create({ id: "job-3" });
    const stored = JSON.parse(fs.readFileSync(filePath, "utf8"));

    assert.deepEqual(stored, [committed]);
    assert.equal(committed.status, "queued");
    assert.equal(committed.version, 1);
  });
});
