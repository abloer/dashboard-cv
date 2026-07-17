const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { AnalysisJobConflictError } = require("./repositories/analysisStateRepositories");
const { MediaSourceConflictError } = require("./repositories/mediaSourceRepository");
const {
  SupabaseRepositoryError,
  backfillOperationalRepository,
  createSupabaseAnalysisHistoryRepository,
  createSupabaseAnalysisJobRepository,
  createSupabaseMediaSourceRepository,
  fromMediaSourceRow,
  toMediaSourceRow,
} = require("./repositories/supabaseOperationalRepositories");

const clone = (value) => JSON.parse(JSON.stringify(value));
const now = "2026-06-24T00:00:00.000Z";

class MockSupabaseQuery {
  constructor(store, table) {
    this.store = store;
    this.table = table;
    this.action = "select";
    this.filters = [];
    this.orderSpec = null;
    this.payload = null;
    this.singleMode = false;
  }

  select(_columns = "*") {
    return this;
  }

  order(column, options = {}) {
    this.orderSpec = { column, ascending: options.ascending !== false };
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, value });
    return this;
  }

  insert(payload) {
    this.action = "insert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  update(payload) {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload, _options = {}) {
    this.action = "upsert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  single() {
    this.singleMode = true;
    return this.execute();
  }

  maybeSingle() {
    this.singleMode = true;
    return this.execute({ maybe: true });
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  execute() {
    if (this.store.failNext) {
      this.store.failNext = false;
      return Promise.resolve({
        data: null,
        error: { message: "secret-token /tmp/private-path should not leak" },
      });
    }

    const table = this.store.tables[this.table] || [];
    const matches = (row) => this.filters.every((filter) => row[filter.column] === filter.value);
    let result;

    if (this.action === "insert") {
      result = this.payload.map((row) => ({
        version: 1,
        created_at: now,
        updated_at: now,
        ...clone(row),
      }));
      this.store.tables[this.table] = [...result, ...table];
    } else if (this.action === "update") {
      result = [];
      this.store.tables[this.table] = table.map((row) => {
        if (!matches(row)) {
          return row;
        }
        const updated = {
          ...row,
          ...clone(this.payload),
          id: row.id,
          version: Number(row.version || 1) + 1,
          updated_at: now,
        };
        result.push(updated);
        return updated;
      });
    } else if (this.action === "upsert") {
      const existingById = new Map(table.map((row) => [row.id, row]));
      result = this.payload.map((row) => {
        const existing = existingById.get(row.id);
        if (!existing) {
          return {
            version: 1,
            created_at: now,
            updated_at: now,
            ...clone(row),
          };
        }
        return {
          ...existing,
          ...clone(row),
          id: existing.id,
          version: Number(existing.version || 1) + 1,
          updated_at: now,
        };
      });
      const upsertIds = new Set(result.map((row) => row.id));
      this.store.tables[this.table] = [
        ...result,
        ...table.filter((row) => !upsertIds.has(row.id)),
      ];
    } else if (this.action === "delete") {
      result = table.filter(matches);
      this.store.tables[this.table] = table.filter((row) => !matches(row));
    } else {
      result = table.filter(matches).map(clone);
    }

    if (this.orderSpec) {
      const { column, ascending } = this.orderSpec;
      result.sort((left, right) => {
        const compared = String(left[column] || "").localeCompare(String(right[column] || ""));
        return ascending ? compared : -compared;
      });
    }

    return Promise.resolve({
      data: this.singleMode ? result[0] || null : result,
      error: null,
    });
  }
}

const createMockSupabase = (tables = {}) => {
  const store = {
    failNext: false,
    tables: {
      media_sources: [],
      analysis_jobs: [],
      analysis_history: [],
      ...clone(tables),
    },
  };

  return {
    store,
    client: {
      from(table) {
        return new MockSupabaseQuery(store, table);
      },
    },
  };
};

const normalizeMediaSource = (item) => ({
  ...item,
  type: item.type || "upload",
  status: item.status || "active",
  analytics: Array.isArray(item.analytics) ? item.analytics : [],
  executionMode: item.executionMode || "manual",
  monitoringStatus: item.monitoringStatus || "idle",
  monitoringIntervalSeconds: item.monitoringIntervalSeconds ?? null,
});

