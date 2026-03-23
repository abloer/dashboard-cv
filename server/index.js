const cors = require("cors");
const { randomUUID } = require("crypto");
const dotenv = require("dotenv");
const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile, execFileSync } = require("child_process");
const { createClient } = require("@supabase/supabase-js");
const { z } = require("zod");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  PORT = 8081,
  ANALYSIS_OUTPUT_ROOT,
} = process.env;

const repoRoot = path.resolve(__dirname, "..");
const analysisScriptPath = path.resolve(
  repoRoot,
  "tools/no_helmet_analysis/analyze_no_helmet.py"
);
const defaultRoiConfigPath = path.resolve(
  repoRoot,
  "tools/no_helmet_analysis/area_produksi.roi.json"
);
const defaultModelPath = path.resolve(
  process.env.ANALYSIS_DEFAULT_MODEL_PATH || path.join(repoRoot, "models/detect-construction-safety-best.pt")
);
const configuredAnalysisOutputRoot = path.resolve(
  ANALYSIS_OUTPUT_ROOT || path.join(os.tmpdir(), "dashboard-cv-ut-analysis-runs")
);
const analysisVenvPythonPath = path.resolve(repoRoot, ".venv-analysis/bin/python");
const mediaRegistryPath = path.resolve(repoRoot, "server/data/media-sources.json");
const analysisHistoryPath = path.resolve(repoRoot, "server/data/analysis-history.json");
const moduleConfigsPath = path.resolve(repoRoot, "server/data/module-configs.json");
fs.mkdirSync(configuredAnalysisOutputRoot, { recursive: true });
const analysisOutputRoot = fs.realpathSync.native(configuredAnalysisOutputRoot);
const uploadRoot = path.join(analysisOutputRoot, "uploads");
const previewRoot = path.join(analysisOutputRoot, "previews");
fs.mkdirSync(path.dirname(mediaRegistryPath), { recursive: true });
fs.mkdirSync(path.dirname(analysisHistoryPath), { recursive: true });
fs.mkdirSync(path.dirname(moduleConfigsPath), { recursive: true });
fs.mkdirSync(uploadRoot, { recursive: true });
fs.mkdirSync(previewRoot, { recursive: true });

const defaultMediaSources = [];

if (!fs.existsSync(mediaRegistryPath)) {
  fs.writeFileSync(mediaRegistryPath, JSON.stringify(defaultMediaSources, null, 2));
}

if (!fs.existsSync(analysisHistoryPath)) {
  fs.writeFileSync(analysisHistoryPath, JSON.stringify([], null, 2));
}

if (!fs.existsSync(moduleConfigsPath)) {
  fs.writeFileSync(moduleConfigsPath, JSON.stringify({}, null, 2));
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

const VALID_ANALYTICS = new Set(["HSE", "PPE", "Operations", "Fleet & KPI"]);
const VALID_EXECUTION_MODES = new Set(["manual", "scheduled", "continuous"]);
const VALID_MONITORING_STATUSES = new Set(["idle", "running", "paused"]);
const ANALYSIS_JOB_TERMINAL_STATUSES = new Set(["completed", "failed"]);
const MAX_ANALYSIS_JOB_RETENTION = 50;
const analysisJobs = new Map();
const analysisJobQueue = [];
let activeAnalysisJobId = null;

const noHelmetPayloadSchema = z.object({
  mediaSourceId: z.string().trim().min(1).optional(),
  videoPath: z.string().trim().min(1),
  modelPath: z.string().trim().min(1),
  roiConfigPath: z.string().trim().min(1).optional(),
  roiId: z.string().trim().min(1).optional(),
  roiNormalized: z.boolean().optional(),
  roiPolygon: z
    .array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]))
    .min(3)
    .optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  iouThreshold: z.number().min(0).max(1).optional(),
  topRatio: z.number().min(0).max(1).optional(),
  helmetOverlapThreshold: z.number().min(0).max(1).optional(),
  violationOnFrames: z.number().int().positive().optional(),
  cleanOffFrames: z.number().int().positive().optional(),
  frameStep: z.number().int().positive().optional(),
  imageSize: z.number().int().positive().optional(),
  personLabels: z.array(z.string().trim().min(1)).optional(),
  helmetLabels: z.array(z.string().trim().min(1)).optional(),
  violationLabels: z.array(z.string().trim().min(1)).optional(),
});

const noSafetyVestConfigSchema = z.object({
  modelPath: z.string().trim().min(1),
  roiId: z.string().trim().min(1),
  roiConfigPath: z.string(),
  confidenceThreshold: z.string().trim().min(1),
  iouThreshold: z.string().trim().min(1),
  vestLabels: z.string().trim().min(1),
  violationLabels: z.string().trim().min(1),
  violationOnFrames: z.string().trim().min(1),
  cleanOffFrames: z.string().trim().min(1),
  frameStep: z.string().trim().min(1),
  imageSize: z.string().trim().min(1),
  operationalNotes: z.string(),
});

const safetyRulesConfigSchema = z.object({
  ruleProfileName: z.string().trim().min(1),
  modelPath: z.string().trim().min(1),
  detectorLabels: z.string().trim().min(1),
  violationLabels: z.string().trim().min(1),
  confidenceThreshold: z.string().trim().min(1),
  iouThreshold: z.string().trim().min(1),
  frameStep: z.string().trim().min(1),
  imageSize: z.string().trim().min(1),
  restrictedZones: z.string().trim().min(1),
  requiredPpe: z.string().trim().min(1),
  maxPeopleInZone: z.string().trim().min(1),
  alertCooldownSeconds: z.string().trim().min(1),
  supervisorEscalationNote: z.string().trim().min(1),
  incidentNarrativeTemplate: z.string().trim().min(1),
});

const moduleConfigSchemas = {
  "no-safety-vest": noSafetyVestConfigSchema,
  "safety-rules": safetyRulesConfigSchema,
};

const defaultModuleConfigs = {
  "no-safety-vest": {
    modelPath: "/app/models/detect-construction-safety-best.pt",
    roiId: "area-produksi-vest",
    roiConfigPath: "",
    confidenceThreshold: "0.20",
    iouThreshold: "0.30",
    vestLabels: "safety-vest, vest",
    violationLabels: "no-safety-vest, no-vest",
    violationOnFrames: "2",
    cleanOffFrames: "2",
    frameStep: "5",
    imageSize: "960",
    operationalNotes:
      "Gunakan modul ini untuk inspeksi rompi keselamatan pada area produksi, loading point, dan jalur pejalan kaki.",
  },
  "safety-rules": {
    ruleProfileName: "General Site Safety",
    modelPath: "/app/models/detect-construction-safety-best.pt",
    detectorLabels: "person, vehicle, hardhat, safety-vest",
    violationLabels: "restricted-area, no-hardhat, no-safety-vest",
    confidenceThreshold: "0.20",
    iouThreshold: "0.30",
    frameStep: "5",
    imageSize: "960",
    restrictedZones: "Fuel Bay, Workshop, Conveyor Access",
    requiredPpe: "helmet, safety vest, safety shoes",
    maxPeopleInZone: "6",
    alertCooldownSeconds: "120",
    supervisorEscalationNote:
      "Kirim alert ke supervisor area dan catat pelanggaran berulang sebagai incident review.",
    incidentNarrativeTemplate:
      "Pelanggaran aturan keselamatan terdeteksi pada area terbatas. Verifikasi visual operator diperlukan sebelum eskalasi.",
  },
};

