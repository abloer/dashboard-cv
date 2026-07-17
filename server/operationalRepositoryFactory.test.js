const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const {
  buildOperationalBackfillReport,
  getOperationalBackfillExitCode,
  runOperationalBackfill,
} = require("./operationalBackfill");
const {
  OperationalRepositoryConfigError,
  createOperationalRepositories,
  resolveOperationalRepositoryBackend,
} = require("./repositories/operationalRepositoryFactory");

const clone = (value) => JSON.parse(JSON.stringify(value));

const tempFile = (name) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "operational-repository-factory-test-"));
  return path.join(root, name);
};

const createMemoryMutableRepository = (initialItems = []) => {
  const calls = { create: 0, update: 0 };
  let items = initialItems.map(clone);
  return {
    calls,
    list() {
      return items.map(clone);
    },
    get(id) {
      const item = items.find((candidate) => candidate.id === id);
      return item ? clone(item) : null;
    },
    findById(id) {
      return this.get(id);
    },
    create(item) {
      calls.create += 1;
      const committed = { ...clone(item), version: Number(item.version || 1) };
      items = [committed, ...items.filter((candidate) => candidate.id !== committed.id)];
      return clone(committed);
    },
    update(id, update, _options = {}) {
      calls.update += 1;
      const index = items.findIndex((candidate) => candidate.id === id);
      if (index === -1) return null;
      const updated = {
        ...items[index],
        ...clone(update),
        id,
        version: Number(items[index].version || 1) + 1,
      };
      items[index] = updated;
      return clone(updated);
    },
  };
};

const createMemoryAppendRepository = (initialItems = []) => {
  const calls = { append: 0 };
  let items = initialItems.map(clone);
  return {
    calls,
    list() {
      return items.map(clone);
    },
    append(item) {
      calls.append += 1;
      const committed = { ...clone(item), version: Number(item.version || 1) };
      items = [committed, ...items.filter((candidate) => candidate.id !== committed.id)];
      return clone(committed);
    },
  };
};

const createBackfillRepositorySet = ({
  sourceMedia = [],
  targetMedia = [],
  sourceJobs = [],
  targetJobs = [],
  sourceHistory = [],
  targetHistory = [],
} = {}) => ({
  sourceRepositories: {
    mediaSourceRepository: createMemoryMutableRepository(sourceMedia),
    analysisJobRepository: createMemoryMutableRepository(sourceJobs),
    analysisHistoryRepository: createMemoryAppendRepository(sourceHistory),
  },
  targetRepositories: {
    mediaSourceRepository: createMemoryMutableRepository(targetMedia),
    analysisJobRepository: createMemoryMutableRepository(targetJobs),
    analysisHistoryRepository: createMemoryAppendRepository(targetHistory),
  },
});

const createBackfillRepositories = () => ({
  ...createBackfillRepositorySet({
    sourceMedia: [
      { id: "media-create", version: 1, name: "New media" },
      { id: "media-update", version: 2, name: "Updated media" },
    ],
    sourceJobs: [
      { id: "job-create", version: 1, runId: "run-create" },
      { id: "job-update", version: 2, runId: "run-update" },
    ],
    sourceHistory: [
      { id: "history-create", version: 1, runId: "run-history-create" },
      { id: "history-skip", version: 1, runId: "run-history-skip" },
    ],
    targetMedia: [
      { id: "media-update", version: 1, name: "Old media" },
    ],
    targetJobs: [
      { id: "job-update", version: 1, runId: "run-update" },
    ],
    targetHistory: [
      { id: "history-skip", version: 1, runId: "run-history-skip" },
    ],
  }),
});

