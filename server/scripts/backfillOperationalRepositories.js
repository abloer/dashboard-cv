#!/usr/bin/env node
const path = require("node:path");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");
const { normalizeMediaSource } = require("../mediaSources");
const {
  createJsonAnalysisHistoryRepository,
  createJsonAnalysisJobRepository,
} = require("../repositories/analysisStateRepositories");
const { createJsonMediaSourceRepository } = require("../repositories/mediaSourceRepository");
const {
  createOperationalRepositories,
  OperationalRepositoryConfigError,
} = require("../repositories/operationalRepositoryFactory");
const {
  buildOperationalBackfillReport,
  getOperationalBackfillExitCode,
  runOperationalBackfill,
} = require("../operationalBackfill");

dotenv.config();

const serverRoot = path.resolve(__dirname, "..");

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const strictConflicts = args.has("--strict-conflicts");
const applyConfirmation = process.env.OPERATIONAL_REPOSITORY_BACKFILL_CONFIRM || "";
const sampleArg = process.argv
  .slice(2)
  .find((arg) => arg.startsWith("--conflict-samples="));
const conflictSampleLimit = Math.max(
  0,
  Number.parseInt(sampleArg?.split("=")[1] || process.env.OPERATIONAL_REPOSITORY_BACKFILL_CONFLICT_SAMPLES || "0", 10) || 0
);

const resolveDataPath = (envName, fallback) => path.resolve(process.env[envName] || path.join(serverRoot, "data", fallback));

const normalizeAnalysisHistoryEntry = (entry) => ({
  ...entry,
  eventCount: Number(entry?.eventCount || 0),
  violatorCount: Number(entry?.violatorCount || 0),
  stableDetectedTrackCount: Number(entry?.stableDetectedTrackCount || 0),
  rawDetectedTrackCount: Number(entry?.rawDetectedTrackCount || 0),
});

const normalizeAnalysisJob = (job) => ({
  ...job,
  status: job?.status || "queued",
  createdAt: job?.createdAt || new Date().toISOString(),
  queuedAt: job?.queuedAt || job?.createdAt || new Date().toISOString(),
  startedAt: job?.startedAt || null,
  completedAt: job?.completedAt || null,
  failedAt: job?.failedAt || null,
  attemptCount: Number.isInteger(Number(job?.attemptCount)) ? Number(job.attemptCount) : 0,
  retryCount: Number.isInteger(Number(job?.retryCount)) ? Number(job.retryCount) : 0,
  maxRetries: Number.isInteger(Number(job?.maxRetries)) ? Number(job.maxRetries) : 1,
  timeoutMs: Number.isInteger(Number(job?.timeoutMs)) ? Number(job.timeoutMs) : 1800000,
  lastAttemptAt: job?.lastAttemptAt || null,
  nextAttemptAt: job?.nextAttemptAt || null,
  lastErrorCode: job?.lastErrorCode || null,
  lastErrorMessage: job?.lastErrorMessage || null,
  stdout: job?.stdout || "",
  stderr: job?.stderr || "",
  summary: job?.summary || null,
});

const createJsonSourceRepositories = () => ({
  mediaSourceRepository: createJsonMediaSourceRepository({
    filePath: resolveDataPath("MEDIA_REGISTRY_PATH", "media-sources.json"),
    defaultItems: [],
    normalizeItem: normalizeMediaSource,
  }),
  analysisHistoryRepository: createJsonAnalysisHistoryRepository({
    filePath: resolveDataPath("ANALYSIS_HISTORY_PATH", "analysis-history.json"),
    normalizeEntry: normalizeAnalysisHistoryEntry,
  }),
  analysisJobRepository: createJsonAnalysisJobRepository({
    filePath: resolveDataPath("ANALYSIS_JOBS_PATH", "analysis-jobs.json"),
    normalizeJob: normalizeAnalysisJob,
  }),
});

const createSupabaseTargetRepositories = () => {
  const credential = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (String(process.env.OPERATIONAL_REPOSITORY_SUPABASE_ENABLED || "").toLowerCase() !== "true") {
    throw new OperationalRepositoryConfigError(
      "Supabase operational repository backend requires OPERATIONAL_REPOSITORY_SUPABASE_ENABLED=true."
    );
  }
  if (!process.env.SUPABASE_URL || !credential) {
    throw new OperationalRepositoryConfigError(
      "Supabase operational repository backend requires SUPABASE_URL and a Supabase service or anon key."
    );
  }
  const supabase = createClient(process.env.SUPABASE_URL, credential, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return createOperationalRepositories({
    env: {
      ...process.env,
      OPERATIONAL_REPOSITORY_BACKEND: "supabase",
      OPERATIONAL_REPOSITORY_SUPABASE_ENABLED: process.env.OPERATIONAL_REPOSITORY_SUPABASE_ENABLED,
    },
    supabase,
    normalizers: {
      normalizeMediaSource,
      normalizeAnalysisHistoryEntry,
      normalizeAnalysisJob,
    },
  });
};

const main = async () => {
  const sourceRepositories = createJsonSourceRepositories();
  const targetRepositories = createSupabaseTargetRepositories();
  const result = await runOperationalBackfill({
    sourceRepositories,
    targetRepositories,
    apply,
    applyConfirmation,
    conflictSampleLimit,
  });
  const report = buildOperationalBackfillReport(result, {
    includeConflictSamples: conflictSampleLimit > 0,
  });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = getOperationalBackfillExitCode(report, { strictConflicts });
};

main().catch((error) => {
  const isConfigError = error instanceof OperationalRepositoryConfigError;
  const status = {
    ok: false,
    code: error?.code || "OPERATIONAL_BACKFILL_FAILED",
    message: isConfigError ? error.message : "Operational backfill failed.",
  };
  console.error(JSON.stringify(status, null, 2));
  process.exit(1);
});