const hseSafetyRulesPayloadSchema = z.object({
  mediaSourceId: z.string().trim().min(1),
});

app.use("/analysis-output", express.static(analysisOutputRoot));

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

if (!supabase) {
  console.warn(
    "SUPABASE_URL/SUPABASE_ANON_KEY not set. /sync is disabled, but local analysis endpoints remain available."
  );
}

const mapVideoAnalytic = (row) => ({
  ...(row.id !== undefined && { ID: row.id }),
  FILE_NAME: row.file_name ?? null,
  BENCH_HEIGHT: row.bench_height ?? null,
  FRONT_LOADING_AREA_LENGTH: row.front_loading_area_length ?? null,
  DIGGING_TIME: row.digging_time ?? null,
  SWINGING_TIME: row.swinging_time ?? null,
  DUMPING_TIME: row.dumping_time ?? null,
  LOADING_TIME: row.loading_time ?? null,
  ANALITYC_TYPE: row.analityc_type ?? null,
  LOCATION: row.location ?? null,
  OPERATOR: row.operator ?? null,
  AVG_CYCLETIME: row.avg_cycletime ?? null,
});

const mapExcavatorType = (row) => ({
  ...(row.id !== undefined && { ID: row.id }),
  TYPE: row.type ?? null,
});

const mapDumpTruckType = (row) => ({
  ...(row.id !== undefined && { ID: row.id }),
  TYPE: row.type ?? null,
  TURNING_RADIUS: row.turning_radius ?? null,
});

const mapExcavatorData = (row) => ({
  ...(row.id !== undefined && { ID: row.id }),
  EXCAVATOR_TYPE_FK: row.excavator_type_fk ?? null,
  VIDEO_ANALITYC_FK: row.video_analityc_fk ?? null,
});

const mapDumpTruckData = (row) => ({
  ...(row.id !== undefined && { ID: row.id }),
  VIDEO_ANALITYC_FK: row.video_analityc_fk ?? null,
  DUMP_TRUCK_TYPE_FK: row.dump_truck_type_fk ?? null,
  QUEUE_TIME: row.queue_time ?? null,
  ESTIMATED_LOAD: row.estimated_load ?? null,
});

const normalizeArray = (value) => (Array.isArray(value) ? value : []);

const upsertRows = async (table, rows, onConflict = "ID") => {
  if (!supabase) {
    throw new Error("Supabase client is not configured.");
  }
  if (rows.length === 0) return { count: 0 };
  const { error, data } = await supabase.from(table).upsert(rows, { onConflict });
  if (error) throw error;
  return { count: data ? data.length : rows.length };
};

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

const runAnalysisCommand = (args) => runCommand(analysisPythonCommand, args);

const fileExists = (filePath) => {
  try {
    return fs.existsSync(filePath);
  } catch (_error) {
    return false;
  }
};

const normalizeAnalytics = (analytics = []) => {
  const next = new Set();
  for (const item of Array.isArray(analytics) ? analytics : []) {
    if (item === "No Helmet") {
      next.add("PPE");
      continue;
    }
    if (item === "People Count") {
      next.add("Operations");
      continue;
    }
    if (VALID_ANALYTICS.has(item)) {
      next.add(item);
    }
  }
  return Array.from(next);
};

const normalizeMediaSource = (item) => {
  const type = item?.type === "camera" ? "camera" : "upload";
  const analytics = normalizeAnalytics(item?.analytics);
  const executionMode = VALID_EXECUTION_MODES.has(item?.executionMode)
    ? item.executionMode
    : type === "camera"
      ? "continuous"
      : "manual";
  const monitoringStatus = VALID_MONITORING_STATUSES.has(item?.monitoringStatus)
    ? item.monitoringStatus
    : type === "camera" && executionMode !== "manual"
      ? "paused"
      : "idle";
  const intervalCandidate = Number(item?.monitoringIntervalSeconds);
  const monitoringIntervalSeconds =
    executionMode === "scheduled" && Number.isFinite(intervalCandidate) && intervalCandidate > 0
      ? Math.round(intervalCandidate)
      : executionMode === "scheduled"
        ? 15
        : null;

  return {
    ...item,
    type,
    analytics,
    executionMode,
    monitoringStatus: type === "upload" && executionMode === "manual" ? "idle" : monitoringStatus,
    monitoringIntervalSeconds,
  };
};

const readMediaRegistry = () => {
  if (!fileExists(mediaRegistryPath)) {
    fs.writeFileSync(mediaRegistryPath, JSON.stringify(defaultMediaSources, null, 2));
    return defaultMediaSources;
  }

  const raw = fs.readFileSync(mediaRegistryPath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.map(normalizeMediaSource) : defaultMediaSources;
};

const writeMediaRegistry = (items) => {
  const normalizedItems = items.map(normalizeMediaSource);
  fs.writeFileSync(mediaRegistryPath, JSON.stringify(normalizedItems, null, 2));
  return normalizedItems;
};

const readAnalysisHistory = () => {
  if (!fileExists(analysisHistoryPath)) {
    fs.writeFileSync(analysisHistoryPath, JSON.stringify([], null, 2));
    return [];
  }

  const raw = fs.readFileSync(analysisHistoryPath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
};

const writeAnalysisHistory = (items) => {
  fs.writeFileSync(analysisHistoryPath, JSON.stringify(items, null, 2));
  return items;
};

const appendAnalysisHistory = (entry) => {
  const items = readAnalysisHistory();
  items.unshift(entry);
  writeAnalysisHistory(items);
  return entry;
};

const getModuleConfig = (moduleKey) => {
  const schema = moduleConfigSchemas[moduleKey];
  const fallback = defaultModuleConfigs[moduleKey];
  if (!schema || !fallback) {
    return null;
  }

  const items = readModuleConfigs();
  const parsed = schema.safeParse(items[moduleKey] || fallback);
  return parsed.success ? parsed.data : fallback;
};

const readModuleConfigs = () => {
  if (!fileExists(moduleConfigsPath)) {
    fs.writeFileSync(moduleConfigsPath, JSON.stringify({}, null, 2));
    return {};
  }

  const raw = fs.readFileSync(moduleConfigsPath, "utf8");
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
};

const writeModuleConfigs = (items) => {
  fs.writeFileSync(moduleConfigsPath, JSON.stringify(items, null, 2));
  return items;
};

const ensureAnalysisDirectories = () => {
  fs.mkdirSync(analysisOutputRoot, { recursive: true });
  fs.mkdirSync(uploadRoot, { recursive: true });
  fs.mkdirSync(previewRoot, { recursive: true });
};

const requireBinary = async (binaryName) => {
  try {
    await runCommand("which", [binaryName]);
  } catch (_error) {
    throw new Error(`Required binary '${binaryName}' is not available on the server.`);
  }
};

const sanitizeFilename = (filename) =>
  String(filename || "upload.bin")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "upload.bin";

const isPathInsideDirectory = (targetPath, baseDirectory) => {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedBase = path.resolve(baseDirectory);
  return (
    resolvedTarget === resolvedBase ||
    resolvedTarget.startsWith(`${resolvedBase}${path.sep}`)
  );
};

const parseRate = (value) => {
  const [numerator = "0", denominator = "1"] = String(value).split("/");
  const denominatorNumber = Number(denominator) || 1;
  return Number(numerator) / denominatorNumber;
};

const probeVideo = async (videoPath) => {
  await requireBinary("ffprobe");
  const { stdout } = await runCommand("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,avg_frame_rate:format=duration",
    "-of",
    "json",
    videoPath,
  ]);
  const payload = JSON.parse(stdout);
  const stream = payload.streams?.[0] || {};
  const format = payload.format || {};
  return {
    width: Number(stream.width || 0),
    height: Number(stream.height || 0),
    fps: parseRate(stream.avg_frame_rate || "0/1"),
    durationSeconds: Number(format.duration || 0),
  };
};

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
  return `${req.protocol}://${req.get("host")}/analysis-output/${encodedPath}`;
};

