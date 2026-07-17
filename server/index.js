const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const fs = require("fs");
const path = require("path");
const { execFile, execFileSync } = require("child_process");
const { createClient } = require("@supabase/supabase-js");
const {
  cleanupAnalysisArtifacts,
  createArtifactAccess,
  createArtifactRouter,
} = require("./artifacts");
const {
  createAuthBoundary,
  validateAuthRuntimeConfig,
} = require("./auth");
const {
  createJsonMediaSourceRepository,
} = require("./repositories/mediaSourceRepository");
const {
  createMediaSourceRouter,
  createMediaSourceStorageValidator,
  normalizeMediaSource,
} = require("./mediaSources");
const {
  createJsonModuleConfigRepository,
} = require("./repositories/moduleConfigRepository");
const {
  createModuleConfigBoundary,
  createModuleConfigDefinitions,
} = require("./moduleConfigs");
const {
  createJsonAnalysisHistoryRepository,
  createJsonAnalysisJobRepository,
  AnalysisJobConflictError,
} = require("./repositories/analysisStateRepositories");
const {
  createJsonModelRegistryCollectionRepository,
  createJsonModelVersionRepository,
} = require("./repositories/modelRegistryRepository");
const {
  createDefaultModelVersionSeeds,
  createModelRegistryBoundary,
  modelBenchmarkSchema,
  modelDatasetSchema,
  modelEvaluationSchema,
  modelTrainingJobSchema,
  modelVersionSchema,
  normalizeModelRegistryItem,
} = require("./modelRegistry");
const {
  DEFAULT_AI_ASSIST_CONFIG,
  createAiAssistBoundary,
} = require("./aiAssist");
const {
  createDashboardSummaryBoundary,
} = require("./dashboardSummary");
const {
  createSourcePreviewUploadBoundary,
} = require("./sourcePreviewUploads");
const {
  createSyncBoundary,
} = require("./sync");
const {
  createAnalysisBoundary,
} = require("./analysisRoutes");
const {
  createAnalysisSummaryHelpers,
} = require("./analysisSummaries");
const {
  createLiveMonitoringRuntime,
} = require("./liveMonitoringRuntime");
const {
  createOperationalMetrics,
  createObservabilityRouter,
  createRateLimiter,
  createRequestContextMiddleware: createBaseRequestContextMiddleware,
  createSensitiveRateLimitMiddleware,
  createStructuredLogger,
  getSafeAuthLogMetadata,
  getSafeErrorLogMetadata,
  renderPrometheusMetrics,
} = require("./observability");

dotenv.config();

const app = express();

const logger = createStructuredLogger();

const operationalMetrics = createOperationalMetrics();
const createRequestContextMiddleware = (requestLogger = logger, options = {}) =>
  createBaseRequestContextMiddleware(requestLogger, {
    getSafeAuthLogMetadata,
    ...options,
  });
const requestContextMiddleware = createRequestContextMiddleware(logger, {
  metrics: operationalMetrics,
});

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  PORT = 8081,
  HOST = "127.0.0.1",
  ANALYSIS_OUTPUT_ROOT,
  AUTH_JWT_SECRET,
  AUTH_TOKEN_ADMIN,
  AUTH_SESSION_RATE_LIMIT_WINDOW_MS = "60000",
  AUTH_SESSION_RATE_LIMIT_MAX = "10",
  CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080",
  ARTIFACT_URL_SECRET,
  ARTIFACT_URL_TTL_SECONDS = "900",
  ARTIFACT_RETENTION_DAYS = "7",
  ARTIFACT_RETENTION_MAX_BYTES = String(10 * 1024 * 1024 * 1024),
  SOURCE_PREVIEW_RATE_LIMIT_WINDOW_MS = "60000",
  SOURCE_PREVIEW_RATE_LIMIT_MAX = "20",
  ANALYSIS_ALLOWED_MODEL_ROOTS = "",
  ANALYSIS_ALLOWED_CONFIG_ROOTS = "",
  SOURCE_PREVIEW_ALLOWED_SCHEMES = "rtsp",
  SOURCE_PREVIEW_ALLOW_PRIVATE_IPS = "false",
} = process.env;

