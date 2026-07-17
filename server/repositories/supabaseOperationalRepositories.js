const { AnalysisJobConflictError } = require("./analysisStateRepositories");
const { MediaSourceConflictError } = require("./mediaSourceRepository");

const clone = (value) => JSON.parse(JSON.stringify(value));

class SupabaseRepositoryError extends Error {
  constructor(message = "Supabase repository operation failed.") {
    super(message);
    this.name = "SupabaseRepositoryError";
    this.code = "SUPABASE_REPOSITORY_ERROR";
    this.statusCode = 500;
  }
}

const assertSupabaseClient = (supabase) => {
  if (!supabase || typeof supabase.from !== "function") {
    throw new Error("supabase client is required.");
  }
};

const normalizeVersion = (value) => {
  const version = Number(value);
  return Number.isInteger(version) && version > 0 ? version : 1;
};

const getExpectedVersion = (options = {}) => {
  const expectedVersion = Number(options.expectedVersion);
  return Number.isInteger(expectedVersion) && expectedVersion > 0 ? expectedVersion : null;
};

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const cleanUndefined = (value) =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));

const parseIsoDate = (value) => {
  if (!value || typeof value !== "string") {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(value) ? parsed.toISOString() : null;
};

const executeSupabase = async (query, { expectSingle = false } = {}) => {
  const { data, error } = await query;
  if (error) {
    throw new SupabaseRepositoryError();
  }
  if (expectSingle && !data) {
    throw new SupabaseRepositoryError();
  }
  return data;
};

const replaceSupabaseRows = async ({ supabase, table, items, toRow, fromRow }) => {
  const desiredItems = Array.isArray(items) ? items : [];
  const desiredIds = new Set(desiredItems.map((item) => item?.id).filter(Boolean));
  const existingRows = await executeSupabase(supabase.from(table).select("*"));

  let committedRows = [];
  if (desiredItems.length > 0) {
    committedRows = await executeSupabase(
      supabase.from(table).upsert(desiredItems.map(toRow), { onConflict: "id" }).select("*")
    );
  }

  for (const row of Array.isArray(existingRows) ? existingRows : []) {
    if (!desiredIds.has(row.id)) {
      await executeSupabase(supabase.from(table).delete().eq("id", row.id).select("*"));
    }
  }

  if (desiredItems.length === 0) {
    return [];
  }

  return (Array.isArray(committedRows) ? committedRows : []).map((row) => clone(fromRow(row)));
};

const toComparableRecord = (item) => {
  const comparable = clone(item);
  delete comparable.createdAt;
  delete comparable.updatedAt;
  return comparable;
};

const stableStringify = (value) => {
  if (!isPlainObject(value) && !Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
};

const areBackfillRecordsEqual = (left, right) =>
  stableStringify(toComparableRecord(left)) === stableStringify(toComparableRecord(right));

const backfillOperationalRepository = async ({
  sourceRepository,
  targetRepository,
  dryRun = false,
  getId = (item) => item?.id,
  compareItems = areBackfillRecordsEqual,
} = {}) => {
  if (!sourceRepository || typeof sourceRepository.list !== "function") {
    throw new Error("sourceRepository.list is required.");
  }
  if (!targetRepository || typeof targetRepository.list !== "function") {
    throw new Error("targetRepository.list is required.");
  }

  const sourceItems = await sourceRepository.list();
  const targetItems = await targetRepository.list();
  const targetById = new Map((Array.isArray(targetItems) ? targetItems : []).map((item) => [getId(item), item]));
  const operations = [];
  const counts = {
    source: Array.isArray(sourceItems) ? sourceItems.length : 0,
    target: Array.isArray(targetItems) ? targetItems.length : 0,
    create: 0,
    update: 0,
    skip: 0,
    conflict: 0,
    written: 0,
  };

  for (const sourceItem of Array.isArray(sourceItems) ? sourceItems : []) {
    const id = getId(sourceItem);
    const targetItem = targetById.get(id);
    const baseOperation = {
      id,
      sourceVersion: normalizeVersion(sourceItem?.version),
      targetVersion: targetItem ? normalizeVersion(targetItem.version) : null,
    };

    if (!targetItem) {
      counts.create += 1;
      operations.push({ ...baseOperation, action: "create" });
    } else if (compareItems(sourceItem, targetItem)) {
      counts.skip += 1;
      operations.push({ ...baseOperation, action: "skip" });
    } else if (normalizeVersion(sourceItem?.version) <= normalizeVersion(targetItem.version)) {
      counts.conflict += 1;
      operations.push({ ...baseOperation, action: "conflict" });
    } else if (typeof targetRepository.update !== "function") {
      counts.conflict += 1;
      operations.push({ ...baseOperation, action: "conflict" });
    } else {
      counts.update += 1;
      operations.push({ ...baseOperation, action: "update" });
    }
  }

  if (!dryRun) {
    for (const operation of operations) {
      if (operation.action === "create") {
        const sourceItem = sourceItems.find((item) => getId(item) === operation.id);
        if (typeof targetRepository.create === "function") {
          await targetRepository.create(sourceItem);
        } else if (typeof targetRepository.append === "function") {
          await targetRepository.append(sourceItem);
        } else {
          throw new Error("targetRepository.create or targetRepository.append is required for backfill writes.");
        }
        counts.written += 1;
      } else if (operation.action === "update") {
        const sourceItem = sourceItems.find((item) => getId(item) === operation.id);
        await targetRepository.update(operation.id, () => sourceItem, { expectedVersion: operation.targetVersion });
        counts.written += 1;
      }
    }
  }

  return {
    dryRun: Boolean(dryRun),
    counts,
    operations,
  };
};

const toMediaSourceRow = (item) => {
  const lastSeenAt = parseIsoDate(item?.lastSeen);
  const metadata = {
    ...(isPlainObject(item?.metadata) ? item.metadata : {}),
  };
  if (item?.lastSeen && !lastSeenAt) {
    metadata.lastSeen = item.lastSeen;
  }

  return cleanUndefined({
    id: item.id,
    name: item.name,
    location: item.location ?? "",
    source_uri: item.source,
    source_kind: item.type || "upload",
    status: item.status || "active",
    analytics: Array.isArray(item.analytics) ? item.analytics : [],
    execution_mode: item.executionMode || "manual",
    monitoring_status: item.monitoringStatus || "idle",
    monitoring_interval_seconds: item.monitoringIntervalSeconds ?? null,
    note: item.note ?? "",
    last_seen_at: lastSeenAt,
    metadata,
    version: normalizeVersion(item.version),
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  });
};

const fromMediaSourceRow = (row) => {
  if (!row) {
    return null;
  }
  const metadata = isPlainObject(row.metadata) ? row.metadata : {};
  return cleanUndefined({
    id: row.id,
    name: row.name,
    location: row.location ?? "",
    source: row.source_uri,
    type: row.source_kind,
    status: row.status,
    analytics: Array.isArray(row.analytics) ? row.analytics : [],
    executionMode: row.execution_mode,
    monitoringStatus: row.monitoring_status,
    monitoringIntervalSeconds: row.monitoring_interval_seconds ?? null,
    note: row.note ?? "",
    lastSeen: metadata.lastSeen || row.last_seen_at || "",
    metadata,
    version: normalizeVersion(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
};

const toAnalysisJobRow = (job) => {
  const payload = {
    ...(isPlainObject(job?.payload) ? job.payload : {}),
  };
  ["videoPath", "outputDir", "commandArgs", "stdout", "stderr", "configSnapshot"].forEach((field) => {
    if (job?.[field] !== undefined) {
      payload[field] = job[field];
    }
  });

  return cleanUndefined({
    id: job.id,
    run_id: job.runId,
    media_source_id: job.mediaSourceId ?? null,
    module_key: job.moduleKey,
    analysis_type: job.analysisType,
    status: job.status || "queued",
    message: job.message || "",
    payload,
    summary: job.summary ?? null,
    artifact_prefix: job.artifactPrefix || job.outputDir || null,
    attempt_count: Number(job.attemptCount || 0),
    retry_count: Number(job.retryCount || 0),
    max_retries: Number.isInteger(Number(job.maxRetries)) ? Number(job.maxRetries) : 1,
    timeout_ms: Number.isInteger(Number(job.timeoutMs)) ? Number(job.timeoutMs) : 1800000,
    last_error_code: job.lastErrorCode ?? null,
    last_error_message: job.lastErrorMessage ?? null,
    queued_at: job.queuedAt || job.createdAt,
    started_at: job.startedAt ?? null,
    completed_at: job.completedAt ?? null,
    failed_at: job.failedAt ?? null,
    last_attempt_at: job.lastAttemptAt ?? null,
    next_attempt_at: job.nextAttemptAt ?? null,
    version: normalizeVersion(job.version),
    created_at: job.createdAt,
    updated_at: job.updatedAt,
  });
};

const fromAnalysisJobRow = (row) => {
  if (!row) {
    return null;
  }
  const payload = isPlainObject(row.payload) ? row.payload : {};
  return cleanUndefined({
    id: row.id,
    runId: row.run_id,
    mediaSourceId: row.media_source_id ?? null,
    moduleKey: row.module_key,
    analysisType: row.analysis_type,
    status: row.status,
    message: row.message || "",
    videoPath: payload.videoPath,
    outputDir: payload.outputDir || row.artifact_prefix || undefined,
    commandArgs: Array.isArray(payload.commandArgs) ? payload.commandArgs : undefined,
    stdout: payload.stdout || "",
    stderr: payload.stderr || "",
    configSnapshot: payload.configSnapshot,
    payload,
    summary: row.summary ?? null,
    artifactPrefix: row.artifact_prefix ?? null,
    attemptCount: Number(row.attempt_count || 0),
    retryCount: Number(row.retry_count || 0),
    maxRetries: Number(row.max_retries || 0),
    timeoutMs: Number(row.timeout_ms || 0),
    lastErrorCode: row.last_error_code ?? null,
    lastErrorMessage: row.last_error_message ?? null,
    queuedAt: row.queued_at,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    failedAt: row.failed_at ?? null,
    lastAttemptAt: row.last_attempt_at ?? null,
    nextAttemptAt: row.next_attempt_at ?? null,
    version: normalizeVersion(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
};

const toAnalysisHistoryRow = (entry) => {
  const outputMetadata = {
    ...(isPlainObject(entry?.outputMetadata) ? entry.outputMetadata : {}),
  };
  ["videoPath", "outputDir"].forEach((field) => {
    if (entry?.[field] !== undefined) {
      outputMetadata[field] = entry[field];
    }
  });

  return cleanUndefined({
    id: entry.id,
    run_id: entry.runId || entry.id,
    analysis_job_id: entry.analysisJobId || entry.jobId || null,
    media_source_id: entry.mediaSourceId ?? null,
    module_key: entry.moduleKey ?? null,
    analysis_type: entry.analysisType,
    source_name: entry.sourceName ?? null,
    location: entry.location ?? null,
    event_count: Number(entry.eventCount || 0),
    violator_count: Number(entry.violatorCount || 0),
    stable_detected_track_count: Number(entry.stableDetectedTrackCount || 0),
    raw_detected_track_count: Number(entry.rawDetectedTrackCount || 0),
    summary: isPlainObject(entry.summary) ? entry.summary : {},
    findings: Array.isArray(entry.findings) ? entry.findings : [],
    artifact_prefix: entry.artifactPrefix || entry.outputDir || null,
    output_metadata: outputMetadata,
    version: normalizeVersion(entry.version),
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  });
};

const fromAnalysisHistoryRow = (row) => {
  if (!row) {
    return null;
  }
  const outputMetadata = isPlainObject(row.output_metadata) ? row.output_metadata : {};
  return cleanUndefined({
    id: row.id,
    runId: row.run_id,
    analysisJobId: row.analysis_job_id ?? null,
    mediaSourceId: row.media_source_id ?? null,
    moduleKey: row.module_key ?? null,
    analysisType: row.analysis_type,
    sourceName: row.source_name ?? null,
    location: row.location ?? null,
    eventCount: Number(row.event_count || 0),
    violatorCount: Number(row.violator_count || 0),
    stableDetectedTrackCount: Number(row.stable_detected_track_count || 0),
    rawDetectedTrackCount: Number(row.raw_detected_track_count || 0),
    summary: isPlainObject(row.summary) ? row.summary : {},
    findings: Array.isArray(row.findings) ? row.findings : [],
    artifactPrefix: row.artifact_prefix ?? null,
    outputDir: outputMetadata.outputDir || row.artifact_prefix || undefined,
    videoPath: outputMetadata.videoPath,
    outputMetadata,
    version: normalizeVersion(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
};

const createSupabaseMediaSourceRepository = ({ supabase, normalizeItem = (item) => item }) => {
  assertSupabaseClient(supabase);
  const normalizeWithVersion = (item) =>
    normalizeItem({
      ...item,
      version: normalizeVersion(item?.version),
    });
  const fromRow = (row) => normalizeWithVersion(fromMediaSourceRow(row));

  return {
    async list() {
      const rows = await executeSupabase(
        supabase.from("media_sources").select("*").order("updated_at", { ascending: false })
      );
      return (Array.isArray(rows) ? rows : []).map((row) => clone(fromRow(row)));
    },

    async findById(id) {
      const row = await executeSupabase(
        supabase.from("media_sources").select("*").eq("id", id).maybeSingle()
      );
      return row ? clone(fromRow(row)) : null;
    },

    async get(id) {
      return this.findById(id);
    },

    async create(item) {
      const row = await executeSupabase(
        supabase.from("media_sources").insert(toMediaSourceRow(normalizeWithVersion(item))).select("*").single(),
        { expectSingle: true }
      );
      return clone(fromRow(row));
    },

    async update(id, updateFn, options = {}) {
      const current = await this.findById(id);
      if (!current) {
        return null;
      }
      const expectedVersion = getExpectedVersion(options);
      if (expectedVersion !== null && current.version !== expectedVersion) {
        throw new MediaSourceConflictError();
      }
      const nextDraft = typeof updateFn === "function" ? updateFn(clone(current)) : updateFn;
      const row = await executeSupabase(
        supabase
          .from("media_sources")
          .update(toMediaSourceRow(normalizeWithVersion({ ...current, ...nextDraft, id: current.id })))
          .eq("id", id)
          .eq("version", current.version)
          .select("*")
          .maybeSingle()
      );
      if (!row) {
        throw new MediaSourceConflictError();
      }
      return clone(fromRow(row));
    },

    async delete(id, options = {}) {
      const current = await this.findById(id);
      if (!current) {
        return null;
      }
      const expectedVersion = getExpectedVersion(options);
      if (expectedVersion !== null && current.version !== expectedVersion) {
        throw new MediaSourceConflictError();
      }
      const row = await executeSupabase(
        supabase.from("media_sources").delete().eq("id", id).eq("version", current.version).select("*").maybeSingle()
      );
      if (!row) {
        throw new MediaSourceConflictError();
      }
      return clone(fromRow(row));
    },

    async replaceAll(items) {
      return replaceSupabaseRows({
        supabase,
        table: "media_sources",
        items: (Array.isArray(items) ? items : []).map(normalizeWithVersion),
        toRow: toMediaSourceRow,
        fromRow,
      });
    },
  };
};

const createSupabaseAnalysisJobRepository = ({ supabase, normalizeJob = (job) => job }) => {
  assertSupabaseClient(supabase);
  const normalizeWithVersion = (job) =>
    normalizeJob({
      ...job,
      version: normalizeVersion(job?.version),
    });
  const fromRow = (row) => normalizeWithVersion(fromAnalysisJobRow(row));

  return {
    async list() {
      const rows = await executeSupabase(
        supabase.from("analysis_jobs").select("*").order("created_at", { ascending: false })
      );
      return (Array.isArray(rows) ? rows : []).map((row) => clone(fromRow(row)));
    },

    async get(id) {
      const row = await executeSupabase(
        supabase.from("analysis_jobs").select("*").eq("id", id).maybeSingle()
      );
      return row ? clone(fromRow(row)) : null;
    },

    async create(job) {
      const row = await executeSupabase(
        supabase.from("analysis_jobs").insert(toAnalysisJobRow(normalizeWithVersion(job))).select("*").single(),
        { expectSingle: true }
      );
      return clone(fromRow(row));
    },

    async update(id, updateFn, options = {}) {
      const current = await this.get(id);
      if (!current) {
        return null;
      }
      const expectedVersion = getExpectedVersion(options);
      if (expectedVersion !== null && current.version !== expectedVersion) {
        throw new AnalysisJobConflictError();
      }
      const nextDraft = typeof updateFn === "function" ? updateFn(clone(current)) : updateFn;
      const row = await executeSupabase(
        supabase
          .from("analysis_jobs")
          .update(toAnalysisJobRow(normalizeWithVersion({ ...current, ...nextDraft, id: current.id })))
          .eq("id", id)
          .eq("version", current.version)
          .select("*")
          .maybeSingle()
      );
      if (!row) {
        throw new AnalysisJobConflictError();
      }
      return clone(fromRow(row));
    },

    async delete(id) {
      const row = await executeSupabase(
        supabase.from("analysis_jobs").delete().eq("id", id).select("*").maybeSingle()
      );
      return row ? clone(fromRow(row)) : null;
    },

    async replaceAll(items) {
      return replaceSupabaseRows({
        supabase,
        table: "analysis_jobs",
        items: (Array.isArray(items) ? items : []).map(normalizeWithVersion),
        toRow: toAnalysisJobRow,
        fromRow,
      });
    },
  };
};

const createSupabaseAnalysisHistoryRepository = ({ supabase, normalizeEntry = (entry) => entry }) => {
  assertSupabaseClient(supabase);
  const fromRow = (row) => normalizeEntry(fromAnalysisHistoryRow(row));

  return {
    async list() {
      const rows = await executeSupabase(
        supabase.from("analysis_history").select("*").order("created_at", { ascending: false })
      );
      return (Array.isArray(rows) ? rows : []).map((row) => clone(fromRow(row)));
    },

    async append(entry) {
      const row = await executeSupabase(
        supabase.from("analysis_history").insert(toAnalysisHistoryRow(normalizeEntry(entry))).select("*").single(),
        { expectSingle: true }
      );
      return clone(fromRow(row));
    },

    async replaceAll(items) {
      return replaceSupabaseRows({
        supabase,
        table: "analysis_history",
        items: (Array.isArray(items) ? items : []).map(normalizeEntry),
        toRow: toAnalysisHistoryRow,
        fromRow,
      });
    },
  };
};

module.exports = {
  SupabaseRepositoryError,
  backfillOperationalRepository,
  createSupabaseAnalysisHistoryRepository,
  createSupabaseAnalysisJobRepository,
  createSupabaseMediaSourceRepository,
  fromAnalysisHistoryRow,
  fromAnalysisJobRow,
  fromMediaSourceRow,
  toAnalysisHistoryRow,
  toAnalysisJobRow,
  toMediaSourceRow,
};