const enrichSummary = (req, summary) => ({
  ...summary,
  events: Array.isArray(summary.events)
    ? summary.events.map((event) => ({
        ...event,
        snapshotUrl: event.snapshot_path
          ? publicSnapshotUrl(req, event.snapshot_path)
          : null,
      }))
    : [],
});

const readRunSummary = (req, outputDir) => {
  if (!outputDir || !fileExists(outputDir)) {
    return null;
  }

  const summaryPath = path.join(outputDir, "summary.json");
  if (!fileExists(summaryPath)) {
    return null;
  }

  try {
    const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    return enrichSummary(req, summary);
  } catch (_error) {
    return null;
  }
};

const buildLatestAnalysisSummary = (req, run) => {
  if (!run) {
    return null;
  }

  const latestRunSummary = readRunSummary(req, run.outputDir);
  const latestGlobalSummary = latestRunSummary?.global_summary || null;

  return {
    id: run.id,
    analysisType: run.analysisType,
    mediaSourceId: run.mediaSourceId,
    sourceName: run.sourceName,
    location: run.location,
    createdAt: run.createdAt,
    outputDir: run.outputDir,
    eventCount: Number(run.eventCount || 0),
    violatorCount: Number(run.violatorCount || 0),
    stableDetectedTrackCount: Number(run.stableDetectedTrackCount || 0),
    rawDetectedTrackCount: Number(run.rawDetectedTrackCount || 0),
    durationSeconds: Number(latestRunSummary?.duration_seconds || 0),
    analyzedFrameCount: Number(latestRunSummary?.analyzed_frame_count || 0),
    fps: Number(latestRunSummary?.fps || 0),
    snapshotCount: Number(latestGlobalSummary?.snapshot_count || 0),
    firstEventSeconds: latestGlobalSummary?.first_event_seconds ?? null,
    lastEventSeconds: latestGlobalSummary?.last_event_seconds ?? null,
    totalViolationDurationSeconds: Number(
      latestGlobalSummary?.total_violation_duration_seconds || 0
    ),
    narrative:
      latestGlobalSummary?.narrative ||
      (Number(run.eventCount || 0) > 0
        ? `Run terakhir menemukan ${run.eventCount} event no helmet pada source ${run.sourceName}.`
        : `Run terakhir pada source ${run.sourceName} tidak menemukan event no helmet.`),
    events: Array.isArray(latestRunSummary?.events)
      ? latestRunSummary.events.slice(0, 6)
      : [],
  };
};

const splitCommaSeparated = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const getLatestRunForSource = (analysisType, mediaSource) => {
  const analysisHistory = readAnalysisHistory();
  const typedHistory = analysisHistory.filter((item) => item.analysisType === analysisType);
  return (
    typedHistory.find((run) => run.mediaSourceId === mediaSource.id) ||
    typedHistory.find((run) => run.videoPath === mediaSource.source) ||
    null
  );
};

const severityRank = {
  low: 1,
  medium: 2,
  high: 3,
};