describe("operational repository backend factory", () => {
  it("exposes strict dry-run scripts without enabling apply mode", () => {
    const rootPackage = require("../package.json");
    const serverPackage = require("./package.json");

    assert.match(
      rootPackage.scripts["backfill:operational:dry-run:strict"],
      /backfill:operational:dry-run:strict/
    );
    assert.match(
      serverPackage.scripts["backfill:operational:dry-run:strict"],
      /--strict-conflicts/
    );
    assert.doesNotMatch(
      serverPackage.scripts["backfill:operational:dry-run:strict"],
      /--apply/
    );
  });

  it("keeps JSON repositories as the default backend", () => {
    const repositories = createOperationalRepositories({
      env: {},
      json: {
        mediaSourcesPath: tempFile("media-sources.json"),
        analysisHistoryPath: tempFile("analysis-history.json"),
        analysisJobsPath: tempFile("analysis-jobs.json"),
      },
    });

    assert.equal(repositories.backend, "json");
    const created = repositories.mediaSourceRepository.create({
      id: "media-json",
      name: "JSON media",
      location: "Pit",
      source: "/managed/video.mp4",
    });
    assert.equal(created.id, "media-json");
    assert.equal(created.version, 1);
  });

  it("enables Supabase repositories only with explicit backend, flag, and credentials", () => {
    assert.throws(
      () => resolveOperationalRepositoryBackend({ OPERATIONAL_REPOSITORY_BACKEND: "supabase" }),
      OperationalRepositoryConfigError
    );
    assert.throws(
      () =>
        resolveOperationalRepositoryBackend({
          OPERATIONAL_REPOSITORY_BACKEND: "supabase",
          OPERATIONAL_REPOSITORY_SUPABASE_ENABLED: "true",
          SUPABASE_URL: "https://example.supabase.co",
        }),
      OperationalRepositoryConfigError
    );

    const backend = resolveOperationalRepositoryBackend({
      OPERATIONAL_REPOSITORY_BACKEND: "supabase",
      OPERATIONAL_REPOSITORY_SUPABASE_ENABLED: "true",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    });
    assert.equal(backend, "supabase");

    const repositories = createOperationalRepositories({
      env: {
        OPERATIONAL_REPOSITORY_BACKEND: "supabase",
        OPERATIONAL_REPOSITORY_SUPABASE_ENABLED: "true",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      },
      supabase: { from() {} },
    });
    assert.equal(repositories.backend, "supabase");
  });
});