const allowedCorsOrigins = new Set(
  CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

const artifactSigningSecret = ARTIFACT_URL_SECRET || AUTH_JWT_SECRET || AUTH_TOKEN_ADMIN;
const artifactUrlTtlSeconds = Number(ARTIFACT_URL_TTL_SECONDS) || 900;
const artifactRetentionMaxAgeMs = Math.max(1, Number(ARTIFACT_RETENTION_DAYS) || 7) * 24 * 60 * 60 * 1000;
const artifactRetentionMaxBytes = Math.max(0, Number(ARTIFACT_RETENTION_MAX_BYTES) || 0);
const artifactAccess = createArtifactAccess({ signingSecret: artifactSigningSecret });
const authBoundary = createAuthBoundary({
  env: process.env,
  artifactAccess,
});

const isCorsOriginAllowed = (origin) => !origin || allowedCorsOrigins.has(origin);

app.use(requestContextMiddleware);
app.use(
  cors({
    origin(origin, callback) {
      if (isCorsOriginAllowed(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    optionsSuccessStatus: 204,
  })
);
app.use(express.json({ limit: "5mb" }));

const authSessionRateLimiter = createRateLimiter({
  windowMs: Number(AUTH_SESSION_RATE_LIMIT_WINDOW_MS) || 60000,
  max: Number(AUTH_SESSION_RATE_LIMIT_MAX) || 10,
});
const sourcePreviewRateLimiter = createRateLimiter({
  windowMs: Number(SOURCE_PREVIEW_RATE_LIMIT_WINDOW_MS) || 60000,
  max: Number(SOURCE_PREVIEW_RATE_LIMIT_MAX) || 20,
});

const getRequestClientKey = (req) =>
  String(req.header("x-forwarded-for") || req.ip || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();

app.use(
  createSensitiveRateLimitMiddleware({
    authSessionRateLimiter,
    sourcePreviewRateLimiter,
    getRequestClientKey,
  })
);
app.use(authBoundary.authenticateRequest);

const repoRoot = path.resolve(__dirname, "..");
const analysisScriptPath = path.resolve(
  repoRoot,
  "tools/no_helmet_analysis/analyze_no_helmet.py"
);
const workingAtHeightScriptPath = path.resolve(
  repoRoot,
  "tools/no_helmet_analysis/analyze_presence_zone.py"
);
const redLightViolationScriptPath = path.resolve(
  repoRoot,
  "tools/no_helmet_analysis/analyze_red_light_violation.py"
);
const dumpTruckBedOpenScriptPath = path.resolve(
  repoRoot,
  "tools/no_helmet_analysis/analyze_dump_truck_bed_open.py"
);
const defaultRoiConfigPath = path.resolve(
  repoRoot,
  "tools/no_helmet_analysis/area_produksi.roi.json"
);
const defaultModelPath = path.resolve(
  process.env.ANALYSIS_DEFAULT_MODEL_PATH || path.join(repoRoot, "models/detect-construction-safety-best.pt")
);
const lifeVestBaselineModelPath = path.resolve(
  process.env.ANALYSIS_LIFE_VEST_MODEL_PATH || path.join(repoRoot, "models/life-vest-baseline.pt")
);
const operationsGeneralModelPath = path.resolve(
  process.env.ANALYSIS_OPERATIONS_MODEL_PATH || path.join(repoRoot, "models/yolo11l.pt")
);
const configuredAnalysisOutputRoot = path.resolve(
  ANALYSIS_OUTPUT_ROOT || path.join(repoRoot, "runtime-analysis")
);
const analysisVenvPythonPath = path.resolve(repoRoot, ".venv-analysis/bin/python");
const mediaRegistryPath = path.resolve(
  process.env.MEDIA_REGISTRY_PATH || path.join(repoRoot, "server/data/media-sources.json")
);
const analysisHistoryPath = path.resolve(
  process.env.ANALYSIS_HISTORY_PATH || path.join(repoRoot, "server/data/analysis-history.json")
);
const analysisJobsPath = path.resolve(
  process.env.ANALYSIS_JOBS_PATH || path.join(repoRoot, "server/data/analysis-jobs.json")
);
const moduleConfigsPath = path.resolve(
  process.env.MODULE_CONFIGS_PATH || path.join(repoRoot, "server/data/module-configs.json")
);
const modelDatasetsPath = path.resolve(
  process.env.MODEL_DATASETS_PATH || path.join(repoRoot, "server/data/model-datasets.json")
);
const modelTrainingJobsPath = path.resolve(
  process.env.MODEL_TRAINING_JOBS_PATH || path.join(repoRoot, "server/data/model-training-jobs.json")
);
const modelVersionsPath = path.resolve(
  process.env.MODEL_VERSIONS_PATH || path.join(repoRoot, "server/data/model-versions.json")
);
const modelEvaluationsPath = path.resolve(
  process.env.MODEL_EVALUATIONS_PATH || path.join(repoRoot, "server/data/model-evaluations.json")
);
const modelBenchmarksPath = path.resolve(
  process.env.MODEL_BENCHMARKS_PATH || path.join(repoRoot, "server/data/model-benchmarks.json")
);
const aiAssistConfigPath = path.resolve(
  process.env.AI_ASSIST_CONFIG_PATH || path.join(repoRoot, "server/data/ai-assist-config.json")
);
fs.mkdirSync(configuredAnalysisOutputRoot, { recursive: true });
const analysisOutputRoot = fs.realpathSync.native(configuredAnalysisOutputRoot);
const uploadRoot = path.join(analysisOutputRoot, "uploads");
const previewRoot = path.join(analysisOutputRoot, "previews");
const modelsRoot = path.resolve(repoRoot, "models");
fs.mkdirSync(path.dirname(mediaRegistryPath), { recursive: true });
fs.mkdirSync(path.dirname(analysisHistoryPath), { recursive: true });
fs.mkdirSync(path.dirname(analysisJobsPath), { recursive: true });
fs.mkdirSync(path.dirname(moduleConfigsPath), { recursive: true });
fs.mkdirSync(path.dirname(modelDatasetsPath), { recursive: true });
fs.mkdirSync(path.dirname(modelTrainingJobsPath), { recursive: true });
fs.mkdirSync(path.dirname(modelVersionsPath), { recursive: true });
fs.mkdirSync(path.dirname(modelEvaluationsPath), { recursive: true });
fs.mkdirSync(path.dirname(modelBenchmarksPath), { recursive: true });
fs.mkdirSync(path.dirname(aiAssistConfigPath), { recursive: true });
fs.mkdirSync(uploadRoot, { recursive: true });
fs.mkdirSync(previewRoot, { recursive: true });

const defaultMediaSources = [];

if (!fs.existsSync(modelDatasetsPath)) {
  fs.writeFileSync(modelDatasetsPath, JSON.stringify([], null, 2));
}

if (!fs.existsSync(modelTrainingJobsPath)) {
  fs.writeFileSync(modelTrainingJobsPath, JSON.stringify([], null, 2));
}

if (!fs.existsSync(modelEvaluationsPath)) {
  fs.writeFileSync(modelEvaluationsPath, JSON.stringify([], null, 2));
}

if (!fs.existsSync(modelBenchmarksPath)) {
  fs.writeFileSync(modelBenchmarksPath, JSON.stringify([], null, 2));
}

if (!fs.existsSync(aiAssistConfigPath)) {
  fs.writeFileSync(
    aiAssistConfigPath,
    JSON.stringify(DEFAULT_AI_ASSIST_CONFIG, null, 2)
  );
}

const resolvePythonCommand = () => {
  const candidates = [
    process.env.ANALYSIS_PYTHON_BIN,
    analysisVenvPythonPath,
    "python3.11",
    "python3.10",
    "python3",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      execFileSync("which", [candidate], { stdio: "ignore" });
      return candidate;
    } catch (_error) {
      continue;
    }
  }
  return "python3";
};

const analysisPythonCommand = resolvePythonCommand();

let analysisQueue = null;
const monitoringCaptureRoot = path.join(analysisOutputRoot, "monitoring-captures");

const splitPathList = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => path.resolve(item));

const uniquePaths = (items) => Array.from(new Set(items.filter(Boolean).map((item) => path.resolve(item))));

const managedVideoRoots = uniquePaths([uploadRoot, monitoringCaptureRoot]);
const managedModelRoots = uniquePaths([
  modelsRoot,
  path.dirname(defaultModelPath),
  path.dirname(lifeVestBaselineModelPath),
  path.dirname(operationsGeneralModelPath),
  ...splitPathList(ANALYSIS_ALLOWED_MODEL_ROOTS),
]);
const managedConfigRoots = uniquePaths([
  path.dirname(defaultRoiConfigPath),
  analysisOutputRoot,
  ...splitPathList(ANALYSIS_ALLOWED_CONFIG_ROOTS),
]);
const allowedSourcePreviewSchemes = new Set(
  SOURCE_PREVIEW_ALLOWED_SCHEMES.split(",")
    .map((scheme) => scheme.trim().toLowerCase().replace(/:$/, ""))
    .filter(Boolean)
);
const allowPrivateSourcePreviewIps = SOURCE_PREVIEW_ALLOW_PRIVATE_IPS === "true";

const { moduleConfigSchemas, defaultModuleConfigs } = createModuleConfigDefinitions({
  defaultModelPath,
  lifeVestBaselineModelPath,
  operationsGeneralModelPath,
});

const moduleConfigRepository = createJsonModuleConfigRepository({
  filePath: moduleConfigsPath,
  defaultConfigs: defaultModuleConfigs,
  normalizeConfig(moduleKey, config) {
    return {
      ...(defaultModuleConfigs[moduleKey] || {}),
      ...(config || {}),
    };
  },
});

const PPE_ANALYSIS_DEFINITIONS = {
  no_helmet: {
    analysisType: "no_helmet",
    eventType: "no_helmet",
    moduleKey: "ppe.no-helmet",
    configKey: "no-helmet",
    findingType: "missing-helmet",
    findingLabel: "no helmet",
    title: "Pekerja tanpa helm terdeteksi",
    detailLabel: "no helmet",
    recommendation:
      "Verifikasi visual di lapangan dan tindak lanjuti pelanggaran helm berulang.",
    requiredPpe: ["helmet"],
    labels: ["person", "helmet", "no-helmet"],
    matchRegion: "head",
  },
  no_safety_vest: {
    analysisType: "no_safety_vest",
    eventType: "no_safety_vest",
    moduleKey: "ppe.no-safety-vest",
    configKey: "no-safety-vest",
    findingType: "missing-safety-vest",
    findingLabel: "no safety vest",
    title: "Pekerja tanpa rompi keselamatan terdeteksi",
    detailLabel: "no safety vest",
    recommendation:
      "Verifikasi visual di lapangan dan tindak lanjuti pelanggaran rompi keselamatan berulang.",
    requiredPpe: ["safety vest"],
    labels: ["person", "safety-vest", "no-safety-vest"],
    matchRegion: "torso",
    fallbackToMissingPositive: true,
    vetoOnPositiveEvidence: true,
  },
  no_life_vest: {
    analysisType: "no_life_vest",
    eventType: "no_life_vest",
    moduleKey: "ppe.no-life-vest",
    configKey: "no-life-vest",
    findingType: "missing-life-vest",
    findingLabel: "no life vest",
    title: "Pekerja tanpa pelampung terdeteksi",
    detailLabel: "no life vest",
    recommendation:
      "Verifikasi visual di lapangan dan tindak lanjuti pelanggaran pelampung pada area air atau area kerja dekat perairan.",
    requiredPpe: ["life vest"],
    labels: ["person", "life-vest", "no-life-vest"],
    matchRegion: "torso",
    fallbackToMissingPositive: true,
    vetoOnPositiveEvidence: true,
  },
};

const WORKING_AT_HEIGHT_ANALYSIS_DEFINITION = {
  analysisType: "working_at_height",
  eventType: "working_at_height",
  moduleKey: "hse.working-at-height",
  findingType: "working-at-height",
  findingLabel: "working at height",
  title: "Aktivitas bekerja di ketinggian terdeteksi",
  detailLabel: "working at height",
  recommendation:
    "Verifikasi visual di lapangan, pastikan area elevasi diawasi, dan cek kepatuhan APD untuk pekerjaan di ketinggian.",
  requiredPpe: ["helmet", "safety vest", "safety harness"],
  labels: ["person", "working-at-height"],
};

const RED_LIGHT_VIOLATION_ANALYSIS_DEFINITION = {
  analysisType: "red_light_violation",
  eventType: "red_light_violation",
  moduleKey: "operations.red-light-violation",
  findingType: "red-light-violation",
  findingLabel: "red light violation",
  title: "Pelanggaran lampu merah terdeteksi",
  detailLabel: "red light violation",
  recommendation:
    "Verifikasi visual kendaraan yang melintasi stop line saat lampu merah dan tindak lanjuti pelanggaran persimpangan.",
  requiredPpe: [],
  labels: ["vehicle", "red-light", "green-light"],
};

const DUMP_TRUCK_BED_OPEN_ANALYSIS_DEFINITION = {
  analysisType: "dump_truck_bed_open",
  eventType: "dump_truck_bed_open",
  moduleKey: "operations.dump-truck-bed-open",
  findingType: "dump-truck-bed-open",
  findingLabel: "dump truck bed open",
  title: "Dump truck bergerak dengan bak terbuka",
  detailLabel: "dump truck bed open",
  recommendation:
    "Verifikasi visual dump truck yang bergerak dengan bak masih terbuka dan tindak lanjuti pelanggaran operasional hauling road.",
  requiredPpe: [],
  labels: ["dump-truck", "bed-open", "bed-closed"],
};

app.use(authBoundary.router);

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const syncBoundary = createSyncBoundary({
  supabase,
  logger,
  getSafeErrorLogMetadata,
});

const runCommand = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd: repoRoot,
        maxBuffer: 16 * 1024 * 1024,
        ...options,
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });

const runAnalysisCommand = (args, options = {}) => runCommand(analysisPythonCommand, args, options);

const fileExists = (filePath) => {
  try {
    return fs.existsSync(filePath);
  } catch (_error) {
    return false;
  }
};

app.use(
  createObservabilityRouter({
    metrics: operationalMetrics,
    analysisOutputRoot,
    health: {
      supabaseEnabled: Boolean(supabase),
      analysisScriptPath,
      fileExists,
      analysisPythonCommand,
      defaultRoiConfigPath,
      analysisOutputRoot,
    },
  })
);

const mediaSourceRepository = createJsonMediaSourceRepository({
  filePath: mediaRegistryPath,
  defaultItems: defaultMediaSources,
  normalizeItem: normalizeMediaSource,
});

const readMediaRegistry = () => {
  return mediaSourceRepository.list();
};

const writeMediaRegistry = (items) => {
  return mediaSourceRepository.replaceAll(items);
};

const normalizeAnalysisHistoryEntry = (entry) => ({
  ...entry,
  eventCount: Number(entry?.eventCount || 0),
  violatorCount: Number(entry?.violatorCount || 0),
  stableDetectedTrackCount: Number(entry?.stableDetectedTrackCount || 0),
  rawDetectedTrackCount: Number(entry?.rawDetectedTrackCount || 0),
});

const analysisHistoryRepository = createJsonAnalysisHistoryRepository({
  filePath: analysisHistoryPath,
  normalizeEntry: normalizeAnalysisHistoryEntry,
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
  maxRetries: Number.isInteger(Number(job?.maxRetries)) ? Number(job.maxRetries) : ANALYSIS_JOB_MAX_RETRIES,
  timeoutMs: Number.isInteger(Number(job?.timeoutMs)) ? Number(job.timeoutMs) : ANALYSIS_JOB_TIMEOUT_MS,
  lastAttemptAt: job?.lastAttemptAt || null,
  nextAttemptAt: job?.nextAttemptAt || null,
  lastErrorCode: job?.lastErrorCode || null,
  lastErrorMessage: job?.lastErrorMessage || null,
  stdout: job?.stdout || "",
  stderr: job?.stderr || "",
  summary: job?.summary || null,
});

const analysisJobRepository = createJsonAnalysisJobRepository({
  filePath: analysisJobsPath,
  normalizeJob: normalizeAnalysisJob,
});

const artifactRoutes = createArtifactRouter({
  access: artifactAccess,
  outputRoot: analysisOutputRoot,
  jobRepository: analysisJobRepository,
  logger,
  retentionMaxAgeMs: artifactRetentionMaxAgeMs,
  retentionMaxBytes: artifactRetentionMaxBytes,
});
app.use(artifactRoutes.router);

const readAnalysisHistory = () => {
  return analysisHistoryRepository.list();
};

const writeAnalysisHistory = (items) => {
  return analysisHistoryRepository.replaceAll(items);
};

const appendAnalysisHistory = (entry) => {
  return analysisHistoryRepository.append(entry);
};

const modelTargetModuleByConfigKey = {
  "no-helmet": "ppe.no-helmet",
  "no-safety-vest": "ppe.no-safety-vest",
  "no-life-vest": "ppe.no-life-vest",
  "safety-rules": "hse.safety-rules",
  "working-at-height": "hse.working-at-height",
  "red-light-violation": "operations.red-light-violation",
  "dump-truck-bed-open": "operations.dump-truck-bed-open",
};

const DEFAULT_MODEL_VERSION_SEEDS = createDefaultModelVersionSeeds({
  defaultModelPath,
  lifeVestBaselineModelPath,
  operationsGeneralModelPath,
});

const modelVersionRepository = createJsonModelVersionRepository({
  filePath: modelVersionsPath,
  defaultItems: DEFAULT_MODEL_VERSION_SEEDS,
  normalizeItem(item) {
    const parsed = modelVersionSchema.safeParse(item);
    if (parsed.success) {
      return parsed.data;
    }
    return {
      ...item,
      labels: Array.isArray(item?.labels) ? item.labels : [],
      sourceJobId: item?.sourceJobId || null,
      evaluationSummary: item?.evaluationSummary || "",
      createdAt: item?.createdAt || new Date().toISOString(),
      updatedAt: item?.updatedAt || new Date().toISOString(),
    };
  },
});

const modelDatasetRepository = createJsonModelRegistryCollectionRepository({
  filePath: modelDatasetsPath,
  normalizeItem: normalizeModelRegistryItem(modelDatasetSchema),
  conflictCode: "MODEL_DATASET_CONFLICT",
  conflictMessage: "Model dataset was modified by another request.",
});

const modelTrainingJobRepository = createJsonModelRegistryCollectionRepository({
  filePath: modelTrainingJobsPath,
  normalizeItem: normalizeModelRegistryItem(modelTrainingJobSchema, {
    outputModelPath: null,
    metrics: {},
    startedAt: null,
    endedAt: null,
  }),
  conflictCode: "MODEL_TRAINING_JOB_CONFLICT",
  conflictMessage: "Training job was modified by another request.",
});

const modelEvaluationRepository = createJsonModelRegistryCollectionRepository({
  filePath: modelEvaluationsPath,
  normalizeItem: normalizeModelRegistryItem(modelEvaluationSchema, {
    precision: null,
    recall: null,
    map50: null,
  }),
  conflictCode: "MODEL_EVALUATION_CONFLICT",
  conflictMessage: "Model evaluation was modified by another request.",
});

const modelBenchmarkRepository = createJsonModelRegistryCollectionRepository({
  filePath: modelBenchmarksPath,
  normalizeItem: normalizeModelRegistryItem(modelBenchmarkSchema, {
    precisionDelta: null,
    recallDelta: null,
    falsePositiveDelta: null,
    falseNegativeDelta: null,
  }),
  conflictCode: "MODEL_BENCHMARK_CONFLICT",
  conflictMessage: "Model benchmark was modified by another request.",
});

const modelRegistryBoundary = createModelRegistryBoundary({
  datasetRepository: modelDatasetRepository,
  trainingJobRepository: modelTrainingJobRepository,
  versionRepository: modelVersionRepository,
  evaluationRepository: modelEvaluationRepository,
  benchmarkRepository: modelBenchmarkRepository,
});
const {
  buildModelsOverview,
  getActiveModelVersion,
  readModelBenchmarks,
  readModelDatasets,
  readModelEvaluations,
  readModelTrainingJobs,
  readModelVersions,
  writeModelBenchmarks,
  writeModelDatasets,
  writeModelEvaluations,
  writeModelTrainingJobs,
  writeModelVersions,
} = modelRegistryBoundary;

const moduleConfigBoundary = createModuleConfigBoundary({
  defaultModelPath,
  defaultModuleConfigs,
  fileExists,
  getActiveModelVersion,
  modelTargetModuleByConfigKey,
  moduleConfigRepository,
  moduleConfigSchemas,
});
const {
  getModuleConfig,
  readModuleConfigs,
  resolveModuleConfigEnvelope,
  writeModuleConfigs,
} = moduleConfigBoundary;

const aiAssistBoundary = createAiAssistBoundary({
  aiAssistConfigPath,
  analysisOutputRoot,
  fileExists,
});

const ensureAnalysisDirectories = () => {
  fs.mkdirSync(analysisOutputRoot, { recursive: true });
  fs.mkdirSync(uploadRoot, { recursive: true });
  fs.mkdirSync(previewRoot, { recursive: true });
  fs.mkdirSync(monitoringCaptureRoot, { recursive: true });
};

const createClientInputError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const isExistingPathInsideAnyDirectory = (targetPath, baseDirectories) => {
  if (!targetPath || typeof targetPath !== "string" || !path.isAbsolute(targetPath)) {
    return false;
  }
  if (!fileExists(targetPath)) {
    return false;
  }

  let realTarget;
  try {
    realTarget = fs.realpathSync.native(targetPath);
  } catch (_error) {
    return false;
  }

  return baseDirectories.some((baseDirectory) => {
    const resolvedBase = path.resolve(baseDirectory);
    return realTarget === resolvedBase || realTarget.startsWith(`${resolvedBase}${path.sep}`);
  });
};

const resolveManagedPath = (candidate, baseDirectories, label) => {
  const value = String(candidate || "").trim();
  if (!value) {
    throw createClientInputError(`${label} is required.`);
  }
  if (!path.isAbsolute(value)) {
    throw createClientInputError(`${label} must be a server-managed absolute path.`);
  }
  if (!isExistingPathInsideAnyDirectory(value, baseDirectories)) {
    throw createClientInputError(`${label} is not inside an allowed server-managed directory.`);
  }
  return fs.realpathSync.native(value);
};

const resolveManagedVideoPath = (videoPath) =>
  resolveManagedPath(videoPath, managedVideoRoots, "Video path");

const resolveManagedModelPath = (modelPath, label = "Model path") =>
  resolveManagedPath(modelPath, managedModelRoots, label);

const resolveManagedConfigPath = (configPath, label = "Config path") =>
  resolveManagedPath(configPath, managedConfigRoots, label);

const publicSnapshotUrl = (req, snapshotPath) => {
  const absoluteSnapshotPath = fs.realpathSync.native(path.resolve(snapshotPath));
  const relativePath = path.relative(analysisOutputRoot, absoluteSnapshotPath);
  if (
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath) ||
    relativePath.length === 0
  ) {
    return null;
  }

  const encodedPath = relativePath
    .split(path.sep)
    .map(encodeURIComponent)
    .join("/");
  const expiresAt = Math.floor(Date.now() / 1000) + artifactUrlTtlSeconds;
  const signature = artifactAccess.createArtifactSignature(encodedPath, expiresAt);
  if (!signature) {
    return null;
  }
  return `${req.protocol}://${req.get("host")}/analysis-output/${encodedPath}?expires=${expiresAt}&signature=${signature}`;
};