const buildHseSafetyRulesReport = (req, source, config) => {
  const latestNoHelmetRun = getLatestRunForSource("no_helmet", source);
  const latestNoHelmetSummary = latestNoHelmetRun
    ? buildLatestAnalysisSummary(req, latestNoHelmetRun)
    : null;
  const requiredPpe = splitCommaSeparated(config.requiredPpe);
  const restrictedZones = splitCommaSeparated(config.restrictedZones);
  const findings = [];
  const readiness = [];

  const modelReady = fileExists(config.modelPath);
  readiness.push({
    id: "model",
    label: "Model HSE",
    status: modelReady ? "ready" : "missing",
    detail: modelReady
      ? `Model tersedia di ${config.modelPath}`
      : `Model path ${config.modelPath} belum tersedia di server.`,
  });

  readiness.push({
    id: "zones",
    label: "Restricted Zones",
    status: restrictedZones.length > 0 ? "ready" : "missing",
    detail:
      restrictedZones.length > 0
        ? `${restrictedZones.length} zona tercatat untuk pengawasan.`
        : "Belum ada restricted zone yang didefinisikan.",
  });

  readiness.push({
    id: "required-ppe",
    label: "Required PPE",
    status: requiredPpe.length > 0 ? "ready" : "missing",
    detail:
      requiredPpe.length > 0
        ? requiredPpe.join(", ")
        : "Checklist PPE wajib belum ditentukan.",
  });

  readiness.push({
    id: "source-context",
    label: "Source Context",
    status: source.status === "active" ? "ready" : "warning",
    detail: `${source.name} • ${source.location} • ${source.type === "camera" ? "Camera" : "Upload"}`,
  });

  if (!source.analytics.includes("HSE")) {
    findings.push({
      id: "missing-hse-category",
      title: "Source belum ditandai untuk kategori HSE",
      severity: "medium",
      status: "open",
      detail:
        "Source ini belum memasukkan kategori output HSE di Media Sources sehingga rule keselamatan umum berisiko tidak masuk workflow operator.",
      recommendation: "Tambahkan kategori HSE pada source agar dashboard dan operator memakai workflow yang konsisten.",
    });
  }

  if (!modelReady) {
    findings.push({
      id: "missing-model",
      title: "Model HSE belum tersedia",
      severity: "high",
      status: "open",
      detail: `Model path ${config.modelPath} tidak ditemukan di server.`,
      recommendation: "Sinkronkan model HSE ke server atau gunakan model PPE/HSE yang valid sebelum assessment rutin dijalankan.",
    });
  }

  if (source.type === "camera" && source.executionMode !== "manual" && source.monitoringStatus !== "running") {
    findings.push({
      id: "monitoring-inactive",
      title: "Monitoring source camera belum aktif",
      severity: "medium",
      status: "open",
      detail: `Source camera berada pada mode ${source.executionMode} tetapi status monitoring masih ${source.monitoringStatus}.`,
      recommendation: "Aktifkan monitoring dari Live Monitoring agar rule HSE dievaluasi secara berkala.",
    });
  }

  if (source.status !== "active") {
    findings.push({
      id: "source-status",
      title: "Status source belum aktif",
      severity: source.status === "maintenance" ? "medium" : "high",
      status: "open",
      detail: `Status source saat ini ${source.status}.`,
      recommendation: "Kembalikan source ke status active sebelum dijadikan baseline HSE operasional.",
    });
  }

  if (latestNoHelmetSummary) {
    if (requiredPpe.some((item) => /helmet/i.test(item)) && latestNoHelmetSummary.violatorCount > 0) {
      findings.push({
        id: "helmet-violation",
        title: "Pelanggaran helm terdeteksi pada baseline HSE",
        severity: latestNoHelmetSummary.violatorCount >= 2 ? "high" : "medium",
        status: "open",
        detail: `Run terakhir menemukan ${latestNoHelmetSummary.eventCount} event dan ${latestNoHelmetSummary.violatorCount} track pelanggar untuk aturan helm.`,
        recommendation: "Lakukan inspeksi lapangan, pastikan area wajib helm dipatuhi, dan tindak lanjuti pelanggaran berulang.",
        metric: `${latestNoHelmetSummary.eventCount} event / ${latestNoHelmetSummary.violatorCount} violator`,
      });
    }
  } else {
    findings.push({
      id: "missing-evidence",
      title: "Belum ada evidence analitik untuk source ini",
      severity: "medium",
      status: "open",
      detail: "Belum ada run PPE • No Helmet yang bisa dipakai sebagai baseline evidence HSE untuk source ini.",
      recommendation: "Jalankan analisis PPE terlebih dulu atau aktifkan monitoring camera agar baseline HSE punya evidence visual.",
    });
  }

  const highestSeverity = findings.reduce((current, item) => {
    return severityRank[item.severity] > severityRank[current] ? item.severity : current;
  }, "low");

  const outputRiskLevel =
    findings.length === 0 ? "low" : highestSeverity === "high" ? "high" : highestSeverity === "medium" ? "medium" : "low";

  const readyCount = readiness.filter((item) => item.status === "ready").length;

  return {
    source: {
      id: source.id,
      name: source.name,
      location: source.location,
      type: source.type,
      status: source.status,
      analytics: source.analytics,
      executionMode: source.executionMode,
      monitoringStatus: source.monitoringStatus,
      monitoringIntervalSeconds: source.monitoringIntervalSeconds,
    },
    configSnapshot: config,
    readiness: {
      readyCount,
      totalCount: readiness.length,
      items: readiness,
    },
    latestEvidence: latestNoHelmetSummary
      ? {
          analysisType: latestNoHelmetSummary.analysisType,
          createdAt: latestNoHelmetSummary.createdAt,
          eventCount: latestNoHelmetSummary.eventCount,
          violatorCount: latestNoHelmetSummary.violatorCount,
          snapshotCount: latestNoHelmetSummary.snapshotCount,
          narrative: latestNoHelmetSummary.narrative,
          outputDir: latestNoHelmetSummary.outputDir,
          latestSnapshotUrl:
            latestNoHelmetSummary.events.find((event) => event.snapshotUrl)?.snapshotUrl || null,
        }
      : null,
    findings,
    summary: {
      riskLevel: outputRiskLevel,
      openFindingCount: findings.length,
      highSeverityCount: findings.filter((item) => item.severity === "high").length,
      mediumSeverityCount: findings.filter((item) => item.severity === "medium").length,
      lowSeverityCount: findings.filter((item) => item.severity === "low").length,
      latestNoHelmetEventCount: latestNoHelmetSummary?.eventCount || 0,
      latestNoHelmetViolatorCount: latestNoHelmetSummary?.violatorCount || 0,
      requiredPpe,
      restrictedZones,
      generatedAt: new Date().toISOString(),
      narrative:
        findings.length === 0
          ? `Baseline HSE untuk ${source.name} terlihat sehat. Semua komponen inti tersedia dan belum ada temuan kritis dari evidence terbaru.`
          : `Assessment HSE untuk ${source.name} menghasilkan ${findings.length} temuan aktif dengan level risiko ${outputRiskLevel}. Fokus utama ada pada kesiapan monitoring, baseline PPE, dan restricted zone.`,
    },
  };
};