describe("operational repository backfill utility", () => {
  it("skips same-version items only when canonical payload matches", async () => {
    const { sourceRepositories, targetRepositories } = createBackfillRepositorySet({
      sourceMedia: [
        {
          id: "media-skip",
          version: 1,
          name: "Same media",
          metadata: { b: 2, a: 1 },
        },
      ],
      targetMedia: [
        {
          metadata: { a: 1, b: 2 },
          name: "Same media",
          version: 1,
          id: "media-skip",
        },
      ],
    });

    const result = await runOperationalBackfill({ sourceRepositories, targetRepositories });

    assert.equal(result.summary.mediaSources.skip, 1);
    assert.equal(result.summary.mediaSources.conflict, 0);
    assert.equal(targetRepositories.mediaSourceRepository.calls.update, 0);
  });

  it("reports conflict for same-version mutable items with different payload", async () => {
    const { sourceRepositories, targetRepositories } = createBackfillRepositorySet({
      sourceMedia: [{ id: "media-conflict", version: 1, name: "Source media" }],
      targetMedia: [{ id: "media-conflict", version: 1, name: "Target media" }],
    });

    const result = await runOperationalBackfill({ sourceRepositories, targetRepositories });

    assert.equal(result.summary.mediaSources.skip, 0);
    assert.equal(result.summary.mediaSources.conflict, 1);
    assert.equal(targetRepositories.mediaSourceRepository.calls.update, 0);
  });

  it("ignores audit timestamp-only differences during canonical comparison", async () => {
    const { sourceRepositories, targetRepositories } = createBackfillRepositorySet({
      sourceMedia: [
        {
          id: "media-audit",
          version: 1,
          name: "Same media",
          createdAt: "2026-06-24T01:00:00.000Z",
          updatedAt: "2026-06-24T01:00:00.000Z",
        },
      ],
      targetMedia: [
        {
          id: "media-audit",
          version: 1,
          name: "Same media",
          createdAt: "2026-06-24T02:00:00.000Z",
          updatedAt: "2026-06-24T02:00:00.000Z",
        },
      ],
    });

    const result = await runOperationalBackfill({ sourceRepositories, targetRepositories });

    assert.equal(result.summary.mediaSources.skip, 1);
    assert.equal(result.summary.mediaSources.conflict, 0);
  });

  it("keeps business field differences as conflicts when audit fields differ", async () => {
    const { sourceRepositories, targetRepositories } = createBackfillRepositorySet({
      sourceMedia: [
        {
          id: "media-business",
          version: 1,
          name: "Business source",
          createdAt: "2026-06-24T01:00:00.000Z",
        },
      ],
      targetMedia: [
        {
          id: "media-business",
          version: 1,
          name: "Business target",
          createdAt: "2026-06-24T02:00:00.000Z",
        },
      ],
    });

    const result = await runOperationalBackfill({ sourceRepositories, targetRepositories });

    assert.equal(result.summary.mediaSources.skip, 0);
    assert.equal(result.summary.mediaSources.conflict, 1);
  });

  it("updates mutable target when source version is newer and payload differs", async () => {
    const { sourceRepositories, targetRepositories } = createBackfillRepositorySet({
      sourceMedia: [{ id: "media-update", version: 2, name: "Source media" }],
      targetMedia: [{ id: "media-update", version: 1, name: "Target media" }],
    });

    const result = await runOperationalBackfill({
      sourceRepositories,
      targetRepositories,
      apply: true,
      applyConfirmation: "apply",
    });

    assert.equal(result.summary.mediaSources.update, 1);
    assert.equal(result.summary.mediaSources.conflict, 0);
    assert.equal(targetRepositories.mediaSourceRepository.calls.update, 1);
  });

  it("reports conflict when target version is newer", async () => {
    const { sourceRepositories, targetRepositories } = createBackfillRepositorySet({
      sourceMedia: [{ id: "media-target-newer", version: 1, name: "Source media" }],
      targetMedia: [{ id: "media-target-newer", version: 2, name: "Target media" }],
    });

    const result = await runOperationalBackfill({ sourceRepositories, targetRepositories });

    assert.equal(result.summary.mediaSources.conflict, 1);
    assert.equal(result.summary.mediaSources.update, 0);
    assert.equal(targetRepositories.mediaSourceRepository.calls.update, 0);
  });

  it("reports conflict for duplicate append-only history with different payload", async () => {
    const { sourceRepositories, targetRepositories } = createBackfillRepositorySet({
      sourceHistory: [
        {
          id: "history-conflict",
          version: 1,
          runId: "run-source",
          eventCount: 2,
        },
      ],
      targetHistory: [
        {
          id: "history-conflict",
          version: 1,
          runId: "run-target",
          eventCount: 1,
        },
      ],
    });

    const result = await runOperationalBackfill({ sourceRepositories, targetRepositories });

    assert.equal(result.summary.analysisHistory.conflict, 1);
    assert.equal(result.summary.analysisHistory.skip, 0);
    assert.equal(targetRepositories.analysisHistoryRepository.calls.append, 0);
  });

  it("builds safe dry-run reports without raw path, secret, or payload values", async () => {
    const { sourceRepositories, targetRepositories } = createBackfillRepositorySet({
      sourceMedia: [
        {
          id: "media-sensitive",
          version: 1,
          name: "Source sensitive value",
          source: "/private/secret-camera.mp4",
          metadata: { token: "secret-token-value" },
        },
      ],
      targetMedia: [
        {
          id: "media-sensitive",
          version: 1,
          name: "Target sensitive value",
          source: "/private/target-camera.mp4",
          metadata: { token: "target-token-value" },
        },
      ],
    });

    const result = await runOperationalBackfill({
      sourceRepositories,
      targetRepositories,
      conflictSampleLimit: 1,
    });
    const report = buildOperationalBackfillReport(result, {
      includeConflictSamples: true,
    });
    const rendered = JSON.stringify(report);

    assert.equal(report.summary.mediaSources.conflict, 1);
    assert.equal(report.conflictSamples.mediaSources.length, 1);
    assert.match(report.conflictSamples.mediaSources[0].sourceChecksum, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(rendered, /secret-camera|target-camera|secret-token-value|target-token-value/);
    assert.doesNotMatch(rendered, /Source sensitive value|Target sensitive value/);
  });

  it("returns non-zero report exit code only when strict conflict mode is enabled", async () => {
    const { sourceRepositories, targetRepositories } = createBackfillRepositorySet({
      sourceMedia: [{ id: "media-conflict", version: 1, name: "Source media" }],
      targetMedia: [{ id: "media-conflict", version: 1, name: "Target media" }],
    });
    const conflictReport = buildOperationalBackfillReport(
      await runOperationalBackfill({ sourceRepositories, targetRepositories })
    );

    assert.equal(getOperationalBackfillExitCode(conflictReport), 0);
    assert.equal(getOperationalBackfillExitCode(conflictReport, { strictConflicts: true }), 1);

    const clean = createBackfillRepositorySet({
      sourceMedia: [{ id: "media-clean", version: 1, name: "Same media" }],
      targetMedia: [{ id: "media-clean", version: 1, name: "Same media" }],
    });
    const cleanReport = buildOperationalBackfillReport(
      await runOperationalBackfill({
        sourceRepositories: clean.sourceRepositories,
        targetRepositories: clean.targetRepositories,
      })
    );

    assert.equal(getOperationalBackfillExitCode(cleanReport, { strictConflicts: true }), 0);
  });

  it("runs dry-run by default without mutating target repositories", async () => {
    const { sourceRepositories, targetRepositories } = createBackfillRepositories();
    const result = await runOperationalBackfill({
      sourceRepositories,
      targetRepositories,
    });

    assert.equal(result.mode, "dry-run");
    assert.equal(result.summary.mediaSources.create, 1);
    assert.equal(result.summary.mediaSources.update, 1);
    assert.equal(result.summary.analysisJobs.create, 1);
    assert.equal(result.summary.analysisJobs.update, 1);
    assert.equal(result.summary.analysisHistory.create, 1);
    assert.equal(result.summary.analysisHistory.skip, 1);
    assert.equal(targetRepositories.mediaSourceRepository.calls.create, 0);
    assert.equal(targetRepositories.mediaSourceRepository.calls.update, 0);
    assert.equal(targetRepositories.analysisHistoryRepository.calls.append, 0);
  });

  it("applies backfill only with explicit apply confirmation", async () => {
    const blocked = createBackfillRepositories();
    await assert.rejects(
      () =>
        runOperationalBackfill({
          sourceRepositories: blocked.sourceRepositories,
          targetRepositories: blocked.targetRepositories,
          apply: true,
        }),
      OperationalRepositoryConfigError
    );

    const { sourceRepositories, targetRepositories } = createBackfillRepositories();
    const result = await runOperationalBackfill({
      sourceRepositories,
      targetRepositories,
      apply: true,
      applyConfirmation: "apply",
    });

    assert.equal(result.mode, "apply");
    assert.equal(targetRepositories.mediaSourceRepository.calls.create, 1);
    assert.equal(targetRepositories.mediaSourceRepository.calls.update, 1);
    assert.equal(targetRepositories.analysisJobRepository.calls.create, 1);
    assert.equal(targetRepositories.analysisJobRepository.calls.update, 1);
    assert.equal(targetRepositories.analysisHistoryRepository.calls.append, 1);
  });
});