const sourcePreviewUploadBoundary = createSourcePreviewUploadBoundary({
  allowedSourcePreviewSchemes,
  allowPrivateSourcePreviewIps,
  ensureAnalysisDirectories,
  fileExists,
  operationalMetrics,
  previewRoot,
  publicSnapshotUrl,
  resolveManagedVideoPath,
  runCommand,
  uploadRoot,
});
const {
  requireBinary,
  sanitizeFilename,
  validateSourcePreviewInput,
} = sourcePreviewUploadBoundary;

const validateMediaSourcePayloadForStorage = createMediaSourceStorageValidator({
  resolveManagedVideoPath,
  validateSourcePreviewInput,
});

const analysisSummaryHelpers = createAnalysisSummaryHelpers({
  dumpTruckBedOpenDefinition: DUMP_TRUCK_BED_OPEN_ANALYSIS_DEFINITION,
  fileExists,
  ppeAnalysisDefinitions: PPE_ANALYSIS_DEFINITIONS,
  publicSnapshotUrl,
  readAnalysisHistory,
  redLightViolationDefinition: RED_LIGHT_VIOLATION_ANALYSIS_DEFINITION,
  workingAtHeightDefinition: WORKING_AT_HEIGHT_ANALYSIS_DEFINITION,
});
const {
  buildHseSafetyRulesReport,
  buildLatestAnalysisSummary,
  enrichSummary,
  getLatestRunForSource,
  getPpeAnalysisDefinition,
  readHseSafetyRulesReport,
  readRunSummary,
  splitCommaSeparated,
} = analysisSummaryHelpers;