describe("Supabase operational repository adapters", () => {
  it("maps media source camelCase runtime fields to snake_case table rows", () => {
    const row = toMediaSourceRow({
      id: "media-1",
      name: "Camera 1",
      location: "Pit A",
      source: "rtsp://camera/live",
      type: "camera",
      status: "active",
      analytics: ["PPE"],
      executionMode: "scheduled",
      monitoringStatus: "paused",
      monitoringIntervalSeconds: 30,
      lastSeen: "Camera online",
      version: 2,
      createdAt: now,
      updatedAt: now,
    });

    assert.equal(row.source_uri, "rtsp://camera/live");
    assert.equal(row.source_kind, "camera");
    assert.equal(row.execution_mode, "scheduled");
    assert.equal(row.monitoring_interval_seconds, 30);
    assert.equal(row.metadata.lastSeen, "Camera online");

    const runtime = fromMediaSourceRow(row);
    assert.equal(runtime.source, "rtsp://camera/live");
    assert.equal(runtime.type, "camera");
    assert.equal(runtime.executionMode, "scheduled");
    assert.equal(runtime.monitoringIntervalSeconds, 30);
    assert.equal(runtime.lastSeen, "Camera online");
  });

  it("lists, reads, creates, and updates media sources with committed versions", async () => {
    const { client, store } = createMockSupabase();
    const repository = createSupabaseMediaSourceRepository({
      supabase: client,
      normalizeItem: normalizeMediaSource,
    });

    const created = await repository.create({
      id: "media-1",
      name: "Upload 1",
      location: "Pit A",
      source: "/managed/upload.mp4",
      type: "upload",
      analytics: ["PPE"],
      createdAt: now,
      updatedAt: now,
    });
    assert.equal(created.version, 1);
    assert.equal(store.tables.media_sources[0].source_uri, "/managed/upload.mp4");

    const found = await repository.get("media-1");
    assert.equal(found.source, "/managed/upload.mp4");

    const updated = await repository.update(
      "media-1",
      { status: "inactive" },
      { expectedVersion: created.version }
    );
    assert.equal(updated.status, "inactive");
    assert.equal(updated.version, 2);

    const listed = await repository.list();
    assert.deepEqual(listed.map((item) => item.id), ["media-1"]);
  });

  it("replaces all operational repository rows with committed Supabase data", async () => {
    const { client, store } = createMockSupabase({
      media_sources: [
        {
          id: "media-stale",
          name: "Stale",
          location: "Old Pit",
          source_uri: "/old.mp4",
          source_kind: "upload",
          status: "active",
          analytics: [],
          execution_mode: "manual",
          monitoring_status: "idle",
          monitoring_interval_seconds: null,
          note: "",
          metadata: {},
          version: 1,
          created_at: now,
          updated_at: now,
        },
      ],
    });
    const mediaRepository = createSupabaseMediaSourceRepository({
      supabase: client,
      normalizeItem: normalizeMediaSource,
    });
    const jobRepository = createSupabaseAnalysisJobRepository({ supabase: client });
    const historyRepository = createSupabaseAnalysisHistoryRepository({ supabase: client });

    const mediaRows = await mediaRepository.replaceAll([
      {
        id: "media-1",
        name: "Upload 1",
        location: "Pit A",
        source: "/managed/upload.mp4",
        type: "upload",
        version: 1,
      },
    ]);
    assert.deepEqual(mediaRows.map((item) => item.id), ["media-1"]);
    assert.deepEqual(store.tables.media_sources.map((row) => row.id), ["media-1"]);

    const jobRows = await jobRepository.replaceAll([
      {
        id: "job-1",
        runId: "run-1",
        mediaSourceId: "media-1",
        moduleKey: "ppe.no-helmet",
        analysisType: "no_helmet",
        status: "queued",
        version: 1,
      },
    ]);
    assert.deepEqual(jobRows.map((item) => item.id), ["job-1"]);
    assert.equal(store.tables.analysis_jobs[0].run_id, "run-1");

    const historyRows = await historyRepository.replaceAll([
      {
        id: "history-1",
        runId: "run-1",
        analysisJobId: "job-1",
        mediaSourceId: "media-1",
        analysisType: "no_helmet",
        eventCount: 1,
        version: 1,
      },
    ]);
    assert.deepEqual(historyRows.map((item) => item.id), ["history-1"]);
    assert.equal(store.tables.analysis_history[0].analysis_job_id, "job-1");

    store.failNext = true;
    await assert.rejects(
      () => mediaRepository.replaceAll([]),
      (error) => {
        assert.ok(error instanceof SupabaseRepositoryError);
        assert.equal(error.message.includes("secret-token"), false);
        return true;
      }
    );
  });

  it("rejects stale media source updates and returns sanitized Supabase errors", async () => {
    const { client, store } = createMockSupabase();
    const repository = createSupabaseMediaSourceRepository({
      supabase: client,
      normalizeItem: normalizeMediaSource,
    });
    const created = await repository.create({
      id: "media-stale",
      name: "Camera",
      location: "Pit",
      source: "rtsp://camera/live",
      type: "camera",
    });
    await repository.update("media-stale", { status: "inactive" }, { expectedVersion: created.version });

    await assert.rejects(
      () => repository.update("media-stale", { status: "active" }, { expectedVersion: created.version }),
      MediaSourceConflictError
    );

    store.failNext = true;
    await assert.rejects(
      () => repository.list(),
      (error) => {
        assert.ok(error instanceof SupabaseRepositoryError);
        assert.equal(error.message.includes("secret-token"), false);
        assert.equal(error.message.includes("/tmp/private-path"), false);
        return true;
      }
    );
  });

  it("updates analysis job lifecycle with optimistic concurrency", async () => {
    const { client } = createMockSupabase();
    const repository = createSupabaseAnalysisJobRepository({ supabase: client });

    const created = await repository.create({
      id: "job-1",
      runId: "run-1",
      mediaSourceId: "media-1",
      moduleKey: "ppe.no-helmet",
      analysisType: "no_helmet",
      status: "queued",
      message: "Queued",
      outputDir: "/runtime/run-1",
      commandArgs: ["analyze.py"],
      configSnapshot: { confidenceThreshold: 0.5 },
      createdAt: now,
    });
    assert.equal(created.version, 1);
    assert.equal(created.outputDir, "/runtime/run-1");
    assert.deepEqual(created.configSnapshot, { confidenceThreshold: 0.5 });

    const running = await repository.update(
      "job-1",
      { status: "running", startedAt: now, attemptCount: 1 },
      { expectedVersion: created.version }
    );
    assert.equal(running.status, "running");
    assert.equal(running.version, 2);

    const completed = await repository.update("job-1", {
      status: "completed",
      completedAt: now,
      summary: { event_count: 3 },
    });
    assert.equal(completed.status, "completed");
    assert.deepEqual(completed.summary, { event_count: 3 });

    await assert.rejects(
      () => repository.update("job-1", { status: "failed" }, { expectedVersion: created.version }),
      AnalysisJobConflictError
    );
  });

  it("appends and lists analysis history with explicit snake_case mapping", async () => {
    const { client, store } = createMockSupabase();
    const repository = createSupabaseAnalysisHistoryRepository({
      supabase: client,
      normalizeEntry: (entry) => ({
        ...entry,
        eventCount: Number(entry.eventCount || 0),
      }),
    });

    const appended = await repository.append({
      id: "history-1",
      runId: "run-1",
      analysisJobId: "job-1",
      mediaSourceId: "media-1",
      moduleKey: "ppe.no-helmet",
      analysisType: "no_helmet",
      sourceName: "Camera 1",
      location: "Pit A",
      eventCount: "2",
      violatorCount: 1,
      outputDir: "/runtime/run-1",
      videoPath: "/managed/upload.mp4",
      findings: [{ id: "finding-1" }],
      createdAt: now,
    });

    assert.equal(appended.eventCount, 2);
    assert.equal(appended.outputDir, "/runtime/run-1");
    assert.equal(store.tables.analysis_history[0].analysis_job_id, "job-1");
    assert.equal(store.tables.analysis_history[0].event_count, 2);
    assert.deepEqual(store.tables.analysis_history[0].findings, [{ id: "finding-1" }]);

    const listed = await repository.list();
    assert.deepEqual(listed.map((item) => item.id), ["history-1"]);
    assert.equal(listed[0].videoPath, "/managed/upload.mp4");
  });

  it("dry-runs and applies idempotent backfill from JSON-shaped repositories", async () => {
    const { client, store } = createMockSupabase({
      media_sources: [
        {
          id: "media-existing",
          name: "Existing",
          location: "Pit A",
          source_uri: "/managed/existing.mp4",
          source_kind: "upload",
          status: "active",
          analytics: [],
          execution_mode: "manual",
          monitoring_status: "idle",
          monitoring_interval_seconds: null,
          note: "",
          metadata: {},
          version: 1,
          created_at: now,
          updated_at: now,
        },
      ],
    });
    const sourceRepository = {
      list() {
        return [
          {
            id: "media-existing",
            name: "Existing",
            location: "Pit A",
            source: "/managed/existing.mp4",
            type: "upload",
            status: "inactive",
            analytics: [],
            executionMode: "manual",
            monitoringStatus: "idle",
            monitoringIntervalSeconds: null,
            note: "",
            lastSeen: "",
            metadata: {},
            version: 2,
          },
          {
            id: "media-new",
            name: "New",
            location: "Pit B",
            source: "/managed/new.mp4",
            type: "upload",
            status: "active",
            analytics: [],
            executionMode: "manual",
            monitoringStatus: "idle",
            monitoringIntervalSeconds: null,
            note: "",
            lastSeen: "",
            metadata: {},
            version: 1,
          },
        ];
      },
    };
    const targetRepository = createSupabaseMediaSourceRepository({
      supabase: client,
      normalizeItem: normalizeMediaSource,
    });

    const dryRun = await backfillOperationalRepository({
      sourceRepository,
      targetRepository,
      dryRun: true,
    });
    assert.deepEqual(dryRun.counts, {
      source: 2,
      target: 1,
      create: 1,
      update: 1,
      skip: 0,
      conflict: 0,
      written: 0,
    });
    assert.equal(store.tables.media_sources.length, 1);
    assert.equal(store.tables.media_sources[0].status, "active");

    const applied = await backfillOperationalRepository({ sourceRepository, targetRepository });
    assert.equal(applied.counts.written, 2);
    const committed = await targetRepository.list();
    assert.deepEqual(committed.map((item) => item.id).sort(), ["media-existing", "media-new"]);
    assert.equal(committed.find((item) => item.id === "media-existing").status, "inactive");

    const secondDryRun = await backfillOperationalRepository({
      sourceRepository,
      targetRepository,
      dryRun: true,
    });
    assert.equal(secondDryRun.counts.skip, 2);
    assert.equal(secondDryRun.counts.create, 0);
    assert.equal(secondDryRun.counts.update, 0);
    assert.equal(secondDryRun.counts.conflict, 0);
  });

  it("reports conflicts when target data is newer than JSON backfill source", async () => {
    const { client, store } = createMockSupabase({
      media_sources: [
        {
          id: "media-conflict",
          name: "Target Newer",
          location: "Pit A",
          source_uri: "/managed/target.mp4",
          source_kind: "upload",
          status: "maintenance",
          analytics: [],
          execution_mode: "manual",
          monitoring_status: "idle",
          monitoring_interval_seconds: null,
          note: "",
          metadata: {},
          version: 2,
          created_at: now,
          updated_at: now,
        },
      ],
    });
    const sourceRepository = {
      list() {
        return [
          {
            id: "media-conflict",
            name: "Source Older",
            location: "Pit A",
            source: "/managed/source.mp4",
            type: "upload",
            status: "active",
            analytics: [],
            executionMode: "manual",
            monitoringStatus: "idle",
            monitoringIntervalSeconds: null,
            note: "",
            lastSeen: "",
            metadata: {},
            version: 1,
          },
        ];
      },
    };
    const targetRepository = createSupabaseMediaSourceRepository({
      supabase: client,
      normalizeItem: normalizeMediaSource,
    });

    const result = await backfillOperationalRepository({ sourceRepository, targetRepository });
    assert.equal(result.counts.conflict, 1);
    assert.equal(result.counts.written, 0);
    assert.equal(store.tables.media_sources[0].name, "Target Newer");
  });
});