const readHseSafetyRulesReport = (outputDir) => {
  if (!outputDir || !fileExists(outputDir)) {
    return null;
  }

  const reportPath = path.join(outputDir, "report.json");
  if (!fileExists(reportPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch (_error) {
    return null;
  }
};

const sanitizeAnalysisJobForResponse = (req, job) => {
  if (!job) return null;

  const queueIndex =
    job.status === "queued" ? analysisJobQueue.findIndex((item) => item === job.id) : -1;

  return {
    ok: true,
    job: {
      id: job.id,
      status: job.status,
      message: job.message,
      runId: job.runId,
      outputDir: job.outputDir,
      createdAt: job.createdAt,
      startedAt: job.startedAt || null,
      completedAt: job.completedAt || null,
      failedAt: job.failedAt || null,
      mediaSourceId: job.mediaSourceId || null,
      videoPath: job.videoPath,
      stdout: job.stdout || "",
      stderr: job.stderr || "",
      summary: job.summary ? enrichSummary(req, job.summary) : null,
      queuePosition: queueIndex >= 0 ? queueIndex + 1 : 0,
    },
  };
};

const pruneAnalysisJobs = () => {
  const removableJobs = Array.from(analysisJobs.values())
    .filter((job) => ANALYSIS_JOB_TERMINAL_STATUSES.has(job.status))
    .sort(
      (left, right) =>
        new Date(right.completedAt || right.failedAt || right.createdAt).getTime() -
        new Date(left.completedAt || left.failedAt || left.createdAt).getTime()
    );

  removableJobs.slice(MAX_ANALYSIS_JOB_RETENTION).forEach((job) => {
    analysisJobs.delete(job.id);
  });
};

const buildNoHelmetAnalysisJob = (payload) => {
  const {
    mediaSourceId,
    videoPath,
    modelPath,
    roiConfigPath,
    roiId,
    roiNormalized,
    roiPolygon,
    confidenceThreshold,
    iouThreshold,
    topRatio,
    helmetOverlapThreshold,
    violationOnFrames,
    cleanOffFrames,
    frameStep,
    imageSize,
    personLabels,
    helmetLabels,
    violationLabels,
  } = payload;

  if (!fileExists(videoPath)) {
    const error = new Error("Video path not found.");
    error.statusCode = 400;
    throw error;
  }
  if (!fileExists(modelPath)) {
    const error = new Error("Model path not found.");
    error.statusCode = 400;
    throw error;
  }
  if (!fileExists(analysisScriptPath)) {
    const error = new Error("Analysis script not found.");
    error.statusCode = 500;
    throw error;
  }

  const jobId = `job-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const runId = `run-${Date.now()}`;
  const outputDir = path.join(analysisOutputRoot, runId);
  fs.mkdirSync(outputDir, { recursive: true });
  const resolvedRoiConfigPath = roiPolygon
    ? path.join(outputDir, "roi.generated.json")
    : roiConfigPath || defaultRoiConfigPath;

  if (roiPolygon) {
    fs.writeFileSync(
      resolvedRoiConfigPath,
      JSON.stringify(
        {
          roi_id: roiId || "roi-dashboard",
          normalized: roiNormalized !== false,
          polygon: roiPolygon,
        },
        null,
        2
      )
    );
  }
  if (!roiPolygon && !fileExists(resolvedRoiConfigPath)) {
    const error = new Error("ROI config path not found.");
    error.statusCode = 400;
    throw error;
  }

  const commandArgs = [
    analysisScriptPath,
    "--video-path",
    videoPath,
    "--roi-config-path",
    resolvedRoiConfigPath,
    "--output-dir",
    outputDir,
    "--model-path",
    modelPath,
  ];

  const appendNumberArg = (flag, value) => {
    if (typeof value === "number") {
      commandArgs.push(flag, String(value));
    }
  };

  appendNumberArg("--confidence-threshold", confidenceThreshold);
  appendNumberArg("--iou-threshold", iouThreshold);
  appendNumberArg("--top-ratio", topRatio);
  appendNumberArg("--helmet-overlap-threshold", helmetOverlapThreshold);
  appendNumberArg("--violation-on-frames", violationOnFrames);
  appendNumberArg("--clean-off-frames", cleanOffFrames);
  appendNumberArg("--frame-step", frameStep);
  appendNumberArg("--image-size", imageSize);

  (personLabels || []).forEach((label) => {
    commandArgs.push("--person-label", label);
  });
  (helmetLabels || []).forEach((label) => {
    commandArgs.push("--helmet-label", label);
  });
  (violationLabels || []).forEach((label) => {
    commandArgs.push("--violation-label", label);
  });

  return {
    id: jobId,
    runId,
    mediaSourceId: mediaSourceId || null,
    videoPath,
    outputDir,
    commandArgs,
    status: "queued",
    message: "Job analisis masuk antrean dan menunggu worker.",
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    failedAt: null,
    stdout: "",
    stderr: "",
    summary: null,
  };
};

const executeNoHelmetAnalysisJob = async (job) => {
  job.status = "running";
  job.message = "Analisis sedang berjalan di background worker.";
  job.startedAt = new Date().toISOString();

  try {
    const { stdout, stderr } = await runAnalysisCommand(job.commandArgs);
    const summaryPath = path.join(job.outputDir, "summary.json");
    if (!fileExists(summaryPath)) {
      const error = new Error("Analysis finished without summary.json output.");
      error.stdout = stdout;
      error.stderr = stderr;
      throw error;
    }

    const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    const mediaRegistry = readMediaRegistry();
    const mediaSource =
      mediaRegistry.find((item) => item.id === job.mediaSourceId) ||
      mediaRegistry.find((item) => item.source === job.videoPath) ||
      null;

    appendAnalysisHistory({
      id: job.runId,
      analysisType: "no_helmet",
      mediaSourceId: mediaSource?.id || null,
      sourceName: mediaSource?.name || path.basename(job.videoPath),
      location: mediaSource?.location || null,
      videoPath: job.videoPath,
      outputDir: job.outputDir,
      eventCount: Number(summary.event_count || 0),
      violatorCount: Number(summary.global_summary?.violator_count || 0),
      stableDetectedTrackCount: Number(summary.global_summary?.stable_detected_track_count || 0),
      rawDetectedTrackCount: Number(summary.global_summary?.detected_track_count || 0),
      createdAt: new Date().toISOString(),
    });

    job.status = "completed";
    job.message = `Analisis selesai dengan ${Number(summary.event_count || 0)} event.`;
    job.completedAt = new Date().toISOString();
    job.stdout = stdout || "";
    job.stderr = stderr || "";
    job.summary = summary;
  } catch (error) {
    job.status = "failed";
    job.message = error?.message || "Analysis failed";
    job.failedAt = new Date().toISOString();
    job.stdout = error?.stdout || "";
    job.stderr = error?.stderr || error?.message || "";
  }
};

const processNextAnalysisJob = () => {
  if (activeAnalysisJobId || analysisJobQueue.length === 0) {
    return;
  }

  const nextJobId = analysisJobQueue.shift();
  if (!nextJobId) {
    return;
  }

  const job = analysisJobs.get(nextJobId);
  if (!job || job.status !== "queued") {
    processNextAnalysisJob();
    return;
  }

  activeAnalysisJobId = nextJobId;

  executeNoHelmetAnalysisJob(job)
    .catch(() => {
      // Execution errors are already captured into the job state.
    })
    .finally(() => {
      activeAnalysisJobId = null;
      pruneAnalysisJobs();
      processNextAnalysisJob();
    });
};

const enqueueAnalysisJob = (job) => {
  analysisJobs.set(job.id, job);
  analysisJobQueue.push(job.id);
  processNextAnalysisJob();
  return job;
};

app.post(
  "/analysis/upload-video",
  express.raw({
    type: ["application/octet-stream", "video/*"],
    limit: "1024mb",
  }),
  async (req, res) => {
    try {
      ensureAnalysisDirectories();
      const fileName = sanitizeFilename(
        req.query.filename || req.header("x-file-name") || "uploaded-video.mp4"
      );
      const extension = path.extname(fileName) || ".mp4";
      const storedFileName = `${Date.now()}-${fileName.replace(/\.[^.]+$/, "")}${extension}`;
      const storedPath = path.join(uploadRoot, storedFileName);

      if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({
          ok: false,
          message: "Request body is empty. Upload the video as a binary request body.",
        });
      }

      fs.writeFileSync(storedPath, req.body);
      let metadata = null;
      let warning = null;
      try {
        metadata = await probeVideo(storedPath);
      } catch (error) {
        warning = error?.message || "Video metadata could not be probed.";
      }

      return res.json({
        ok: true,
        fileName,
        videoPath: storedPath,
        sizeBytes: req.body.length,
        metadata,
        warning,
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: error?.message || "Video upload failed.",
      });
    }
  }
);

app.delete("/analysis/upload-video", (req, res) => {
  try {
    ensureAnalysisDirectories();
    const videoPath = String(req.query.videoPath || "").trim();
    if (!videoPath) {
      return res.status(400).json({ ok: false, message: "videoPath is required." });
    }
    if (!isPathInsideDirectory(videoPath, uploadRoot)) {
      return res.status(400).json({
        ok: false,
        message: "Only uploaded videos inside the upload directory can be deleted.",
      });
    }
    if (!fileExists(videoPath)) {
      return res.status(404).json({ ok: false, message: "Uploaded video not found." });
    }

    fs.unlinkSync(videoPath);
    return res.json({ ok: true, videoPath });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error?.message || "Uploaded video cleanup failed.",
    });
  }
});

app.post("/analysis/video-preview", async (req, res) => {
  try {
    ensureAnalysisDirectories();
    const payloadSchema = z.object({
      videoPath: z.string().trim().min(1),
      timestampSeconds: z.number().min(0).optional(),
    });
    const parsed = payloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid preview payload",
        errors: parsed.error.flatten(),
      });
    }

    const { videoPath, timestampSeconds } = parsed.data;
    if (!fileExists(videoPath)) {
      return res.status(400).json({ ok: false, message: "Video path not found." });
    }

    await requireBinary("ffmpeg");
    const metadata = await probeVideo(videoPath);
    const previewFileName = `${Date.now()}-${sanitizeFilename(
      path.basename(videoPath).replace(/\.[^.]+$/, "")
    )}.jpg`;
    const previewPath = path.join(previewRoot, previewFileName);
    const previewTimestamp =
      typeof timestampSeconds === "number"
        ? timestampSeconds
        : metadata.durationSeconds > 0
          ? metadata.durationSeconds / 2
          : 0;

    await runCommand("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(previewTimestamp),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-y",
      previewPath,
    ]);

    return res.json({
      ok: true,
      videoPath,
      previewPath,
      previewUrl: publicSnapshotUrl(req, previewPath),
      timestampSeconds: previewTimestamp,
      metadata,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error?.message || "Preview generation failed.",
      stdout: error?.stdout || "",
      stderr: error?.stderr || "",
    });
  }
});

app.post("/analysis/source-preview", async (req, res) => {
  try {
    ensureAnalysisDirectories();
    const payloadSchema = z.object({
      source: z.string().trim().min(1),
    });
    const parsed = payloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid source preview payload",
        errors: parsed.error.flatten(),
      });
    }

    const { source } = parsed.data;
    await requireBinary("ffmpeg");

    const previewFileName = `${Date.now()}-${sanitizeFilename(
      source.replace(/^[a-z]+:\/\//i, "").slice(0, 64) || "source-preview"
    )}.jpg`;
    const previewPath = path.join(previewRoot, previewFileName);
    const normalizedSource = source.trim().toLowerCase();
    const ffmpegArgs = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-rw_timeout",
      "10000000",
    ];

    if (normalizedSource.startsWith("rtsp://")) {
      ffmpegArgs.push("-rtsp_transport", "tcp");
    }

    ffmpegArgs.push(
      "-i",
      source,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      "-y",
      previewPath
    );

    await runCommand("ffmpeg", ffmpegArgs, { timeout: 15000 });

    return res.json({
      ok: true,
      source,
      previewPath,
      previewUrl: publicSnapshotUrl(req, previewPath),
      capturedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error?.message || "Source preview generation failed.",
      stdout: error?.stdout || "",
      stderr: error?.stderr || "",
    });
  }
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    supabaseEnabled: Boolean(supabase),
    analysisScriptPath,
    analysisScriptReady: fileExists(analysisScriptPath),
    analysisPythonCommand,
    defaultRoiConfigPath,
    analysisOutputRoot,
  });
});

const mediaTypeSchema = z.enum(["upload", "camera"]);
const mediaStatusSchema = z.enum(["active", "inactive", "maintenance"]);
const mediaExecutionModeSchema = z.enum(["manual", "scheduled", "continuous"]);
const mediaMonitoringStatusSchema = z.enum(["idle", "running", "paused"]);
const mediaSourcePayloadSchema = z.object({
  name: z.string().trim().min(1),
  location: z.string().trim().min(1),
  source: z.string().trim().min(1),
  type: mediaTypeSchema,
  status: mediaStatusSchema,
  analytics: z.array(z.string().trim().min(1)).default([]),
  executionMode: mediaExecutionModeSchema.default("manual"),
  monitoringStatus: mediaMonitoringStatusSchema.default("idle"),
  monitoringIntervalSeconds: z.number().int().positive().nullable().optional(),
  note: z.string().trim().default(""),
  lastSeen: z.string().trim().min(1).optional(),
});

app.get("/media-sources", (_req, res) => {
  const items = readMediaRegistry().sort((left, right) =>
    String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""))
  );
  res.json({ ok: true, items });
});

app.post("/media-sources", (req, res) => {
  const parsed = mediaSourcePayloadSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Invalid media source payload.",
      errors: parsed.error.flatten(),
    });
  }

  const now = new Date().toISOString();
  const newItem = normalizeMediaSource({
    id: `media-${randomUUID()}`,
    ...parsed.data,
    lastSeen:
      parsed.data.lastSeen ||
      (parsed.data.type === "camera" ? "Baru ditambahkan" : "Upload baru"),
    createdAt: now,
    updatedAt: now,
  });

  const items = readMediaRegistry();
  items.unshift(newItem);
  writeMediaRegistry(items);
  return res.status(201).json({ ok: true, item: newItem });
});

app.put("/media-sources/:id", (req, res) => {
  const parsed = mediaSourcePayloadSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Invalid media source payload.",
      errors: parsed.error.flatten(),
    });
  }

  const items = readMediaRegistry();
  const index = items.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ ok: false, message: "Media source not found." });
  }

  const current = items[index];
  const updated = normalizeMediaSource({
    ...current,
    ...parsed.data,
    lastSeen: parsed.data.lastSeen || current.lastSeen,
    updatedAt: new Date().toISOString(),
  });
  items[index] = updated;
  writeMediaRegistry(items);
  return res.json({ ok: true, item: updated });
});

app.patch("/media-sources/:id/status", (req, res) => {
  const parsed = z
    .object({
      status: mediaStatusSchema,
    })
    .safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Invalid media source status payload.",
      errors: parsed.error.flatten(),
    });
  }

  const items = readMediaRegistry();
  const index = items.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ ok: false, message: "Media source not found." });
  }

  const updated = {
    ...items[index],
    status: parsed.data.status,
    monitoringStatus:
      parsed.data.status !== "active"
        ? items[index].type === "camera" && items[index].executionMode !== "manual"
          ? "paused"
          : "idle"
        : items[index].monitoringStatus,
    updatedAt: new Date().toISOString(),
  };
  items[index] = updated;
  writeMediaRegistry(items);
  return res.json({ ok: true, item: updated });
});

app.patch("/media-sources/:id/monitoring", (req, res) => {
  const parsed = z
    .object({
      monitoringStatus: mediaMonitoringStatusSchema,
      executionMode: mediaExecutionModeSchema.optional(),
      monitoringIntervalSeconds: z.number().int().positive().nullable().optional(),
    })
    .safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Invalid monitoring payload.",
      errors: parsed.error.flatten(),
    });
  }

  const items = readMediaRegistry();
  const index = items.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ ok: false, message: "Media source not found." });
  }

  const current = items[index];
  const nextExecutionMode = parsed.data.executionMode || current.executionMode;
  const nextMonitoringStatus =
    current.type === "upload" && nextExecutionMode === "manual"
      ? "idle"
      : parsed.data.monitoringStatus;

  const updated = normalizeMediaSource({
    ...current,
    executionMode: nextExecutionMode,
    monitoringStatus: nextMonitoringStatus,
    monitoringIntervalSeconds:
      parsed.data.monitoringIntervalSeconds !== undefined
        ? parsed.data.monitoringIntervalSeconds
        : current.monitoringIntervalSeconds,
    lastSeen:
      nextMonitoringStatus === "running"
        ? "Monitoring aktif"
        : nextMonitoringStatus === "paused"
          ? "Monitoring dijeda"
          : current.type === "camera"
            ? "Siap dipantau"
            : current.lastSeen,
    updatedAt: new Date().toISOString(),
  });

  items[index] = updated;
  writeMediaRegistry(items);
  return res.json({ ok: true, item: updated });
});

app.delete("/media-sources/:id", (req, res) => {
  const items = readMediaRegistry();
  const index = items.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ ok: false, message: "Media source not found." });
  }

  const [removed] = items.splice(index, 1);
  writeMediaRegistry(items);
  return res.json({ ok: true, item: removed });
});

app.get("/dashboard-summary", (_req, res) => {
  const mediaSources = readMediaRegistry();
  const analysisHistory = readAnalysisHistory();
  const noHelmetHistory = analysisHistory.filter((item) => item.analysisType === "no_helmet");

  const sourceSummaries = mediaSources.map((source) => {
    const runs = noHelmetHistory.filter((run) => run.videoPath === source.source);
    const latestRun = runs[0] || null;
    const latestRunSummary = latestRun ? readRunSummary(_req, latestRun.outputDir) : null;
    const latestSnapshotUrl =
      latestRunSummary?.events?.find((event) => event.snapshotUrl)?.snapshotUrl || null;
    return {
      mediaSourceId: source.id,
      name: source.name,
      location: source.location,
      type: source.type,
      status: source.status,
      analytics: source.analytics,
      executionMode: source.executionMode,
      monitoringStatus: source.monitoringStatus,
      monitoringIntervalSeconds: source.monitoringIntervalSeconds,
      runCount: runs.length,
      totalEvents: runs.reduce((sum, run) => sum + Number(run.eventCount || 0), 0),
      totalViolators: runs.reduce((sum, run) => sum + Number(run.violatorCount || 0), 0),
      latestRunAt: latestRun?.createdAt || null,
      latestEventCount: latestRun?.eventCount ?? 0,
      latestViolatorCount: latestRun?.violatorCount ?? 0,
      latestOutputDir: latestRun?.outputDir || null,
      latestSnapshotUrl,
    };
  });

  const analyzedSourceCount = sourceSummaries.filter((item) => item.runCount > 0).length;
  const latestRun = noHelmetHistory[0] || null;

  res.json({
    ok: true,
    summary: {
      totalSources: mediaSources.length,
      activeSources: mediaSources.filter((item) => item.status === "active").length,
      uploadSources: mediaSources.filter((item) => item.type === "upload").length,
      cameraSources: mediaSources.filter((item) => item.type === "camera").length,
      monitoringSources: mediaSources.filter((item) => item.monitoringStatus === "running").length,
      analyzedSourceCount,
      totalNoHelmetRuns: noHelmetHistory.length,
      totalNoHelmetEvents: noHelmetHistory.reduce((sum, run) => sum + Number(run.eventCount || 0), 0),
      totalViolatorTracks: noHelmetHistory.reduce((sum, run) => sum + Number(run.violatorCount || 0), 0),
      latestRunAt: latestRun?.createdAt || null,
      latestRunSourceName: latestRun?.sourceName || path.basename(latestRun?.videoPath || "") || null,
      latestAnalysisSummary: buildLatestAnalysisSummary(_req, latestRun),
      sourceSummaries,
      recentRuns: noHelmetHistory.slice(0, 10),
    },
  });
});

app.get("/dashboard-summary/source/:id/latest-analysis", (req, res) => {
  const mediaSources = readMediaRegistry();
  const source = mediaSources.find((item) => item.id === req.params.id);
  if (!source) {
    return res.status(404).json({ ok: false, message: "Media source not found." });
  }

  const analysisHistory = readAnalysisHistory();
  const noHelmetHistory = analysisHistory.filter((item) => item.analysisType === "no_helmet");
  const latestRun =
    noHelmetHistory.find((run) => run.mediaSourceId === source.id) ||
    noHelmetHistory.find((run) => run.videoPath === source.source) ||
    null;

  return res.json({
    ok: true,
    source: {
      id: source.id,
      name: source.name,
      location: source.location,
      type: source.type,
      status: source.status,
      analytics: source.analytics,
      executionMode: source.executionMode,
      monitoringStatus: source.monitoringStatus,
      monitoringIntervalSeconds: source.monitoringIntervalSeconds,
    },
    latestAnalysisSummary: buildLatestAnalysisSummary(req, latestRun),
  });
});

app.get("/analysis/no-helmet/defaults", (_req, res) => {
  res.json({
    ok: true,
    defaultModelPath,
    defaultRoiConfigPath,
    analysisOutputRoot,
    serverPort: Number(PORT),
    uploadRoot,
  });
});

app.get("/analysis/hse-safety-rules/defaults", (_req, res) => {
  const config = getModuleConfig("safety-rules");
  return res.json({
    ok: true,
    moduleKey: "safety-rules",
    analysisOutputRoot,
    config,
  });
});

app.get("/analysis/hse-safety-rules/source/:id/latest", (req, res) => {
  const mediaSources = readMediaRegistry();
  const source = mediaSources.find((item) => item.id === req.params.id);
  if (!source) {
    return res.status(404).json({ ok: false, message: "Media source not found." });
  }

  const latestRun = getLatestRunForSource("hse_safety_rules", source);
  const report = latestRun ? readHseSafetyRulesReport(latestRun.outputDir) : null;

  return res.json({
    ok: true,
    source: {
      id: source.id,
      name: source.name,
      location: source.location,
      type: source.type,
      status: source.status,
      analytics: source.analytics,
      executionMode: source.executionMode,
      monitoringStatus: source.monitoringStatus,
      monitoringIntervalSeconds: source.monitoringIntervalSeconds,
    },
    latestReport: report,
  });
});

app.post("/analysis/hse-safety-rules", (req, res) => {
  const parsed = hseSafetyRulesPayloadSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Invalid HSE Safety Rules payload",
      errors: parsed.error.flatten(),
    });
  }

  const mediaSources = readMediaRegistry();
  const source = mediaSources.find((item) => item.id === parsed.data.mediaSourceId);
  if (!source) {
    return res.status(404).json({ ok: false, message: "Media source not found." });
  }

  const config = getModuleConfig("safety-rules");
  if (!config) {
    return res.status(500).json({ ok: false, message: "HSE Safety Rules config is unavailable." });
  }

  const runId = `hse-run-${Date.now()}`;
  const outputDir = path.join(analysisOutputRoot, runId);
  fs.mkdirSync(outputDir, { recursive: true });

  const report = buildHseSafetyRulesReport(req, source, config);
  const reportPayload = {
    id: runId,
    analysisType: "hse_safety_rules",
    outputDir,
    createdAt: new Date().toISOString(),
    ...report,
  };

  fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(reportPayload, null, 2));

  appendAnalysisHistory({
    id: runId,
    analysisType: "hse_safety_rules",
    mediaSourceId: source.id,
    sourceName: source.name,
    location: source.location || null,
    videoPath: source.source,
    outputDir,
    eventCount: reportPayload.summary.openFindingCount,
    violatorCount: reportPayload.summary.highSeverityCount,
    stableDetectedTrackCount: reportPayload.readiness.readyCount,
    rawDetectedTrackCount: reportPayload.readiness.totalCount,
    createdAt: reportPayload.createdAt,
  });

  return res.json({
    ok: true,
    report: reportPayload,
  });
});

app.post("/analysis/no-helmet", async (req, res) => {
  try {
    const parsed = noHelmetPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid analysis payload",
        errors: parsed.error.flatten(),
      });
    }

    const job = enqueueAnalysisJob(buildNoHelmetAnalysisJob(parsed.data));
    return res.status(202).json({
      ok: true,
      jobId: job.id,
      status: job.status,
      message: job.message,
      runId: job.runId,
      outputDir: job.outputDir,
      createdAt: job.createdAt,
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      ok: false,
      message: error?.message || "Analysis failed",
      stdout: error?.stdout || "",
      stderr: error?.stderr || "",
    });
  }
});

app.get("/analysis/no-helmet/jobs/:id", (req, res) => {
  const job = analysisJobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ ok: false, message: "Analysis job not found." });
  }

  return res.json(sanitizeAnalysisJobForResponse(req, job));
});

app.get("/module-configs/:moduleKey", (req, res) => {
  const schema = moduleConfigSchemas[req.params.moduleKey];
  if (!schema) {
    return res.status(404).json({ ok: false, message: "Module config not found." });
  }

  const items = readModuleConfigs();
  const config = items[req.params.moduleKey] || defaultModuleConfigs[req.params.moduleKey];
  const parsed = schema.safeParse(config);
  if (!parsed.success) {
    return res.status(500).json({
      ok: false,
      message: "Stored module config is invalid.",
      errors: parsed.error.flatten(),
    });
  }

  return res.json({
    ok: true,
    moduleKey: req.params.moduleKey,
    config: parsed.data,
  });
});

app.put("/module-configs/:moduleKey", (req, res) => {
  const schema = moduleConfigSchemas[req.params.moduleKey];
  if (!schema) {
    return res.status(404).json({ ok: false, message: "Module config not found." });
  }

  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Invalid module config payload",
      errors: parsed.error.flatten(),
    });
  }

  const items = readModuleConfigs();
  items[req.params.moduleKey] = parsed.data;
  writeModuleConfigs(items);

  return res.json({
    ok: true,
    moduleKey: req.params.moduleKey,
    config: parsed.data,
  });
});

app.post("/sync", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({
        ok: false,
        message: "Supabase sync is unavailable because credentials are not configured.",
      });
    }

    const payload = req.body || {};

    const numberOrNull = z.number().finite().nullable().optional();
    const stringOrNull = z.string().trim().min(1).nullable().optional();
    const idField = z.number().int().positive().optional();

    const videoAnalyticSchema = z.object({
      id: idField,
      file_name: stringOrNull,
      bench_height: numberOrNull,
      front_loading_area_length: numberOrNull,
      digging_time: numberOrNull,
      swinging_time: numberOrNull,
      dumping_time: numberOrNull,
      loading_time: numberOrNull,
      analityc_type: stringOrNull,
      location: stringOrNull,
      operator: stringOrNull,
      avg_cycletime: numberOrNull,
    });

    const excavatorTypeSchema = z.object({
      id: idField,
      type: stringOrNull,
    });

    const dumpTruckTypeSchema = z.object({
      id: idField,
      type: stringOrNull,
      turning_radius: numberOrNull,
    });

    const excavatorDataSchema = z.object({
      id: idField,
      excavator_type_fk: z.number().int().positive().nullable().optional(),
      video_analityc_fk: z.number().int().positive().nullable().optional(),
    });

    const dumpTruckDataSchema = z.object({
      id: idField,
      video_analityc_fk: z.number().int().positive().nullable().optional(),
      dump_truck_type_fk: z.number().int().positive().nullable().optional(),
      queue_time: numberOrNull,
      estimated_load: numberOrNull,
    });

    const payloadSchema = z.object({
      video_analytic: z.array(videoAnalyticSchema).optional(),
      excavator_type: z.array(excavatorTypeSchema).optional(),
      dump_truck_type: z.array(dumpTruckTypeSchema).optional(),
      excavator_data: z.array(excavatorDataSchema).optional(),
      dump_truck_data: z.array(dumpTruckDataSchema).optional(),
    });

    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid payload",
        errors: parsed.error.flatten(),
      });
    }

    const videoAnalytic = normalizeArray(parsed.data.video_analytic).map(mapVideoAnalytic);
    const excavatorType = normalizeArray(parsed.data.excavator_type).map(mapExcavatorType);
    const dumpTruckType = normalizeArray(parsed.data.dump_truck_type).map(mapDumpTruckType);
    const excavatorData = normalizeArray(parsed.data.excavator_data).map(mapExcavatorData);
    const dumpTruckData = normalizeArray(parsed.data.dump_truck_data).map(mapDumpTruckData);

    const results = {};
    results.video_analytic = await upsertRows("VIDEO_ANALITYC", videoAnalytic);
    results.excavator_type = await upsertRows("EXCAVATOR_TYPE", excavatorType);
    results.dump_truck_type = await upsertRows("DUMP_TRUCK_TYPE", dumpTruckType);
    results.excavator_data = await upsertRows("EXCAVATOR_DATA", excavatorData);
    results.dump_truck_data = await upsertRows("DUMP_TRUCK_DATA", dumpTruckData);

    return res.json({ ok: true, results });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error?.message || "Sync failed",
    });
  }
});

app.listen(Number(PORT), () => {
  console.log(`Local analysis server running on port ${PORT}`);
});