const dashboardSummaryBoundary = createDashboardSummaryBoundary({
  buildLatestAnalysisSummary,
  readAnalysisHistory,
  readMediaRegistry,
  readRunSummary,
});

const analysisBoundary = createAnalysisBoundary({
  AnalysisJobConflictError,
  analysisJobRepository,
  analysisOutputRoot,
  analysisScriptPath,
  appendAnalysisHistory,
  buildHseSafetyRulesReport,
  defaultModelPath,
  defaultRoiConfigPath,
  dumpTruckBedOpenScriptPath,
  enrichSummary,
  fileExists,
  getLatestRunForSource,
  getModuleConfig,
  getPpeAnalysisDefinition,
  getSafeErrorLogMetadata,
  logger,
  operationalMetrics,
  port: PORT,
  readHseSafetyRulesReport,
  readMediaRegistry,
  readModelVersions,
  resolveManagedConfigPath,
  resolveManagedModelPath,
  resolveManagedVideoPath,
  resolveModuleConfigEnvelope,
  runAnalysisCommand,
  uploadRoot,
  workingAtHeightScriptPath,
  redLightViolationScriptPath,
});
const {
  analysisQueue: durableAnalysisQueue,
  buildNoHelmetAnalysisJob,
  enqueueAnalysisJob,
  resolveModuleAnalysisInputPaths,
  resolvePpeAnalysisInputPaths,
  resolveRedLightAnalysisInputPaths,
} = analysisBoundary;
analysisQueue = durableAnalysisQueue;

