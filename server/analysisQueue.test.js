const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const { createDurableAnalysisQueue } = require("./analysisQueue");
const { createJsonAnalysisJobRepository } = require("./repositories/analysisStateRepositories");

const waitFor = async (predicate, timeoutMs = 1000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("Timed out waiting for condition.");
};

const createTempFile = (name) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "analysis-queue-test-"));
  return path.join(root, name);
};

const createMemoryJobRepository = () => {
  let items = [];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const normalize = (job) => ({
    ...job,
    version: Number(job.version || 1),
    status: job.status || "queued",
    createdAt: job.createdAt || new Date().toISOString(),
    stdout: job.stdout || "",
    stderr: job.stderr || "",
  });

  return {
    list() {
      return items.map(clone);
    },
    get(id) {
      const item = items.find((job) => job.id === id);
      return item ? clone(item) : null;
    },
    create(job) {
      const committed = normalize(job);
      items = [committed, ...items.filter((item) => item.id !== committed.id)];
      return clone(committed);
    },
    update(id, updateFn, options = {}) {
      const index = items.findIndex((job) => job.id === id);
      if (index === -1) return null;
      const current = items[index];
      if (options.expectedVersion && options.expectedVersion !== current.version) {
        const error = new Error("Version conflict.");
        error.code = "ANALYSIS_JOB_VERSION_CONFLICT";
        throw error;
      }
      const nextDraft = typeof updateFn === "function" ? updateFn(clone(current)) : updateFn;
      const committed = normalize({
        ...current,
        ...nextDraft,
        id: current.id,
        version: current.version + 1,
      });
      items[index] = committed;
      return clone(committed);
    },
  };
};

const createJob = (overrides = {}) => ({
  id: overrides.id || `job-${Math.random().toString(16).slice(2)}`,
  runId: overrides.runId || `run-${Math.random().toString(16).slice(2)}`,
  moduleKey: overrides.moduleKey || "ppe.no-helmet",
  analysisType: overrides.analysisType || "no_helmet",
  status: overrides.status || "queued",
  message: overrides.message || "Queued",
  createdAt: overrides.createdAt || "2026-05-26T00:00:00.000Z",
  ...overrides,
});

describe("durable analysis queue", () => {
  it("recovers queued jobs after repository reload", async () => {
    const filePath = createTempFile("analysis-jobs.json");
    const firstRepository = createJsonAnalysisJobRepository({ filePath });
    firstRepository.create(createJob({ id: "job-recover" }));

    const reloadedRepository = createJsonAnalysisJobRepository({ filePath });
    const queue = createDurableAnalysisQueue({
      jobRepository: reloadedRepository,
      executeJob: async (job) => {
        reloadedRepository.update(job.id, { status: "completed", completedAt: "2026-05-26T00:01:00.000Z" });
      },
      logger: { info() {}, warn() {}, error() {} },
      metrics: {},
      options: { maxRetries: 0, timeoutMs: 1000, defaultConcurrency: 1 },
    });

    queue.recover();
    await waitFor(() => reloadedRepository.get("job-recover")?.status === "completed");
  });

  it("retries failed jobs up to max retries then persists final failure", async () => {
    const repository = createMemoryJobRepository();
    const queue = createDurableAnalysisQueue({
      jobRepository: repository,
      executeJob: async () => {
        throw new Error("python failed with /secret/model.pt and token=abc");
      },
      logger: { info() {}, warn() {}, error() {} },
      metrics: {},
      options: { maxRetries: 2, timeoutMs: 1000, defaultConcurrency: 1 },
    });

    queue.enqueue(createJob({ id: "job-retry" }));

    await waitFor(() => repository.get("job-retry")?.status === "failed");
    const committed = repository.get("job-retry");
    assert.equal(committed.attemptCount, 3);
    assert.equal(committed.retryCount, 2);
    assert.equal(committed.maxRetries, 2);
    assert.equal(committed.lastErrorCode, "execution_error");
  });

  it("requeues timed out running jobs with persisted retry metadata", () => {
    const repository = createMemoryJobRepository();
    repository.create(
      createJob({
        id: "job-timeout",
        status: "running",
        startedAt: "2026-05-26T00:00:00.000Z",
        attemptCount: 1,
        retryCount: 0,
        maxRetries: 1,
        timeoutMs: 1000,
      })
    );
    const queue = createDurableAnalysisQueue({
      jobRepository: repository,
      executeJob: async () => {},
      logger: { info() {}, warn() {}, error() {} },
      metrics: {},
      now: () => new Date("2026-05-26T00:00:02.000Z"),
      options: { maxRetries: 1, timeoutMs: 1000, defaultConcurrency: 1 },
    });

    queue.recoverTimedOutJobs({ includeOrphanedRunning: true });

    const committed = repository.get("job-timeout");
    assert.equal(committed.status, "queued");
    assert.equal(committed.retryCount, 1);
    assert.equal(committed.lastErrorCode, "timeout");
    assert.equal(committed.startedAt, null);
  });

  it("honors per-module concurrency limits", async () => {
    const repository = createMemoryJobRepository();
    const resolvers = [];
    const queue = createDurableAnalysisQueue({
      jobRepository: repository,
      executeJob: (job) =>
        new Promise((resolve) => {
          resolvers.push(() => {
            repository.update(job.id, { status: "completed", completedAt: "2026-05-26T00:02:00.000Z" });
            resolve();
          });
        }),
      logger: { info() {}, warn() {}, error() {} },
      metrics: {},
      options: {
        maxRetries: 0,
        timeoutMs: 10000,
        defaultConcurrency: 2,
        concurrencyLimits: { "ppe.no-helmet": 1 },
      },
    });

    queue.enqueue(createJob({ id: "job-1", moduleKey: "ppe.no-helmet" }));
    queue.enqueue(createJob({ id: "job-2", moduleKey: "ppe.no-helmet" }));

    await waitFor(() => queue.getActiveJobCount() === 1);
    assert.equal(repository.get("job-1").status, "running");
    assert.equal(repository.get("job-2").status, "queued");

    resolvers.shift()();
    await waitFor(() => repository.get("job-2")?.status === "running");
    assert.equal(queue.getActiveJobCount(), 1);
  });

  it("does not log or metric raw path/token metadata from queued jobs", async () => {
    const repository = createMemoryJobRepository();
    const logEntries = [];
    const metricsEntries = [];
    const queue = createDurableAnalysisQueue({
      jobRepository: repository,
      executeJob: async (job) => {
        repository.update(job.id, { status: "completed", completedAt: "2026-05-26T00:03:00.000Z" });
      },
      logger: {
        info(event, fields) {
          logEntries.push({ event, fields });
        },
        warn(event, fields) {
          logEntries.push({ event, fields });
        },
        error(event, fields) {
          logEntries.push({ event, fields });
        },
      },
      metrics: {
        recordJobQueued(fields) {
          metricsEntries.push(fields);
        },
        setQueueDepth() {},
      },
      options: { maxRetries: 0, timeoutMs: 1000, defaultConcurrency: 1 },
    });

    queue.enqueue(
      createJob({
        id: "job-log",
        videoPath: "/Users/private/video.mp4",
        commandArgs: ["--token", "secret-token-value", "--video", "/Users/private/video.mp4"],
      })
    );
    await waitFor(() => repository.get("job-log")?.status === "completed");

    const serialized = JSON.stringify({ logEntries, metricsEntries });
    assert.equal(serialized.includes("/Users/private/video.mp4"), false);
    assert.equal(serialized.includes("secret-token-value"), false);
  });
});