const buildMonitoringClipPath = (source) =>
  path.join(
    monitoringCaptureRoot,
    `${Date.now()}-${sanitizeFilename(source.name || source.id)}.mp4`
  );

const liveMonitoringRuntime = createLiveMonitoringRuntime({
  analysisJobRepository,
  buildMonitoringClipPath,
  buildNoHelmetAnalysisJob,
  enqueueAnalysisJob,
  ensureAnalysisDirectories,
  getModuleConfig,
  getSafeErrorLogMetadata,
  logger,
  operationalMetrics,
  readMediaRegistry,
  requireBinary,
  runCommand,
  splitCommaSeparated,
  validateSourcePreviewInput,
});

app.use(sourcePreviewUploadBoundary.router);

app.use(
  createMediaSourceRouter({
    repository: mediaSourceRepository,
    validatePayloadForStorage: validateMediaSourcePayloadForStorage,
  })
);

app.use(dashboardSummaryBoundary.router);

app.use(analysisBoundary.router);

app.use(modelRegistryBoundary.router);

app.use(aiAssistBoundary.router);

app.use(moduleConfigBoundary.router);

app.use(syncBoundary.router);

const startServer = () => {
  validateAuthRuntimeConfig(process.env);
  const server = app.listen(Number(PORT), HOST, () => {
    logger.info("server_started", {
      host: HOST,
      port: Number(PORT),
    });
    analysisQueue.recover();
    liveMonitoringRuntime.start();
  });

  server.on("error", (error) => {
    logger.error("server_start_failed", {
      host: HOST,
      port: Number(PORT),
      error: getSafeErrorLogMetadata(error),
    });
    process.exit(1);
  });

  server.on("close", () => {
    liveMonitoringRuntime.stop();
  });

  return server;
};

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  authenticateRequest: authBoundary.authenticateRequest,
  cleanupAnalysisArtifacts,
  createAuthSessionForExchange: authBoundary.createAuthSessionForExchange,
  createArtifactSignature: artifactAccess.createArtifactSignature,
  createOperationalMetrics,
  createRateLimiter,
  createRequestContextMiddleware,
  createSessionToken: authBoundary.createSessionToken,
  createStructuredLogger,
  getRequiredRole: authBoundary.getRequiredRole,
  isCorsOriginAllowed,
  resolveArtifactRequestPath: artifactRoutes.resolveArtifactRequestPath,
  resolveModuleAnalysisInputPaths,
  resolveManagedConfigPath,
  resolveManagedModelPath,
  resolveManagedVideoPath,
  resolvePpeAnalysisInputPaths,
  resolveRedLightAnalysisInputPaths,
  renderPrometheusMetrics,
  startServer,
  validateMediaSourcePayloadForStorage,
  validateAuthRuntimeConfig,
  validateSourcePreviewInput,
  verifyArtifactSignature: artifactAccess.verifyArtifactSignature,
  verifySessionToken: authBoundary.verifySessionToken,
};
