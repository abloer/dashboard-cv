const cors = require("cors");
const { randomUUID } = require("crypto");
const dotenv = require("dotenv");
const express = require("express");
const fs = require("fs");
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
  HOST = "127.0.0.1",
  ANALYSIS_OUTPUT_ROOT,
} = process.env;

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
const mediaRegistryPath = path.resolve(repoRoot, "server/data/media-sources.json");
const analysisHistoryPath = path.resolve(repoRoot, "server/data/analysis-history.json");
const moduleConfigsPath = path.resolve(repoRoot, "server/data/module-configs.json");
const modelDatasetsPath = path.resolve(repoRoot, "server/data/model-datasets.json");
const modelTrainingJobsPath = path.resolve(repoRoot, "server/data/model-training-jobs.json");
const modelVersionsPath = path.resolve(repoRoot, "server/data/model-versions.json");
const modelEvaluationsPath = path.resolve(repoRoot, "server/data/model-evaluations.json");
const modelBenchmarksPath = path.resolve(repoRoot, "server/data/model-benchmarks.json");
fs.mkdirSync(configuredAnalysisOutputRoot, { recursive: true });
const analysisOutputRoot = fs.realpathSync.native(configuredAnalysisOutputRoot);
const uploadRoot = path.join(analysisOutputRoot, "uploads");
const previewRoot = path.join(analysisOutputRoot, "previews");
fs.mkdirSync(path.dirname(mediaRegistryPath), { recursive: true });
fs.mkdirSync(path.dirname(analysisHistoryPath), { recursive: true });
fs.mkdirSync(path.dirname(moduleConfigsPath), { recursive: true });
fs.mkdirSync(path.dirname(modelDatasetsPath), { recursive: true });
fs.mkdirSync(path.dirname(modelTrainingJobsPath), { recursive: true });
fs.mkdirSync(path.dirname(modelVersionsPath), { recursive: true });
fs.mkdirSync(path.dirname(modelEvaluationsPath), { recursive: true });
fs.mkdirSync(path.dirname(modelBenchmarksPath), { recursive: true });
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

if (!fs.existsSync(modelDatasetsPath)) {
  fs.writeFileSync(modelDatasetsPath, JSON.stringify([], null, 2));
}

if (!fs.existsSync(modelTrainingJobsPath)) {
  fs.writeFileSync(modelTrainingJobsPath, JSON.stringify([], null, 2));
}

if (!fs.existsSync(modelVersionsPath)) {
  fs.writeFileSync(
    modelVersionsPath,
    JSON.stringify(
      [],
      null,
      2
    )
  );
}

if (!fs.existsSync(modelEvaluationsPath)) {
  fs.writeFileSync(modelEvaluationsPath, JSON.stringify([], null, 2));
}

if (!fs.existsSync(modelBenchmarksPath)) {
  fs.writeFileSync(modelBenchmarksPath, JSON.stringify([], null, 2));
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
const LIVE_MONITORING_POLL_INTERVAL_MS = 5000;
const LIVE_MONITORING_CONTINUOUS_INTERVAL_SECONDS = 30;
const LIVE_MONITORING_CLIP_DURATION_SECONDS = 4;
const monitoringCaptureRoot = path.join(analysisOutputRoot, "monitoring-captures");
const monitoringRuntime = new Map();

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

const noSafetyVestPayloadSchema = z.object({
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
  violationOnFrames: z.number().int().positive().optional(),
  cleanOffFrames: z.number().int().positive().optional(),
  frameStep: z.number().int().positive().optional(),
  imageSize: z.number().int().positive().optional(),
  personLabels: z.array(z.string().trim().min(1)).optional(),
  vestLabels: z.array(z.string().trim().min(1)).optional(),
  violationLabels: z.array(z.string().trim().min(1)).optional(),
});

const noLifeVestPayloadSchema = z.object({
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
  violationOnFrames: z.number().int().positive().optional(),
  cleanOffFrames: z.number().int().positive().optional(),
  frameStep: z.number().int().positive().optional(),
  imageSize: z.number().int().positive().optional(),
  personLabels: z.array(z.string().trim().min(1)).optional(),
  vestLabels: z.array(z.string().trim().min(1)).optional(),
  violationLabels: z.array(z.string().trim().min(1)).optional(),
});

const workingAtHeightPayloadSchema = z.object({
  mediaSourceId: z.string().trim().min(1).optional(),
  videoPath: z.string().trim().min(1),
  modelPath: z.string().trim().min(1),
  zoneConfigPath: z.string().trim().min(1).optional(),
  zoneId: z.string().trim().min(1).optional(),
  zoneNormalized: z.boolean().optional(),
  zonePolygon: z.array(z.tuple([z.number(), z.number()])).min(3).optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  iouThreshold: z.number().min(0).max(1).optional(),
  frameStep: z.number().int().min(1).optional(),
  imageSize: z.number().int().min(64).optional(),
  personLabels: z.array(z.string().trim().min(1)).optional(),
  minimumPresenceSeconds: z.number().min(0).optional(),
});

const redLightViolationPayloadSchema = z.object({
  mediaSourceId: z.string().trim().min(1).optional(),
  videoPath: z.string().trim().min(1),
  vehicleModelPath: z.string().trim().min(1),
  trafficLightModelPath: z.string().trim().min(1),
  stopLineConfigPath: z.string().trim().min(1).optional(),
  intersectionId: z.string().trim().min(1).optional(),
  stopLineNormalized: z.boolean().optional(),
  stopLinePolygon: z.array(z.tuple([z.number(), z.number()])).min(3).optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  iouThreshold: z.number().min(0).max(1).optional(),
  frameStep: z.number().int().min(1).optional(),
  imageSize: z.number().int().min(64).optional(),
  vehicleLabels: z.array(z.string().trim().min(1)).optional(),
  redLightLabels: z.array(z.string().trim().min(1)).optional(),
  greenLightLabels: z.array(z.string().trim().min(1)).optional(),
  crossingWindowSeconds: z.number().min(0).optional(),
});

const dumpTruckBedOpenPayloadSchema = z.object({
  mediaSourceId: z.string().trim().min(1).optional(),
  videoPath: z.string().trim().min(1),
  modelPath: z.string().trim().min(1),
  roiConfigPath: z.string().trim().min(1).optional(),
  roiId: z.string().trim().min(1).optional(),
  roiNormalized: z.boolean().optional(),
  roiPolygon: z.array(z.tuple([z.number(), z.number()])).min(3).optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  iouThreshold: z.number().min(0).max(1).optional(),
  frameStep: z.number().int().min(1).optional(),
  imageSize: z.number().int().min(64).optional(),
  truckLabels: z.array(z.string().trim().min(1)).optional(),
  bedOpenLabels: z.array(z.string().trim().min(1)).optional(),
  bedClosedLabels: z.array(z.string().trim().min(1)).optional(),
  movementThreshold: z.number().min(0).optional(),
  minimumMovingSeconds: z.number().min(0).optional(),
});

const noSafetyVestConfigSchema = z.object({
  modelSource: z.enum(["deployment-gate", "manual"]).default("deployment-gate"),
  modelPath: z.string().trim().min(1),
  roiId: z.string().trim().min(1),
  roiConfigPath: z.string(),
  confidenceThreshold: z.string().trim().min(1),
  iouThreshold: z.string().trim().min(1),
  vestLabels: z.string().trim().min(1),
  violationLabels: z.string(),
  violationOnFrames: z.string().trim().min(1),
  cleanOffFrames: z.string().trim().min(1),
  frameStep: z.string().trim().min(1),
  imageSize: z.string().trim().min(1),
  requiredPpe: z.string().trim().min(1),
  alertCooldownSeconds: z.string().trim().min(1),
  operationalNotes: z.string(),
});

const noLifeVestConfigSchema = z.object({
  modelSource: z.enum(["deployment-gate", "manual"]).default("deployment-gate"),
  modelPath: z.string().trim().min(1),
  roiId: z.string().trim().min(1),
  roiConfigPath: z.string(),
  confidenceThreshold: z.string().trim().min(1),
  iouThreshold: z.string().trim().min(1),
  lifeVestLabels: z.string().trim().min(1),
  violationLabels: z.string(),
  violationOnFrames: z.string().trim().min(1),
  cleanOffFrames: z.string().trim().min(1),
  frameStep: z.string().trim().min(1),
  imageSize: z.string().trim().min(1),
  requiredPpe: z.string().trim().min(1),
  alertCooldownSeconds: z.string().trim().min(1),
  operationalNotes: z.string(),
});

const safetyRulesConfigSchema = z.object({
  modelSource: z.enum(["deployment-gate", "manual"]).default("deployment-gate"),
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

const workingAtHeightConfigSchema = z.object({
  modelSource: z.enum(["deployment-gate", "manual"]).default("deployment-gate"),
  modelPath: z.string().trim().min(1),
  zoneId: z.string().trim().min(1),
  zoneConfigPath: z.string(),
  personLabels: z.string().trim().min(1),
  confidenceThreshold: z.string().trim().min(1),
  iouThreshold: z.string().trim().min(1),
  frameStep: z.string().trim().min(1),
  imageSize: z.string().trim().min(1),
  minimumPresenceSeconds: z.string().trim().min(1),
  requiredPpeAtHeight: z.string().trim().min(1),
  alertCooldownSeconds: z.string().trim().min(1),
  operationalNotes: z.string(),
});

const redLightViolationConfigSchema = z.object({
  modelSource: z.enum(["deployment-gate", "manual"]).default("deployment-gate"),
  vehicleModelPath: z.string().trim().min(1),
  trafficLightModelPath: z.string().trim().min(1),
  intersectionId: z.string().trim().min(1),
  stopLineConfigPath: z.string(),
  vehicleLabels: z.string().trim().min(1),
  redLightLabels: z.string().trim().min(1),
  greenLightLabels: z.string().trim().min(1),
  confidenceThreshold: z.string().trim().min(1),
  iouThreshold: z.string().trim().min(1),
  frameStep: z.string().trim().min(1),
  imageSize: z.string().trim().min(1),
  crossingWindowSeconds: z.string().trim().min(1),
  alertCooldownSeconds: z.string().trim().min(1),
  operationalNotes: z.string(),
});

const dumpTruckBedOpenConfigSchema = z.object({
  modelSource: z.enum(["deployment-gate", "manual"]).default("deployment-gate"),
  modelPath: z.string().trim().min(1),
  roiId: z.string().trim().min(1),
  roiConfigPath: z.string(),
  truckLabels: z.string().trim().min(1),
  bedOpenLabels: z.string().trim().min(1),
  bedClosedLabels: z.string().trim().min(1),
  confidenceThreshold: z.string().trim().min(1),
  iouThreshold: z.string().trim().min(1),
  frameStep: z.string().trim().min(1),
  imageSize: z.string().trim().min(1),
  movementThreshold: z.string().trim().min(1),
  minimumMovingSeconds: z.string().trim().min(1),
  alertCooldownSeconds: z.string().trim().min(1),
  operationalNotes: z.string(),
});

const noHelmetConfigSchema = z.object({
  modelSource: z.enum(["deployment-gate", "manual"]).default("deployment-gate"),
  modelPath: z.string().trim().min(1),
  roiId: z.string().trim().min(1),
  roiConfigPath: z.string(),
  confidenceThreshold: z.string().trim().min(1),
  iouThreshold: z.string().trim().min(1),
  topRatio: z.string().trim().min(1),
  helmetOverlapThreshold: z.string().trim().min(1),
  violationOnFrames: z.string().trim().min(1),
  cleanOffFrames: z.string().trim().min(1),
  frameStep: z.string().trim().min(1),
  imageSize: z.string().trim().min(1),
  personLabels: z.string().trim().min(1),
  helmetLabels: z.string().trim().min(1),
  violationLabels: z.string(),
  requiredPpe: z.string().trim().min(1),
  alertCooldownSeconds: z.string().trim().min(1),
  operationalNotes: z.string(),
});

const moduleConfigSchemas = {
  "no-helmet": noHelmetConfigSchema,
  "no-safety-vest": noSafetyVestConfigSchema,
  "no-life-vest": noLifeVestConfigSchema,
  "safety-rules": safetyRulesConfigSchema,
  "working-at-height": workingAtHeightConfigSchema,
  "red-light-violation": redLightViolationConfigSchema,
  "dump-truck-bed-open": dumpTruckBedOpenConfigSchema,
};

const defaultModuleConfigs = {
  "no-helmet": {
    modelSource: "deployment-gate",
    modelPath: defaultModelPath,
    roiId: "area-produksi-dashboard",
    roiConfigPath: "",
    confidenceThreshold: "0.40",
    iouThreshold: "0.30",
    topRatio: "0.30",
    helmetOverlapThreshold: "0.20",
    violationOnFrames: "4",
    cleanOffFrames: "4",
    frameStep: "2",
    imageSize: "1280",
    personLabels: "person",
    helmetLabels: "hardhat",
    violationLabels: "",
    requiredPpe: "helmet, safety shoes",
    alertCooldownSeconds: "90",
    operationalNotes:
      "Gunakan modul ini sebagai baseline inspeksi kepatuhan helm pada area produksi, jalur alat berat, dan titik kerja dengan risiko benda jatuh.",
  },
  "no-safety-vest": {
    modelSource: "deployment-gate",
    modelPath: defaultModelPath,
    roiId: "area-produksi-vest",
    roiConfigPath: "",
    confidenceThreshold: "0.28",
    iouThreshold: "0.30",
    vestLabels: "safety-vest, vest",
    violationLabels: "",
    violationOnFrames: "3",
    cleanOffFrames: "3",
    frameStep: "2",
    imageSize: "1280",
    requiredPpe: "safety vest, helmet, safety shoes",
    alertCooldownSeconds: "90",
    operationalNotes:
      "Gunakan modul ini untuk inspeksi rompi keselamatan pada area produksi, loading point, dan jalur pejalan kaki. Baseline default disarankan memakai model positive vest yang stabil, lalu fallback logic menangani missing vest.",
  },
  "no-life-vest": {
    modelSource: "deployment-gate",
    modelPath: lifeVestBaselineModelPath,
    roiId: "area-air-life-vest",
    roiConfigPath: "",
    confidenceThreshold: "0.28",
    iouThreshold: "0.30",
    lifeVestLabels: "life-vest, life vest, life_jacket",
    violationLabels: "",
    violationOnFrames: "3",
    cleanOffFrames: "3",
    frameStep: "2",
    imageSize: "1280",
    requiredPpe: "life vest, helmet",
    alertCooldownSeconds: "90",
    operationalNotes:
      "Gunakan modul ini untuk area dermaga, ponton, atau area dekat air. Baseline default disarankan memakai model positive life vest yang stabil, lalu fallback logic menangani missing life vest.",
  },
  "safety-rules": {
    modelSource: "deployment-gate",
    ruleProfileName: "General Site Safety",
    modelPath: defaultModelPath,
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
  "working-at-height": {
    modelSource: "deployment-gate",
    modelPath: defaultModelPath,
    zoneId: "working-at-height-zone",
    zoneConfigPath: "",
    personLabels: "person",
    confidenceThreshold: "0.25",
    iouThreshold: "0.30",
    frameStep: "2",
    imageSize: "1280",
    minimumPresenceSeconds: "3",
    requiredPpeAtHeight: "helmet, safety vest, safety harness",
    alertCooldownSeconds: "120",
    operationalNotes:
      "Gunakan modul ini untuk area scaffold, platform, atau elevasi lain. Fase awal memakai zone-based assessment terhadap keberadaan person pada area kerja di ketinggian.",
  },
  "red-light-violation": {
    modelSource: "deployment-gate",
    vehicleModelPath: operationsGeneralModelPath,
    trafficLightModelPath: operationsGeneralModelPath,
    intersectionId: "mine-intersection-main",
    stopLineConfigPath: "",
    vehicleLabels: "truck, car, pickup, bus, vehicle",
    redLightLabels: "red-light, red_signal, red",
    greenLightLabels: "green-light, green_signal, green",
    confidenceThreshold: "0.30",
    iouThreshold: "0.30",
    frameStep: "2",
    imageSize: "1280",
    crossingWindowSeconds: "2.5",
    alertCooldownSeconds: "120",
    operationalNotes:
      "Gunakan modul ini untuk persimpangan tambang atau hauling road dengan lampu lalu lintas. Source harus melihat lampu dan stop line secara jelas agar crossing saat merah bisa diverifikasi.",
  },
  "dump-truck-bed-open": {
    modelSource: "deployment-gate",
    modelPath: operationsGeneralModelPath,
    roiId: "hauling-road-dump-truck",
    roiConfigPath: "",
    truckLabels: "dump-truck, truck, hauling-truck",
    bedOpenLabels: "bed-open, bak-terbuka, dump-bed-open",
    bedClosedLabels: "bed-closed, bak-tertutup, dump-bed-closed",
    confidenceThreshold: "0.30",
    iouThreshold: "0.30",
    frameStep: "2",
    imageSize: "1280",
    movementThreshold: "0.10",
    minimumMovingSeconds: "2",
    alertCooldownSeconds: "120",
    operationalNotes:
      "Gunakan modul ini untuk hauling road atau jalur perpindahan dump truck. Phase 1 fokus pada truck bergerak dengan bak yang masih terbuka.",
  },
};

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

const hseSafetyRulesPayloadSchema = z.object({
  mediaSourceId: z.string().trim().min(1),
});

const modelDatasetSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  domain: z.enum(["PPE", "HSE"]),
  labels: z.array(z.string().trim().min(1)),
  sourceType: z.enum(["upload", "camera", "mixed"]),
  imageCount: z.number().int().min(0),
  annotationCount: z.number().int().min(0),
  status: z.enum(["draft", "ready", "archived"]),
  description: z.string(),
  storagePath: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

const createModelDatasetPayloadSchema = z.object({
  name: z.string().trim().min(1),
  domain: z.enum(["PPE", "HSE", "Operations"]),
  labels: z.array(z.string().trim().min(1)).min(1),
  sourceType: z.enum(["upload", "camera", "mixed"]),
  imageCount: z.number().int().min(0).default(0),
  annotationCount: z.number().int().min(0).default(0),
  status: z.enum(["draft", "ready", "archived"]).default("draft"),
  description: z.string().default(""),
  storagePath: z.string().trim().min(1),
});

const updateModelDatasetPayloadSchema = z.object({
  name: z.string().trim().min(1).optional(),
  domain: z.enum(["PPE", "HSE", "Operations"]).optional(),
  labels: z.array(z.string().trim().min(1)).min(1).optional(),
  sourceType: z.enum(["upload", "camera", "mixed"]).optional(),
  imageCount: z.number().int().min(0).optional(),
  annotationCount: z.number().int().min(0).optional(),
  status: z.enum(["draft", "ready", "archived"]).optional(),
  description: z.string().optional(),
  storagePath: z.string().trim().min(1).optional(),
});

const modelTrainingJobSchema = z.object({
  id: z.string().trim().min(1),
  datasetId: z.string().trim().min(1),
  datasetName: z.string().trim().min(1),
  domain: z.enum(["PPE", "HSE"]),
  targetModule: z.enum([
    "ppe.no-helmet",
    "ppe.no-safety-vest",
    "ppe.no-life-vest",
    "hse.safety-rules",
    "hse.working-at-height",
    "operations.red-light-violation",
    "operations.dump-truck-bed-open",
  ]),
  baseModelPath: z.string().trim().min(1),
  outputModelPath: z.string().trim().min(1).nullable(),
  labels: z.array(z.string().trim().min(1)),
  status: z.enum(["queued", "running", "completed", "failed"]),
  epochs: z.number().int().min(1),
  imageSize: z.number().int().min(1),
  notes: z.string(),
  metrics: z.record(z.number()),
  createdAt: z.string().trim().min(1),
  startedAt: z.string().trim().min(1).nullable(),
  endedAt: z.string().trim().min(1).nullable(),
  updatedAt: z.string().trim().min(1),
});

const createModelTrainingJobPayloadSchema = z.object({
  datasetId: z.string().trim().min(1),
  targetModule: z.enum([
    "ppe.no-helmet",
    "ppe.no-safety-vest",
    "ppe.no-life-vest",
    "hse.safety-rules",
    "hse.working-at-height",
    "operations.red-light-violation",
    "operations.dump-truck-bed-open",
  ]),
  baseModelPath: z.string().trim().min(1),
  epochs: z.number().int().min(1).default(50),
  imageSize: z.number().int().min(1).default(1280),
  notes: z.string().default(""),
});

const updateModelTrainingJobPayloadSchema = z.object({
  status: z.enum(["queued", "running", "completed", "failed"]).optional(),
  outputModelPath: z.string().trim().min(1).nullable().optional(),
  notes: z.string().optional(),
  metrics: z.record(z.number()).optional(),
});

const modelVersionSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  moduleKey: z.enum([
    "ppe.no-helmet",
    "ppe.no-safety-vest",
    "ppe.no-life-vest",
    "hse.safety-rules",
    "hse.working-at-height",
    "operations.red-light-violation",
    "operations.dump-truck-bed-open",
  ]),
  domain: z.enum(["PPE", "HSE", "Operations"]),
  labels: z.array(z.string().trim().min(1)),
  modelPath: z.string().trim().min(1),
  sourceJobId: z.string().trim().min(1).nullable(),
  evaluationSummary: z.string(),
  status: z.enum(["candidate", "approved", "active", "rejected"]),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

const modelEvaluationSchema = z.object({
  id: z.string().trim().min(1),
  modelVersionId: z.string().trim().min(1),
  modelName: z.string().trim().min(1),
  moduleKey: z.enum([
    "ppe.no-helmet",
    "ppe.no-safety-vest",
    "ppe.no-life-vest",
    "hse.safety-rules",
    "hse.working-at-height",
    "operations.red-light-violation",
    "operations.dump-truck-bed-open",
  ]),
  domain: z.enum(["PPE", "HSE", "Operations"]),
  status: z.enum(["draft", "reviewed", "approved", "rejected"]),
  precision: z.number().min(0).max(1).nullable(),
  recall: z.number().min(0).max(1).nullable(),
  map50: z.number().min(0).max(1).nullable(),
  falsePositiveNotes: z.string(),
  falseNegativeNotes: z.string(),
  benchmarkNotes: z.string(),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

const modelBenchmarkSchema = z.object({
  id: z.string().trim().min(1),
  datasetId: z.string().trim().min(1),
  datasetName: z.string().trim().min(1),
  modelVersionId: z.string().trim().min(1),
  modelName: z.string().trim().min(1),
  moduleKey: z.enum([
    "ppe.no-helmet",
    "ppe.no-safety-vest",
    "ppe.no-life-vest",
    "hse.safety-rules",
    "hse.working-at-height",
    "operations.red-light-violation",
    "operations.dump-truck-bed-open",
  ]),
  domain: z.enum(["PPE", "HSE", "Operations"]),
  baselineModelPath: z.string().trim().min(1),
  recommendation: z.enum(["keep-current", "replace-model", "fine-tune"]),
  status: z.enum(["draft", "reviewed", "approved"]),
  precisionDelta: z.number().nullable(),
  recallDelta: z.number().nullable(),
  falsePositiveDelta: z.number().nullable(),
  falseNegativeDelta: z.number().nullable(),
  benchmarkNotes: z.string(),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

const createModelEvaluationPayloadSchema = z.object({
  modelVersionId: z.string().trim().min(1),
  status: z.enum(["draft", "reviewed", "approved", "rejected"]).default("draft"),
  precision: z.number().min(0).max(1).nullable().default(null),
  recall: z.number().min(0).max(1).nullable().default(null),
  map50: z.number().min(0).max(1).nullable().default(null),
  falsePositiveNotes: z.string().default(""),
  falseNegativeNotes: z.string().default(""),
  benchmarkNotes: z.string().default(""),
});

const updateModelEvaluationPayloadSchema = z.object({
  status: z.enum(["draft", "reviewed", "approved", "rejected"]).optional(),
  precision: z.number().min(0).max(1).nullable().optional(),
  recall: z.number().min(0).max(1).nullable().optional(),
  map50: z.number().min(0).max(1).nullable().optional(),
  falsePositiveNotes: z.string().optional(),
  falseNegativeNotes: z.string().optional(),
  benchmarkNotes: z.string().optional(),
});

const createModelBenchmarkPayloadSchema = z.object({
  datasetId: z.string().trim().min(1),
  modelVersionId: z.string().trim().min(1),
  baselineModelPath: z.string().trim().min(1),
  recommendation: z.enum(["keep-current", "replace-model", "fine-tune"]).default("keep-current"),
  status: z.enum(["draft", "reviewed", "approved"]).default("draft"),
  precisionDelta: z.number().nullable().default(null),
  recallDelta: z.number().nullable().default(null),
  falsePositiveDelta: z.number().nullable().default(null),
  falseNegativeDelta: z.number().nullable().default(null),
  benchmarkNotes: z.string().default(""),
});

const updateModelBenchmarkPayloadSchema = z.object({
  baselineModelPath: z.string().trim().min(1).optional(),
  recommendation: z.enum(["keep-current", "replace-model", "fine-tune"]).optional(),
  status: z.enum(["draft", "reviewed", "approved"]).optional(),
  precisionDelta: z.number().nullable().optional(),
  recallDelta: z.number().nullable().optional(),
  falsePositiveDelta: z.number().nullable().optional(),
  falseNegativeDelta: z.number().nullable().optional(),
  benchmarkNotes: z.string().optional(),
});

const updateModelVersionPayloadSchema = z.object({
  status: z.enum(["candidate", "approved", "active", "rejected"]),
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

const modelTargetModuleByConfigKey = {
  "no-helmet": "ppe.no-helmet",
  "no-safety-vest": "ppe.no-safety-vest",
  "no-life-vest": "ppe.no-life-vest",
  "safety-rules": "hse.safety-rules",
  "working-at-height": "hse.working-at-height",
  "red-light-violation": "operations.red-light-violation",
  "dump-truck-bed-open": "operations.dump-truck-bed-open",
};

const DEFAULT_MODEL_VERSION_SEEDS = [
  {
    id: "model-version-ppe-no-helmet-default",
    name: "Construction Safety Baseline",
    moduleKey: "ppe.no-helmet",
    domain: "PPE",
    labels: ["person", "hardhat", "no-hardhat"],
    modelPath: defaultModelPath,
    sourceJobId: null,
    evaluationSummary:
      "Baseline model komunitas yang saat ini dipakai untuk inference PPE helmet pada area konstruksi.",
    status: "active",
  },
  {
    id: "model-version-ppe-no-safety-vest-default",
    name: "Safety Vest Baseline",
    moduleKey: "ppe.no-safety-vest",
    domain: "PPE",
    labels: ["person", "safety-vest"],
    modelPath: defaultModelPath,
    sourceJobId: null,
    evaluationSummary:
      "Baseline awal untuk modul rompi keselamatan. Disarankan diganti dengan model vest khusus melalui Training Jobs dan Deployment Gate.",
    status: "active",
  },
  {
    id: "model-version-ppe-no-life-vest-default",
    name: "Life Vest Baseline",
    moduleKey: "ppe.no-life-vest",
    domain: "PPE",
    labels: ["person", "life-vest"],
    modelPath: lifeVestBaselineModelPath,
    sourceJobId: null,
    evaluationSummary:
      "Baseline awal terpisah untuk modul pelampung/life vest. Path model ini disiapkan khusus agar dapat diganti dengan model life vest domain perairan melalui Training Jobs dan Deployment Gate.",
    status: "active",
  },
  {
    id: "model-version-hse-safety-rules-default",
    name: "Safety Rules Baseline",
    moduleKey: "hse.safety-rules",
    domain: "HSE",
    labels: ["person", "vehicle", "hardhat", "safety-vest"],
    modelPath: defaultModelPath,
    sourceJobId: null,
    evaluationSummary:
      "Baseline policy HSE yang memakai evidence PPE/HSE default sebelum kandidat model khusus diaktifkan.",
    status: "active",
  },
  {
    id: "model-version-hse-working-at-height-default",
    name: "Working at Height Baseline",
    moduleKey: "hse.working-at-height",
    domain: "HSE",
    labels: ["person"],
    modelPath: defaultModelPath,
    sourceJobId: null,
    evaluationSummary:
      "Baseline awal untuk modul working at height berbasis detector person dan zone area ketinggian.",
    status: "active",
  },
  {
    id: "model-version-operations-red-light-default",
    name: "Operations General Baseline",
    moduleKey: "operations.red-light-violation",
    domain: "Operations",
    labels: ["vehicle", "red-light", "green-light"],
    modelPath: operationsGeneralModelPath,
    sourceJobId: null,
    evaluationSummary:
      "Baseline umum Operations berbasis detector kendaraan dan traffic light resmi Ultralytics. Dipakai sebagai starting point untuk red light violation sebelum model domain tambang yang lebih spesifik tersedia.",
    status: "active",
  },
  {
    id: "model-version-operations-dump-truck-default",
    name: "Dump Truck Operations Baseline",
    moduleKey: "operations.dump-truck-bed-open",
    domain: "Operations",
    labels: ["dump-truck", "bed-open", "bed-closed"],
    modelPath: operationsGeneralModelPath,
    sourceJobId: null,
    evaluationSummary:
      "Baseline umum Operations berbasis detector kendaraan resmi Ultralytics. Dipakai sebagai starting point modul dump truck sebelum model state bak terbuka/tertutup khusus tersedia.",
    status: "active",
  },
];

const getActiveModelVersion = (moduleKey) => {
  if (!moduleKey) {
    return null;
  }

  return (
    readModelVersions()
      .filter((item) => item.moduleKey === moduleKey)
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .find((item) => item.status === "active") || null
  );
};

const resolveModuleConfigEnvelope = (moduleKey) => {
  const schema = moduleConfigSchemas[moduleKey];
  const fallback = defaultModuleConfigs[moduleKey];
  if (!schema || !fallback) {
    return null;
  }

  const items = readModuleConfigs();
  const config = {
    ...fallback,
    ...(items[moduleKey] || {}),
  };
  const parsed = schema.safeParse(config);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.flatten(),
    };
  }

  const targetModuleKey = modelTargetModuleByConfigKey[moduleKey];
  const activeModel = getActiveModelVersion(targetModuleKey);
  const usesDeploymentGate = parsed.data.modelSource !== "manual";
  let resolvedModelPath =
    usesDeploymentGate && activeModel?.modelPath
      ? activeModel.modelPath
      : parsed.data.modelPath;
  const looksLikeContainerPath = String(resolvedModelPath || "").trim().startsWith("/app/");
  if (looksLikeContainerPath && !fileExists(resolvedModelPath) && fileExists(defaultModelPath)) {
    resolvedModelPath = activeModel?.modelPath && fileExists(activeModel.modelPath)
      ? activeModel.modelPath
      : defaultModelPath;
  }

  if (moduleKey === "red-light-violation") {
    const resolveOperationsModelPath = (value) => {
      let resolvedPath =
        usesDeploymentGate && activeModel?.modelPath
          ? activeModel.modelPath
          : value;
      const isContainerPath = String(resolvedPath || "").trim().startsWith("/app/");
      if (isContainerPath && !fileExists(resolvedPath) && fileExists(defaultModelPath)) {
        resolvedPath =
          activeModel?.modelPath && fileExists(activeModel.modelPath)
            ? activeModel.modelPath
            : defaultModelPath;
      }
      return resolvedPath;
    };

    return {
      ok: true,
      activeModel,
      targetModuleKey,
      config: {
        ...parsed.data,
        vehicleModelPath: resolveOperationsModelPath(parsed.data.vehicleModelPath),
        trafficLightModelPath: resolveOperationsModelPath(parsed.data.trafficLightModelPath),
      },
      resolvedModelPath,
      usesDeploymentGate,
    };
  }

  return {
    ok: true,
    activeModel,
    targetModuleKey,
    config: {
      ...parsed.data,
      modelPath: resolvedModelPath,
    },
    resolvedModelPath,
    usesDeploymentGate,
  };
};

const getModuleConfig = (moduleKey) => {
  const resolved = resolveModuleConfigEnvelope(moduleKey);
  if (!resolved?.ok) {
    return defaultModuleConfigs[moduleKey] || null;
  }

  return resolved.config;
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

const readModelDatasets = () => {
  if (!fileExists(modelDatasetsPath)) {
    fs.writeFileSync(modelDatasetsPath, JSON.stringify([], null, 2));
    return [];
  }

  const raw = fs.readFileSync(modelDatasetsPath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed)
    ? parsed
        .map((item) => modelDatasetSchema.safeParse(item))
        .filter((result) => result.success)
        .map((result) => result.data)
    : [];
};

const writeModelDatasets = (items) => {
  fs.writeFileSync(modelDatasetsPath, JSON.stringify(items, null, 2));
  return items;
};

const readModelTrainingJobs = () => {
  if (!fileExists(modelTrainingJobsPath)) {
    fs.writeFileSync(modelTrainingJobsPath, JSON.stringify([], null, 2));
    return [];
  }

  const raw = fs.readFileSync(modelTrainingJobsPath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed)
    ? parsed
        .map((item) => modelTrainingJobSchema.safeParse(item))
        .filter((result) => result.success)
        .map((result) => result.data)
    : [];
};

const writeModelTrainingJobs = (items) => {
  fs.writeFileSync(modelTrainingJobsPath, JSON.stringify(items, null, 2));
  return items;
};

const ensureDefaultModelVersions = (items) => {
  const nextItems = Array.isArray(items) ? [...items] : [];
  let didChange = false;

  for (const seed of DEFAULT_MODEL_VERSION_SEEDS) {
    const existing = nextItems.find((item) => item.moduleKey === seed.moduleKey && item.status === "active");
    if (existing) {
      continue;
    }

    const now = new Date().toISOString();
    nextItems.unshift({
      ...seed,
      createdAt: now,
      updatedAt: now,
    });
    didChange = true;
  }

  if (didChange) {
    fs.writeFileSync(modelVersionsPath, JSON.stringify(nextItems, null, 2));
  }

  return nextItems;
};

const readModelVersions = () => {
  if (!fileExists(modelVersionsPath)) {
    fs.writeFileSync(modelVersionsPath, JSON.stringify([], null, 2));
    return [];
  }

  const raw = fs.readFileSync(modelVersionsPath, "utf8");
  const parsed = JSON.parse(raw);
  const validItems = Array.isArray(parsed)
    ? parsed
        .map((item) => modelVersionSchema.safeParse(item))
        .filter((result) => result.success)
        .map((result) => result.data)
    : [];
  return ensureDefaultModelVersions(validItems);
};

const writeModelVersions = (items) => {
  fs.writeFileSync(modelVersionsPath, JSON.stringify(items, null, 2));
  return items;
};

const readModelEvaluations = () => {
  if (!fileExists(modelEvaluationsPath)) {
    fs.writeFileSync(modelEvaluationsPath, JSON.stringify([], null, 2));
    return [];
  }

  const raw = fs.readFileSync(modelEvaluationsPath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed)
    ? parsed
        .map((item) => modelEvaluationSchema.safeParse(item))
        .filter((result) => result.success)
        .map((result) => result.data)
    : [];
};

const writeModelEvaluations = (items) => {
  fs.writeFileSync(modelEvaluationsPath, JSON.stringify(items, null, 2));
  return items;
};

const readModelBenchmarks = () => {
  if (!fileExists(modelBenchmarksPath)) {
    fs.writeFileSync(modelBenchmarksPath, JSON.stringify([], null, 2));
    return [];
  }

  const raw = fs.readFileSync(modelBenchmarksPath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed)
    ? parsed
        .map((item) => modelBenchmarkSchema.safeParse(item))
        .filter((result) => result.success)
        .map((result) => result.data)
    : [];
};

const writeModelBenchmarks = (items) => {
  fs.writeFileSync(modelBenchmarksPath, JSON.stringify(items, null, 2));
  return items;
};

const buildModelsOverview = () => {
  const datasets = readModelDatasets();
  const trainingJobs = readModelTrainingJobs();
  const modelVersions = readModelVersions();

  return {
    totals: {
      datasets: datasets.length,
      readyDatasets: datasets.filter((item) => item.status === "ready").length,
      draftDatasets: datasets.filter((item) => item.status === "draft").length,
      trainingJobs: trainingJobs.length,
      runningTrainingJobs: trainingJobs.filter((item) => item.status === "running").length,
      modelVersions: modelVersions.length,
      activeModels: modelVersions.filter((item) => item.status === "active").length,
    },
    domainSplit: {
      PPE: datasets.filter((item) => item.domain === "PPE").length,
      HSE: datasets.filter((item) => item.domain === "HSE").length,
      Operations: datasets.filter((item) => item.domain === "Operations").length,
    },
    activeModelsByModule: modelVersions
      .filter((item) => item.status === "active")
      .map((item) => ({
        id: item.id,
        name: item.name,
        moduleKey: item.moduleKey,
        domain: item.domain,
        labels: item.labels,
        modelPath: item.modelPath,
        updatedAt: item.updatedAt,
      })),
    latestDatasetAt:
      datasets.length > 0
        ? datasets
            .map((item) => item.updatedAt)
            .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0]
        : null,
  };
};

const isTrainingJobCompatibleWithDataset = (job, dataset) => {
  if (dataset.domain === "PPE") {
    return (
      job.targetModule === "ppe.no-helmet" ||
      job.targetModule === "ppe.no-safety-vest" ||
      job.targetModule === "ppe.no-life-vest"
    );
  }
  if (dataset.domain === "HSE") {
    return (
      job.targetModule === "hse.safety-rules" ||
      job.targetModule === "hse.working-at-height"
    );
  }
  if (dataset.domain === "Operations") {
    return (
      job.targetModule === "operations.red-light-violation" ||
      job.targetModule === "operations.dump-truck-bed-open"
    );
  }
  return false;
};

const buildCandidateModelVersionFromTrainingJob = (job) => {
  if (!job.outputModelPath || job.status !== "completed") {
    return null;
  }

  const now = new Date().toISOString();
  return {
    id: `model-version-${job.id}`,
    name: `${job.datasetName} Candidate`,
    moduleKey: job.targetModule,
    domain: job.domain,
    labels: job.labels,
    modelPath: job.outputModelPath,
    sourceJobId: job.id,
    evaluationSummary:
      "Kandidat model hasil training job. Menunggu evaluasi lapangan dan approval sebelum bisa dijadikan active.",
    status: "candidate",
    createdAt: now,
    updatedAt: now,
  };
};

const syncModelVersionForTrainingJob = (job) => {
  const modelVersions = readModelVersions();
  const existingIndex = modelVersions.findIndex((item) => item.sourceJobId === job.id);
  const candidate = buildCandidateModelVersionFromTrainingJob(job);

  if (!candidate) {
    if (existingIndex >= 0 && modelVersions[existingIndex].status === "candidate") {
      modelVersions.splice(existingIndex, 1);
      writeModelVersions(modelVersions);
    }
    return;
  }

  if (existingIndex >= 0) {
    modelVersions[existingIndex] = {
      ...modelVersions[existingIndex],
      ...candidate,
      createdAt: modelVersions[existingIndex].createdAt,
      updatedAt: new Date().toISOString(),
    };
  } else {
    modelVersions.unshift(candidate);
  }

  writeModelVersions(modelVersions);
};

const buildEvaluationSummary = (evaluation) => {
  const metricParts = [
    typeof evaluation.precision === "number" ? `P ${evaluation.precision.toFixed(2)}` : null,
    typeof evaluation.recall === "number" ? `R ${evaluation.recall.toFixed(2)}` : null,
    typeof evaluation.map50 === "number" ? `mAP50 ${evaluation.map50.toFixed(2)}` : null,
  ].filter(Boolean);

  return metricParts.length > 0
    ? `Evaluation ${evaluation.status}: ${metricParts.join(" • ")}`
    : `Evaluation ${evaluation.status} tanpa metrik numerik.`;
};

const syncModelVersionForEvaluation = (evaluation) => {
  const modelVersions = readModelVersions();
  const index = modelVersions.findIndex((item) => item.id === evaluation.modelVersionId);
  if (index === -1) {
    return;
  }

  const current = modelVersions[index];
  const nextStatus =
    evaluation.status === "approved"
      ? current.status === "active"
        ? "active"
        : "approved"
      : evaluation.status === "rejected"
        ? current.status === "active"
          ? "active"
          : "rejected"
        : current.status;

  modelVersions[index] = {
    ...current,
    status: nextStatus,
    evaluationSummary: buildEvaluationSummary(evaluation),
    updatedAt: new Date().toISOString(),
  };

  writeModelVersions(modelVersions);
};

const ensureAnalysisDirectories = () => {
  fs.mkdirSync(analysisOutputRoot, { recursive: true });
  fs.mkdirSync(uploadRoot, { recursive: true });
  fs.mkdirSync(previewRoot, { recursive: true });
  fs.mkdirSync(monitoringCaptureRoot, { recursive: true });
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

const severityToRiskScore = (severity) => {
  if (severity === "high") return 90;
  if (severity === "medium") return 65;
  return 30;
};

const getPpeAnalysisDefinition = (analysisType) => {
  if (analysisType === "working_at_height") {
    return WORKING_AT_HEIGHT_ANALYSIS_DEFINITION;
  }
  if (analysisType === "red_light_violation") {
    return RED_LIGHT_VIOLATION_ANALYSIS_DEFINITION;
  }
  if (analysisType === "dump_truck_bed_open") {
    return DUMP_TRUCK_BED_OPEN_ANALYSIS_DEFINITION;
  }
  if (!analysisType) {
    return PPE_ANALYSIS_DEFINITIONS.no_helmet;
  }

  return (
    Object.values(PPE_ANALYSIS_DEFINITIONS).find((item) => item.analysisType === analysisType) ||
    PPE_ANALYSIS_DEFINITIONS.no_helmet
  );
};

const buildPpeAnalysisFindings = (summary, context = {}) => {
  const events = Array.isArray(summary.events) ? summary.events : [];
  const detectedAnalysisType =
    context.analysisType ||
    events.find((event) => typeof event?.event_type === "string")?.event_type ||
    "no_helmet";
  const definition = getPpeAnalysisDefinition(detectedAnalysisType);
  const runId = context.runId || `run-${Date.now()}`;
  const createdAt = context.createdAt || new Date().toISOString();
  const sourceId = context.sourceId || "";
  const sourceName = context.sourceName || "Unknown Source";
  const sourceLocation = context.sourceLocation || "";
  const sourceType = context.sourceType || "upload";
  const outputDir = context.outputDir || null;
  const configSnapshot = context.configSnapshot || {};

  return events.map((event) => {
    const durationSeconds = Math.max(0, Number(event.end_time_seconds || 0) - Number(event.start_time_seconds || 0));
    const riskScore = Math.max(30, Math.min(95, Math.round(Number(event.max_confidence || 0) * 100)));
    const snapshotUrl = event.snapshotUrl || null;
    const isUncertain = event.status === "uncertain";
    return {
      id: `finding-${event.event_id}`,
      runId,
      sourceId,
      sourceName,
      sourceLocation,
      sourceType,
      category: "PPE",
      moduleKey: definition.moduleKey,
      findingType: definition.findingType,
      title: isUncertain
        ? `Indikasi ${definition.detailLabel} perlu verifikasi`
        : definition.title,
      detail: isUncertain
        ? `Detector menemukan indikasi ${definition.detailLabel} pada track ${event.track_id} di ROI ${event.roi_id}, tetapi confidence positif PPE pada track ini belum cukup konsisten untuk dijadikan violation final.`
        : `Detector menemukan event ${definition.detailLabel} pada track ${event.track_id} di ROI ${event.roi_id}.`,
      recommendation: definition.recommendation,
      severity: isUncertain ? "low" : riskScore >= 80 ? "high" : "medium",
      status: isUncertain ? "uncertain" : "open",
      riskScore,
      metric: `${durationSeconds.toFixed(1)} s • conf ${Number(event.max_confidence || 0).toFixed(2)}`,
      eventCount: isUncertain ? 0 : 1,
      violatorCount: isUncertain ? 0 : 1,
      startsAtSeconds: Number(event.start_time_seconds || 0),
      endsAtSeconds: Number(event.end_time_seconds || 0),
      durationSeconds,
      roiId: event.roi_id || null,
      zoneIds: [],
      requiredPpe: definition.requiredPpe,
      trackIds: Number.isFinite(Number(event.track_id)) ? [Number(event.track_id)] : [],
      labels: definition.labels,
      snapshotUrl,
      evidenceUrls: snapshotUrl ? [snapshotUrl] : [],
      detectorEvidence: {
        analysisType: definition.analysisType,
        outputDir,
        createdAt,
      },
      configSnapshot,
      metadata: {
        eventId: event.event_id,
        maxConfidence: Number(event.max_confidence || 0),
        eventStatus: event.status || "violation",
        detectionMode: event.detection_mode || "direct",
      },
      createdAt,
      updatedAt: createdAt,
    };
  });
};

const buildRedLightViolationAnalysisFindings = (summary, context = {}) => {
  const events = Array.isArray(summary.events) ? summary.events : [];
  const definition = RED_LIGHT_VIOLATION_ANALYSIS_DEFINITION;
  const runId = context.runId || `run-${Date.now()}`;
  const createdAt = context.createdAt || new Date().toISOString();
  const sourceId = context.sourceId || "";
  const sourceName = context.sourceName || "Unknown Source";
  const sourceLocation = context.sourceLocation || "";
  const sourceType = context.sourceType || "upload";
  const outputDir = context.outputDir || null;
  const configSnapshot = context.configSnapshot || {};

  return events.map((event) => {
    const durationSeconds = Math.max(
      0,
      Number(event.end_time_seconds || 0) - Number(event.start_time_seconds || 0)
    );
    const maxConfidence = Number(event.max_confidence || 0);
    const riskScore = Math.max(55, Math.min(95, Math.round(maxConfidence * 100)));
    const snapshotUrl = event.snapshotUrl || null;
    const intersectionId = event.roi_id || configSnapshot.intersectionId || "mine-intersection";
    const trackId = Number(event.track_id);
    return {
      id: `finding-${event.event_id}`,
      runId,
      sourceId,
      sourceName,
      sourceLocation,
      sourceType,
      category: "Operations",
      moduleKey: definition.moduleKey,
      findingType: definition.findingType,
      title: definition.title,
      detail: `Detector menemukan kendaraan pada track ${trackId} melintasi stop line di area ${intersectionId} saat lampu merah aktif.`,
      recommendation: definition.recommendation,
      severity: riskScore >= 85 ? "high" : "medium",
      status: "open",
      riskScore,
      metric: `${durationSeconds.toFixed(1)} s • conf ${maxConfidence.toFixed(2)}`,
      eventCount: 1,
      violatorCount: 1,
      startsAtSeconds: Number(event.start_time_seconds || 0),
      endsAtSeconds: Number(event.end_time_seconds || 0),
      durationSeconds,
      roiId: event.roi_id || null,
      zoneIds: event.roi_id ? [event.roi_id] : [],
      requiredPpe: [],
      trackIds: Number.isFinite(trackId) ? [trackId] : [],
      labels: definition.labels,
      snapshotUrl,
      evidenceUrls: snapshotUrl ? [snapshotUrl] : [],
      detectorEvidence: {
        analysisType: definition.analysisType,
        outputDir,
        createdAt,
      },
      configSnapshot,
      metadata: {
        eventId: event.event_id,
        maxConfidence,
        eventStatus: event.status || "violation",
        detectionMode: event.detection_mode || "red-light",
      },
      createdAt,
      updatedAt: createdAt,
    };
  });
};

const buildDumpTruckBedOpenAnalysisFindings = (summary, context = {}) => {
  const events = Array.isArray(summary.events) ? summary.events : [];
  const definition = DUMP_TRUCK_BED_OPEN_ANALYSIS_DEFINITION;
  const runId = context.runId || `run-${Date.now()}`;
  const createdAt = context.createdAt || new Date().toISOString();
  const sourceId = context.sourceId || "";
  const sourceName = context.sourceName || "Unknown Source";
  const sourceLocation = context.sourceLocation || "";
  const sourceType = context.sourceType || "upload";
  const outputDir = context.outputDir || null;
  const configSnapshot = context.configSnapshot || {};

  return events.map((event) => {
    const durationSeconds = Math.max(
      0,
      Number(event.end_time_seconds || 0) - Number(event.start_time_seconds || 0)
    );
    const maxConfidence = Number(event.max_confidence || 0);
    const riskScore = Math.max(60, Math.min(95, Math.round(maxConfidence * 100)));
    const snapshotUrl = event.snapshotUrl || null;
    const roiId = event.roi_id || configSnapshot.roiId || "hauling-road-dump-truck";
    const trackId = Number(event.track_id);
    return {
      id: `finding-${event.event_id}`,
      runId,
      sourceId,
      sourceName,
      sourceLocation,
      sourceType,
      category: "Operations",
      moduleKey: definition.moduleKey,
      findingType: definition.findingType,
      title: definition.title,
      detail: `Detector menemukan dump truck pada track ${trackId} bergerak di area ${roiId} saat status bak terindikasi terbuka.`,
      recommendation: definition.recommendation,
      severity: riskScore >= 85 ? "high" : "medium",
      status: "open",
      riskScore,
      metric: `${durationSeconds.toFixed(1)} s • conf ${maxConfidence.toFixed(2)}`,
      eventCount: 1,
      violatorCount: 1,
      startsAtSeconds: Number(event.start_time_seconds || 0),
      endsAtSeconds: Number(event.end_time_seconds || 0),
      durationSeconds,
      roiId: event.roi_id || null,
      zoneIds: event.roi_id ? [event.roi_id] : [],
      requiredPpe: [],
      trackIds: Number.isFinite(trackId) ? [trackId] : [],
      labels: definition.labels,
      snapshotUrl,
      evidenceUrls: snapshotUrl ? [snapshotUrl] : [],
      detectorEvidence: {
        analysisType: definition.analysisType,
        outputDir,
        createdAt,
      },
      configSnapshot,
      metadata: {
        eventId: event.event_id,
        maxConfidence,
        eventStatus: event.status || "violation",
        detectionMode: event.detection_mode || "bed-open-moving",
      },
      createdAt,
      updatedAt: createdAt,
    };
  });
};

const buildWorkingAtHeightAnalysisFindings = (summary, context = {}) => {
  const events = Array.isArray(summary.events) ? summary.events : [];
  const definition = WORKING_AT_HEIGHT_ANALYSIS_DEFINITION;
  const runId = context.runId || `run-${Date.now()}`;
  const createdAt = context.createdAt || new Date().toISOString();
  const sourceId = context.sourceId || "";
  const sourceName = context.sourceName || "Unknown Source";
  const sourceLocation = context.sourceLocation || "";
  const sourceType = context.sourceType || "upload";
  const outputDir = context.outputDir || null;
  const configSnapshot = context.configSnapshot || {};

  return events.map((event) => {
    const durationSeconds = Math.max(
      0,
      Number(event.end_time_seconds || 0) - Number(event.start_time_seconds || 0)
    );
    const riskScore = Math.max(45, Math.min(95, Math.round(Number(event.max_confidence || 0) * 100)));
    const snapshotUrl = event.snapshotUrl || null;
    return {
      id: `finding-${event.event_id}`,
      runId,
      sourceId,
      sourceName,
      sourceLocation,
      sourceType,
      category: "HSE",
      moduleKey: definition.moduleKey,
      findingType: definition.findingType,
      title: definition.title,
      detail: `Detector menemukan person berada pada zone ${event.roi_id} selama ${durationSeconds.toFixed(1)} detik.`,
      recommendation: definition.recommendation,
      severity: riskScore >= 80 ? "high" : "medium",
      status: "open",
      riskScore,
      metric: `${durationSeconds.toFixed(1)} s • conf ${Number(event.max_confidence || 0).toFixed(2)}`,
      eventCount: 1,
      violatorCount: 1,
      startsAtSeconds: Number(event.start_time_seconds || 0),
      endsAtSeconds: Number(event.end_time_seconds || 0),
      durationSeconds,
      roiId: event.roi_id || null,
      zoneIds: event.roi_id ? [event.roi_id] : [],
      requiredPpe: definition.requiredPpe,
      trackIds: Number.isFinite(Number(event.track_id)) ? [Number(event.track_id)] : [],
      labels: definition.labels,
      snapshotUrl,
      evidenceUrls: snapshotUrl ? [snapshotUrl] : [],
      detectorEvidence: {
        analysisType: definition.analysisType,
        outputDir,
        createdAt,
      },
      configSnapshot,
      metadata: {
        eventId: event.event_id,
        maxConfidence: Number(event.max_confidence || 0),
        eventStatus: event.status || "violation",
        detectionMode: event.detection_mode || "zone-presence",
      },
      createdAt,
      updatedAt: createdAt,
    };
  });
};

const buildHseAnalysisFindings = (source, config, findings, context = {}) => {
  const runId = context.runId || `hse-run-${Date.now()}`;
  const createdAt = context.createdAt || new Date().toISOString();
  const outputDir = context.outputDir || null;
  const zoneIds = splitCommaSeparated(config.restrictedZones).map((item) =>
    String(item).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  );
  const requiredPpe = splitCommaSeparated(config.requiredPpe);

  return findings.map((finding) => ({
    id: `finding-${finding.id}`,
    runId,
    sourceId: source.id,
    sourceName: source.name,
    sourceLocation: source.location || "",
    sourceType: source.type,
    category: "HSE",
    moduleKey: "hse.safety-rules",
    findingType: finding.id,
    title: finding.title,
    detail: finding.detail,
    recommendation: finding.recommendation,
    severity: finding.severity,
    status: finding.status === "resolved" ? "resolved" : "open",
    riskScore: severityToRiskScore(finding.severity),
    metric: finding.metric || null,
    eventCount: finding.metric ? 1 : 0,
    violatorCount: finding.severity === "high" ? 1 : 0,
    startsAtSeconds: null,
    endsAtSeconds: null,
    durationSeconds: null,
    roiId: null,
    zoneIds,
    requiredPpe,
    trackIds: [],
    labels: [],
    snapshotUrl: null,
    evidenceUrls: [],
    detectorEvidence: {
      analysisType: context.latestEvidenceAnalysisType || null,
      outputDir,
      createdAt,
    },
    configSnapshot: config,
    metadata: {
      sourceStatus: source.status,
      monitoringStatus: source.monitoringStatus,
    },
    createdAt,
    updatedAt: createdAt,
  }));
};

const enrichSummary = (req, summary, context = {}) => {
  const events = Array.isArray(summary.events)
    ? summary.events.map((event) => ({
        ...event,
        snapshotUrl: event.snapshot_path
          ? publicSnapshotUrl(req, event.snapshot_path)
          : null,
      }))
    : [];

  return {
    ...summary,
    events,
    analysisFindings:
      context.analysisType === "working_at_height"
        ? buildWorkingAtHeightAnalysisFindings({ ...summary, events }, context)
        : context.analysisType === "red_light_violation"
          ? buildRedLightViolationAnalysisFindings({ ...summary, events }, context)
          : context.analysisType === "dump_truck_bed_open"
            ? buildDumpTruckBedOpenAnalysisFindings({ ...summary, events }, context)
          : buildPpeAnalysisFindings({ ...summary, events }, context),
  };
};

const readRunSummary = (req, outputDir, context = {}) => {
  if (!outputDir || !fileExists(outputDir)) {
    return null;
  }

  const summaryPath = path.join(outputDir, "summary.json");
  if (!fileExists(summaryPath)) {
    return null;
  }

  try {
    const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    return enrichSummary(req, summary, context);
  } catch (_error) {
    return null;
  }
};

const buildLatestAnalysisSummary = (req, run) => {
  if (!run) {
    return null;
  }

  const latestRunSummary = readRunSummary(req, run.outputDir, {
    analysisType: run.analysisType,
    runId: run.id,
    outputDir: run.outputDir,
    createdAt: run.createdAt,
    sourceId: run.mediaSourceId || "",
    sourceName: run.sourceName || "",
    sourceLocation: run.location || "",
  });
  const latestGlobalSummary = latestRunSummary?.global_summary || null;
  const definition = getPpeAnalysisDefinition(run.analysisType);

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
        ? `Run terakhir menemukan ${run.eventCount} event ${definition.findingLabel} pada source ${run.sourceName}.`
        : `Run terakhir pada source ${run.sourceName} tidak menemukan event ${definition.findingLabel}.`),
    analysisFindings: Array.isArray(latestRunSummary?.analysisFindings)
      ? latestRunSummary.analysisFindings
      : [],
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

const PPE_ANALYSIS_TYPES = new Set(["no_helmet", "no_safety_vest", "no_life_vest"]);
const LIVE_ALERT_WINDOW_MS = 5 * 60 * 1000;

const getPpeAnalysisHistory = () =>
  readAnalysisHistory().filter((item) => PPE_ANALYSIS_TYPES.has(item.analysisType));

const getRunsForSource = (runs, mediaSource) =>
  runs.filter(
    (run) => run.mediaSourceId === mediaSource.id || run.videoPath === mediaSource.source
  );

const getLatestDetectionRun = (runs) =>
  runs.find((run) => Number(run.eventCount || 0) > 0) || null;

const isRecentAlert = (createdAt) => {
  if (!createdAt) {
    return false;
  }

  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return Date.now() - timestamp <= LIVE_ALERT_WINDOW_MS;
};

const severityRank = {
  low: 1,
  medium: 2,
  high: 3,
};

const buildHseSafetyRulesReport = (req, source, config, context = {}) => {
  const latestNoHelmetRun = getLatestRunForSource("no_helmet", source);
  const latestNoHelmetSummary = latestNoHelmetRun
    ? buildLatestAnalysisSummary(req, latestNoHelmetRun)
    : null;
  const latestNoSafetyVestRun = getLatestRunForSource("no_safety_vest", source);
  const latestNoSafetyVestSummary = latestNoSafetyVestRun
    ? buildLatestAnalysisSummary(req, latestNoSafetyVestRun)
    : null;
  const latestNoLifeVestRun = getLatestRunForSource("no_life_vest", source);
  const latestNoLifeVestSummary = latestNoLifeVestRun
    ? buildLatestAnalysisSummary(req, latestNoLifeVestRun)
    : null;
  const latestWorkingAtHeightRun = getLatestRunForSource("working_at_height", source);
  const latestWorkingAtHeightSummary = latestWorkingAtHeightRun
    ? buildLatestAnalysisSummary(req, latestWorkingAtHeightRun)
    : null;
  const requiredPpe = splitCommaSeparated(config.requiredPpe);
  const restrictedZones = splitCommaSeparated(config.restrictedZones);
  const findings = [];
  const readiness = [];
  const requiresHelmet = requiredPpe.some((item) => /helmet/i.test(item));
  const requiresSafetyVest = requiredPpe.some((item) => {
    const normalized = String(item || "").toLowerCase();
    return (normalized.includes("safety vest") || normalized === "vest" || normalized.includes("rompi")) &&
      !normalized.includes("life");
  });
  const requiresLifeVest = requiredPpe.some((item) => /life\s*vest|pelampung/i.test(item));

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
    if (requiresHelmet && latestNoHelmetSummary.violatorCount > 0) {
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
  } else if (requiresHelmet) {
    findings.push({
      id: "missing-helmet-evidence",
      title: "Belum ada evidence helmet untuk source ini",
      severity: "medium",
      status: "open",
      detail: "Belum ada run PPE • No Helmet yang bisa dipakai sebagai baseline evidence HSE untuk source ini.",
      recommendation: "Jalankan analisis PPE • No Helmet terlebih dulu atau aktifkan monitoring camera agar baseline HSE punya evidence visual.",
    });
  }

  if (latestNoSafetyVestSummary) {
    if (requiresSafetyVest && latestNoSafetyVestSummary.violatorCount > 0) {
      findings.push({
        id: "safety-vest-violation",
        title: "Pelanggaran rompi keselamatan terdeteksi pada baseline HSE",
        severity: latestNoSafetyVestSummary.violatorCount >= 2 ? "high" : "medium",
        status: "open",
        detail: `Run terakhir menemukan ${latestNoSafetyVestSummary.eventCount} event dan ${latestNoSafetyVestSummary.violatorCount} track pelanggar untuk aturan rompi keselamatan.`,
        recommendation: "Lakukan inspeksi lapangan, pastikan area wajib rompi dipatuhi, dan tindak lanjuti pelanggaran berulang.",
        metric: `${latestNoSafetyVestSummary.eventCount} event / ${latestNoSafetyVestSummary.violatorCount} violator`,
      });
    }
  } else if (requiresSafetyVest) {
    findings.push({
      id: "missing-safety-vest-evidence",
      title: "Belum ada evidence rompi keselamatan untuk source ini",
      severity: "medium",
      status: "open",
      detail: "Belum ada run PPE • No Safety Vest yang bisa dipakai sebagai baseline evidence HSE untuk source ini.",
      recommendation: "Jalankan analisis PPE • No Safety Vest terlebih dulu agar HSE punya evidence visual rompi keselamatan.",
    });
  }

  if (latestNoLifeVestSummary) {
    if (requiresLifeVest && latestNoLifeVestSummary.violatorCount > 0) {
      findings.push({
        id: "life-vest-violation",
        title: "Pelanggaran pelampung terdeteksi pada baseline HSE",
        severity: latestNoLifeVestSummary.violatorCount >= 2 ? "high" : "medium",
        status: "open",
        detail: `Run terakhir menemukan ${latestNoLifeVestSummary.eventCount} event dan ${latestNoLifeVestSummary.violatorCount} track pelanggar untuk aturan pelampung.`,
        recommendation: "Verifikasi area kerja dekat air, pastikan life vest wajib dipakai, dan tindak lanjuti pelanggaran berulang.",
        metric: `${latestNoLifeVestSummary.eventCount} event / ${latestNoLifeVestSummary.violatorCount} violator`,
      });
    }
  } else if (requiresLifeVest) {
    findings.push({
      id: "missing-life-vest-evidence",
      title: "Belum ada evidence pelampung untuk source ini",
      severity: "medium",
      status: "open",
      detail: "Belum ada run PPE • No Life Vest yang bisa dipakai sebagai baseline evidence HSE untuk source ini.",
      recommendation: "Jalankan analisis PPE • No Life Vest terlebih dulu agar HSE punya evidence visual pelampung.",
    });
  }

  if (latestWorkingAtHeightSummary && latestWorkingAtHeightSummary.eventCount > 0) {
    findings.push({
      id: "working-at-height-activity",
      title: "Aktivitas bekerja di ketinggian terdeteksi",
      severity: latestWorkingAtHeightSummary.violatorCount >= 2 ? "high" : "medium",
      status: "open",
      detail: `Run working at height terakhir menemukan ${latestWorkingAtHeightSummary.eventCount} event dan ${latestWorkingAtHeightSummary.violatorCount} track pada zone elevasi.`,
      recommendation:
        "Verifikasi visual aktivitas di area ketinggian, pastikan akses zona elevasi sah, dan cek APD wajib untuk pekerjaan di ketinggian.",
      metric: `${latestWorkingAtHeightSummary.eventCount} event / ${latestWorkingAtHeightSummary.violatorCount} track`,
    });
  }

  if (
    requiresHelmet &&
    requiresSafetyVest &&
    latestNoHelmetSummary &&
    latestNoSafetyVestSummary &&
    (latestNoHelmetSummary.violatorCount > 0 || latestNoSafetyVestSummary.violatorCount > 0)
  ) {
    findings.push({
      id: "ppe-compliance-pattern",
      title: "Baseline PPE menunjukkan pola kepatuhan yang perlu ditinjau",
      severity:
        latestNoHelmetSummary.violatorCount + latestNoSafetyVestSummary.violatorCount >= 3
          ? "high"
          : "medium",
      status: "open",
      detail: `Evidence PPE terbaru menunjukkan ${latestNoHelmetSummary.violatorCount} track pelanggar helm dan ${latestNoSafetyVestSummary.violatorCount} track pelanggar rompi keselamatan.`,
      recommendation: "Audit area kerja, evaluasi briefing keselamatan, dan pastikan PPE wajib dipenuhi secara konsisten pada source ini.",
      metric: `${latestNoHelmetSummary.violatorCount} helmet / ${latestNoSafetyVestSummary.violatorCount} vest`,
    });
  }

  if (
    requiresLifeVest &&
    latestNoLifeVestSummary &&
    latestNoLifeVestSummary.violatorCount > 0
  ) {
    findings.push({
      id: "life-vest-compliance-pattern",
      title: "Baseline PPE menunjukkan risiko kepatuhan pelampung",
      severity: latestNoLifeVestSummary.violatorCount >= 2 ? "high" : "medium",
      status: "open",
      detail: `Evidence PPE terbaru menunjukkan ${latestNoLifeVestSummary.violatorCount} track pelanggar pelampung pada source ini.`,
      recommendation: "Audit area perairan, evaluasi briefing keselamatan kerja dekat air, dan pastikan pelampung wajib dipakai secara konsisten.",
      metric: `${latestNoLifeVestSummary.violatorCount} life vest`,
    });
  }

  if (!latestNoHelmetSummary && !latestNoSafetyVestSummary) {
    findings.push({
      id: "missing-evidence",
      title: "Belum ada evidence analitik untuk source ini",
      severity: "medium",
      status: "open",
      detail: "Belum ada run PPE yang bisa dipakai sebagai baseline evidence HSE untuk source ini.",
      recommendation: "Jalankan analisis PPE terlebih dulu atau aktifkan monitoring camera agar baseline HSE punya evidence visual.",
    });
  }

  const highestSeverity = findings.reduce((current, item) => {
    return severityRank[item.severity] > severityRank[current] ? item.severity : current;
  }, "low");

  const outputRiskLevel =
    findings.length === 0 ? "low" : highestSeverity === "high" ? "high" : highestSeverity === "medium" ? "medium" : "low";

  const readyCount = readiness.filter((item) => item.status === "ready").length;
  const latestSnapshotUrl =
    latestNoHelmetSummary?.events.find((event) => event.snapshotUrl)?.snapshotUrl ||
    latestNoSafetyVestSummary?.events.find((event) => event.snapshotUrl)?.snapshotUrl ||
    latestNoLifeVestSummary?.events.find((event) => event.snapshotUrl)?.snapshotUrl ||
    latestWorkingAtHeightSummary?.events.find((event) => event.snapshotUrl)?.snapshotUrl ||
    null;
  const analysisFindings = buildHseAnalysisFindings(source, config, findings, {
    runId: context.runId,
    createdAt: context.createdAt,
    outputDir: context.outputDir,
    latestEvidenceAnalysisType: latestNoHelmetSummary?.analysisType || null,
    latestSnapshotUrl,
  });

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
          latestSnapshotUrl,
        }
      : null,
    latestEvidenceByModule: {
      noHelmet: latestNoHelmetSummary
        ? {
            analysisType: latestNoHelmetSummary.analysisType,
            createdAt: latestNoHelmetSummary.createdAt,
            eventCount: latestNoHelmetSummary.eventCount,
            violatorCount: latestNoHelmetSummary.violatorCount,
            snapshotCount: latestNoHelmetSummary.snapshotCount,
            narrative: latestNoHelmetSummary.narrative,
            outputDir: latestNoHelmetSummary.outputDir,
            latestSnapshotUrl,
          }
        : null,
      noSafetyVest: latestNoSafetyVestSummary
        ? {
            analysisType: latestNoSafetyVestSummary.analysisType,
            createdAt: latestNoSafetyVestSummary.createdAt,
            eventCount: latestNoSafetyVestSummary.eventCount,
            violatorCount: latestNoSafetyVestSummary.violatorCount,
            snapshotCount: latestNoSafetyVestSummary.snapshotCount,
            narrative: latestNoSafetyVestSummary.narrative,
            outputDir: latestNoSafetyVestSummary.outputDir,
            latestSnapshotUrl:
              latestNoSafetyVestSummary?.events.find((event) => event.snapshotUrl)?.snapshotUrl ||
              null,
          }
        : null,
      noLifeVest: latestNoLifeVestSummary
        ? {
            analysisType: latestNoLifeVestSummary.analysisType,
            createdAt: latestNoLifeVestSummary.createdAt,
            eventCount: latestNoLifeVestSummary.eventCount,
            violatorCount: latestNoLifeVestSummary.violatorCount,
            snapshotCount: latestNoLifeVestSummary.snapshotCount,
            narrative: latestNoLifeVestSummary.narrative,
            outputDir: latestNoLifeVestSummary.outputDir,
            latestSnapshotUrl:
              latestNoLifeVestSummary?.events.find((event) => event.snapshotUrl)?.snapshotUrl ||
              null,
          }
        : null,
      workingAtHeight: latestWorkingAtHeightSummary
        ? {
            analysisType: latestWorkingAtHeightSummary.analysisType,
            createdAt: latestWorkingAtHeightSummary.createdAt,
            eventCount: latestWorkingAtHeightSummary.eventCount,
            violatorCount: latestWorkingAtHeightSummary.violatorCount,
            snapshotCount: latestWorkingAtHeightSummary.snapshotCount,
            narrative: latestWorkingAtHeightSummary.narrative,
            outputDir: latestWorkingAtHeightSummary.outputDir,
            latestSnapshotUrl:
              latestWorkingAtHeightSummary?.events.find((event) => event.snapshotUrl)?.snapshotUrl ||
              null,
          }
        : null,
    },
    findings,
    analysisFindings,
    summary: {
      riskLevel: outputRiskLevel,
      openFindingCount: findings.length,
      highSeverityCount: findings.filter((item) => item.severity === "high").length,
      mediumSeverityCount: findings.filter((item) => item.severity === "medium").length,
      lowSeverityCount: findings.filter((item) => item.severity === "low").length,
      latestNoHelmetEventCount: latestNoHelmetSummary?.eventCount || 0,
      latestNoHelmetViolatorCount: latestNoHelmetSummary?.violatorCount || 0,
      latestNoSafetyVestEventCount: latestNoSafetyVestSummary?.eventCount || 0,
      latestNoSafetyVestViolatorCount: latestNoSafetyVestSummary?.violatorCount || 0,
      latestNoLifeVestEventCount: latestNoLifeVestSummary?.eventCount || 0,
      latestNoLifeVestViolatorCount: latestNoLifeVestSummary?.violatorCount || 0,
      latestWorkingAtHeightEventCount: latestWorkingAtHeightSummary?.eventCount || 0,
      latestWorkingAtHeightViolatorCount: latestWorkingAtHeightSummary?.violatorCount || 0,
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

  const mediaSource = job.mediaSourceId
    ? readMediaRegistry().find((item) => item.id === job.mediaSourceId) || null
    : null;

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
      summary: job.summary
        ? enrichSummary(req, job.summary, {
            analysisType: job.analysisType,
            runId: job.runId,
            outputDir: job.outputDir,
            createdAt: job.completedAt || job.failedAt || job.createdAt,
            sourceId: mediaSource?.id || job.mediaSourceId || "",
            sourceName: mediaSource?.name || "",
            sourceLocation: mediaSource?.location || "",
            sourceType: mediaSource?.type || "upload",
            configSnapshot: job.configSnapshot || {},
          })
        : null,
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

const buildPpeAnalysisJob = (analysisType, payload) => {
  const definition = getPpeAnalysisDefinition(analysisType);
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
    vestLabels,
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
    "--event-type",
    definition.eventType,
    "--finding-label",
    definition.findingLabel,
    "--match-region",
    definition.matchRegion,
  ];

  const appendNumberArg = (flag, value) => {
    if (typeof value === "number") {
      commandArgs.push(flag, String(value));
    }
  };

  if (definition.fallbackToMissingPositive) {
    commandArgs.push("--fallback-to-missing-positive");
  }
  if (definition.vetoOnPositiveEvidence) {
    commandArgs.push("--veto-on-positive-evidence");
  }

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
  const effectivePositiveLabels = helmetLabels || vestLabels || [];
  effectivePositiveLabels.forEach((label) => {
    commandArgs.push("--helmet-label", label);
  });
  (violationLabels || []).forEach((label) => {
    commandArgs.push("--violation-label", label);
  });

  return {
    id: jobId,
    runId,
    analysisType: definition.analysisType,
    moduleKey: definition.moduleKey,
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
    configSnapshot: payload,
  };
};

const buildNoHelmetAnalysisJob = (payload) => buildPpeAnalysisJob("no_helmet", payload);

const buildNoSafetyVestAnalysisJob = (payload) => buildPpeAnalysisJob("no_safety_vest", payload);

const buildNoLifeVestAnalysisJob = (payload) => buildPpeAnalysisJob("no_life_vest", payload);

const buildWorkingAtHeightAnalysisJob = (payload) => {
  const {
    mediaSourceId,
    videoPath,
    modelPath,
    zoneConfigPath,
    zoneId,
    zoneNormalized,
    zonePolygon,
    confidenceThreshold,
    iouThreshold,
    frameStep,
    imageSize,
    personLabels,
    minimumPresenceSeconds,
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
  if (!fileExists(workingAtHeightScriptPath)) {
    const error = new Error("Working at Height script not found.");
    error.statusCode = 500;
    throw error;
  }

  const jobId = `job-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const runId = `run-${Date.now()}`;
  const outputDir = path.join(analysisOutputRoot, runId);
  fs.mkdirSync(outputDir, { recursive: true });
  const resolvedZoneConfigPath = zonePolygon
    ? path.join(outputDir, "zone.generated.json")
    : zoneConfigPath || defaultRoiConfigPath;

  if (zonePolygon) {
    fs.writeFileSync(
      resolvedZoneConfigPath,
      JSON.stringify(
        {
          roi_id: zoneId || "working-at-height-zone",
          normalized: zoneNormalized !== false,
          polygon: zonePolygon,
        },
        null,
        2
      )
    );
  }
  if (!zonePolygon && !fileExists(resolvedZoneConfigPath)) {
    const error = new Error("Zone config path not found.");
    error.statusCode = 400;
    throw error;
  }

  const commandArgs = [
    workingAtHeightScriptPath,
    "--video-path",
    videoPath,
    "--roi-config-path",
    resolvedZoneConfigPath,
    "--output-dir",
    outputDir,
    "--model-path",
    modelPath,
    "--event-type",
    "working_at_height",
    "--finding-label",
    "working at height",
  ];

  const appendNumberArg = (flag, value) => {
    if (typeof value === "number") {
      commandArgs.push(flag, String(value));
    }
  };

  appendNumberArg("--confidence-threshold", confidenceThreshold);
  appendNumberArg("--iou-threshold", iouThreshold);
  appendNumberArg("--frame-step", frameStep);
  appendNumberArg("--image-size", imageSize);
  appendNumberArg("--minimum-presence-seconds", minimumPresenceSeconds);

  (personLabels || []).forEach((label) => {
    commandArgs.push("--person-label", label);
  });

  return {
    id: jobId,
    runId,
    analysisType: "working_at_height",
    moduleKey: "hse.working-at-height",
    mediaSourceId: mediaSourceId || null,
    videoPath,
    outputDir,
    commandArgs,
    status: "queued",
    message: "Job working at height masuk antrean dan menunggu worker.",
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    failedAt: null,
    stdout: "",
    stderr: "",
    summary: null,
    configSnapshot: payload,
  };
};

const buildRedLightViolationAnalysisJob = (payload) => {
  const {
    mediaSourceId,
    videoPath,
    vehicleModelPath,
    trafficLightModelPath,
    stopLineConfigPath,
    intersectionId,
    stopLineNormalized,
    stopLinePolygon,
    confidenceThreshold,
    iouThreshold,
    frameStep,
    imageSize,
    vehicleLabels,
    redLightLabels,
    greenLightLabels,
    crossingWindowSeconds,
  } = payload;

  if (!fileExists(videoPath)) {
    const error = new Error("Video path not found.");
    error.statusCode = 400;
    throw error;
  }
  if (!fileExists(vehicleModelPath)) {
    const error = new Error("Vehicle model path not found.");
    error.statusCode = 400;
    throw error;
  }
  if (!fileExists(trafficLightModelPath)) {
    const error = new Error("Traffic light model path not found.");
    error.statusCode = 400;
    throw error;
  }
  if (!fileExists(redLightViolationScriptPath)) {
    const error = new Error("Red Light Violation script not found.");
    error.statusCode = 500;
    throw error;
  }

  const jobId = `job-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const runId = `run-${Date.now()}`;
  const outputDir = path.join(analysisOutputRoot, runId);
  fs.mkdirSync(outputDir, { recursive: true });
  const resolvedStopLineConfigPath = stopLinePolygon
    ? path.join(outputDir, "stop-line.generated.json")
    : stopLineConfigPath || defaultRoiConfigPath;

  if (stopLinePolygon) {
    fs.writeFileSync(
      resolvedStopLineConfigPath,
      JSON.stringify(
        {
          roi_id: intersectionId || "mine-intersection-main",
          normalized: stopLineNormalized !== false,
          polygon: stopLinePolygon,
        },
        null,
        2
      )
    );
  }
  if (!stopLinePolygon && !fileExists(resolvedStopLineConfigPath)) {
    const error = new Error("Stop line config path not found.");
    error.statusCode = 400;
    throw error;
  }

  const commandArgs = [
    redLightViolationScriptPath,
    "--video-path",
    videoPath,
    "--roi-config-path",
    resolvedStopLineConfigPath,
    "--output-dir",
    outputDir,
    "--vehicle-model-path",
    vehicleModelPath,
    "--traffic-light-model-path",
    trafficLightModelPath,
    "--event-type",
    "red_light_violation",
    "--finding-label",
    "red light violation",
  ];

  const appendNumberArg = (flag, value) => {
    if (typeof value === "number") {
      commandArgs.push(flag, String(value));
    }
  };

  appendNumberArg("--confidence-threshold", confidenceThreshold);
  appendNumberArg("--iou-threshold", iouThreshold);
  appendNumberArg("--frame-step", frameStep);
  appendNumberArg("--image-size", imageSize);
  appendNumberArg("--crossing-window-seconds", crossingWindowSeconds);

  (vehicleLabels || []).forEach((label) => {
    commandArgs.push("--vehicle-label", label);
  });
  (redLightLabels || []).forEach((label) => {
    commandArgs.push("--red-light-label", label);
  });
  (greenLightLabels || []).forEach((label) => {
    commandArgs.push("--green-light-label", label);
  });

  return {
    id: jobId,
    runId,
    analysisType: "red_light_violation",
    moduleKey: "operations.red-light-violation",
    mediaSourceId: mediaSourceId || null,
    videoPath,
    outputDir,
    commandArgs,
    status: "queued",
    message: "Job red light violation masuk antrean dan menunggu worker.",
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    failedAt: null,
    stdout: "",
    stderr: "",
    summary: null,
    configSnapshot: payload,
  };
};

const buildDumpTruckBedOpenAnalysisJob = (payload) => {
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
    frameStep,
    imageSize,
    truckLabels,
    bedOpenLabels,
    bedClosedLabels,
    movementThreshold,
    minimumMovingSeconds,
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
  if (!fileExists(dumpTruckBedOpenScriptPath)) {
    const error = new Error("Dump Truck Bed Open script not found.");
    error.statusCode = 500;
    throw error;
  }

  const jobId = `job-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const runId = `run-${Date.now()}`;
  const outputDir = path.join(analysisOutputRoot, runId);
  fs.mkdirSync(outputDir, { recursive: true });
  const resolvedRoiConfigPath = roiPolygon
    ? path.join(outputDir, "dump-truck-roi.generated.json")
    : roiConfigPath || defaultRoiConfigPath;

  if (roiPolygon) {
    fs.writeFileSync(
      resolvedRoiConfigPath,
      JSON.stringify(
        {
          roi_id: roiId || "hauling-road-dump-truck",
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
    dumpTruckBedOpenScriptPath,
    "--video-path",
    videoPath,
    "--roi-config-path",
    resolvedRoiConfigPath,
    "--output-dir",
    outputDir,
    "--model-path",
    modelPath,
    "--event-type",
    "dump_truck_bed_open",
    "--finding-label",
    "dump truck bed open",
  ];

  const appendNumberArg = (flag, value) => {
    if (typeof value === "number") {
      commandArgs.push(flag, String(value));
    }
  };

  appendNumberArg("--confidence-threshold", confidenceThreshold);
  appendNumberArg("--iou-threshold", iouThreshold);
  appendNumberArg("--frame-step", frameStep);
  appendNumberArg("--image-size", imageSize);
  appendNumberArg("--movement-threshold", movementThreshold);
  appendNumberArg("--minimum-moving-seconds", minimumMovingSeconds);

  (truckLabels || []).forEach((label) => {
    commandArgs.push("--truck-label", label);
  });
  (bedOpenLabels || []).forEach((label) => {
    commandArgs.push("--bed-open-label", label);
  });
  (bedClosedLabels || []).forEach((label) => {
    commandArgs.push("--bed-closed-label", label);
  });

  return {
    id: jobId,
    runId,
    analysisType: "dump_truck_bed_open",
    moduleKey: "operations.dump-truck-bed-open",
    mediaSourceId: mediaSourceId || null,
    videoPath,
    outputDir,
    commandArgs,
    status: "queued",
    message: "Job dump truck bed open masuk antrean dan menunggu worker.",
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    failedAt: null,
    stdout: "",
    stderr: "",
    summary: null,
    configSnapshot: payload,
  };
};

const executePpeAnalysisJob = async (job) => {
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
      analysisType: job.analysisType,
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

  executePpeAnalysisJob(job)
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

const getMonitoringIntervalSeconds = (source) =>
  source.executionMode === "scheduled"
    ? Number(source.monitoringIntervalSeconds || 15)
    : LIVE_MONITORING_CONTINUOUS_INTERVAL_SECONDS;

const hasPendingMonitoringJob = (sourceId) =>
  Array.from(analysisJobs.values()).some(
    (job) =>
      job.mediaSourceId === sourceId && (job.status === "queued" || job.status === "running")
  );

const buildMonitoringClipPath = (source) =>
  path.join(
    monitoringCaptureRoot,
    `${Date.now()}-${sanitizeFilename(source.name || source.id)}.mp4`
  );

const captureMonitoringClip = async (source, outputPath) => {
  await requireBinary("ffmpeg");
  const normalizedSource = source.source.trim().toLowerCase();
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
    source.source,
    "-t",
    String(LIVE_MONITORING_CLIP_DURATION_SECONDS),
    "-an",
    "-vf",
    "fps=5",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-y",
    outputPath
  );

  await runCommand("ffmpeg", ffmpegArgs, { timeout: 30000 });
};

const enqueueLiveMonitoringAnalysis = async (source) => {
  ensureAnalysisDirectories();
  const config = getModuleConfig("no-helmet");
  if (!config) {
    throw new Error("No Helmet config is unavailable.");
  }

  const clipPath = buildMonitoringClipPath(source);
  await captureMonitoringClip(source, clipPath);

  const payload = {
    mediaSourceId: source.id,
    videoPath: clipPath,
    modelPath: config.modelPath,
    roiConfigPath: config.roiConfigPath || undefined,
    roiId: config.roiId || undefined,
    confidenceThreshold: Number(config.confidenceThreshold),
    iouThreshold: Number(config.iouThreshold),
    topRatio: Number(config.topRatio),
    helmetOverlapThreshold: Number(config.helmetOverlapThreshold),
    violationOnFrames: Number(config.violationOnFrames),
    cleanOffFrames: Number(config.cleanOffFrames),
    frameStep: Number(config.frameStep),
    imageSize: Number(config.imageSize),
    personLabels: splitCommaSeparated(config.personLabels),
    helmetLabels: splitCommaSeparated(config.helmetLabels),
    violationLabels: splitCommaSeparated(config.violationLabels),
  };

  const job = enqueueAnalysisJob(buildNoHelmetAnalysisJob(payload));
  const runtimeState = monitoringRuntime.get(source.id) || {};
  monitoringRuntime.set(source.id, {
    ...runtimeState,
    lastQueuedAt: new Date().toISOString(),
    lastJobId: job.id,
    status: "queued",
    error: null,
  });
  return job;
};

const refreshMonitoringRuntime = () => {
  const sources = readMediaRegistry().filter(
    (item) =>
      item.type === "camera" &&
      item.status === "active" &&
      item.monitoringStatus === "running" &&
      item.analytics.includes("PPE")
  );

  const now = Date.now();
  const eligibleSourceIds = new Set(sources.map((item) => item.id));

  for (const [sourceId] of monitoringRuntime.entries()) {
    if (!eligibleSourceIds.has(sourceId)) {
      monitoringRuntime.delete(sourceId);
    }
  }

  sources.forEach((source) => {
    const intervalSeconds = getMonitoringIntervalSeconds(source);
    const state = monitoringRuntime.get(source.id) || {};
    const lastQueuedAt = state.lastQueuedAt ? new Date(state.lastQueuedAt).getTime() : 0;
    const elapsedMs = now - lastQueuedAt;
    const due = !lastQueuedAt || elapsedMs >= intervalSeconds * 1000;

    if (!due || hasPendingMonitoringJob(source.id)) {
      return;
    }

    enqueueLiveMonitoringAnalysis(source).catch((error) => {
      monitoringRuntime.set(source.id, {
        ...state,
        lastQueuedAt: new Date().toISOString(),
        status: "failed",
        error: error instanceof Error ? error.message : "Monitoring analysis failed.",
      });
      console.error(
        `[live-monitoring] Failed to enqueue analysis for ${source.name}:`,
        error?.stderr || error?.message || error
      );
    });
  });

  for (const [sourceId, state] of monitoringRuntime.entries()) {
    if (!state.lastJobId) {
      continue;
    }
    const job = analysisJobs.get(state.lastJobId);
    if (!job) {
      continue;
    }
    monitoringRuntime.set(sourceId, {
      ...state,
      status: job.status,
      error: job.status === "failed" ? job.message || job.stderr || "Analysis failed" : null,
      lastCompletedAt: job.completedAt || state.lastCompletedAt || null,
    });
  }
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
  const ppeHistory = getPpeAnalysisHistory();

  const sourceSummaries = mediaSources.map((source) => {
    const runs = getRunsForSource(ppeHistory, source);
    const latestRun = runs[0] || null;
    const latestDetectionRun = getLatestDetectionRun(runs);
    const latestRunSummary = latestRun
      ? readRunSummary(_req, latestRun.outputDir, {
          analysisType: latestRun.analysisType,
          runId: latestRun.id,
          outputDir: latestRun.outputDir,
          createdAt: latestRun.createdAt,
          sourceId: source.id,
          sourceName: source.name,
          sourceLocation: source.location,
          sourceType: source.type,
        })
      : null;
    const latestDetectionSummary = latestDetectionRun
      ? readRunSummary(_req, latestDetectionRun.outputDir, {
          analysisType: latestDetectionRun.analysisType,
          runId: latestDetectionRun.id,
          outputDir: latestDetectionRun.outputDir,
          createdAt: latestDetectionRun.createdAt,
          sourceId: source.id,
          sourceName: source.name,
          sourceLocation: source.location,
          sourceType: source.type,
        })
      : null;
    const latestSnapshotUrl =
      latestDetectionSummary?.events?.find((event) => event.snapshotUrl)?.snapshotUrl ||
      latestRunSummary?.events?.find((event) => event.snapshotUrl)?.snapshotUrl ||
      null;
    const latestDetectionAt = latestDetectionRun?.createdAt || null;
    const activeAlert = Boolean(latestDetectionRun && isRecentAlert(latestDetectionAt));
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
      latestDetectionAt,
      latestEventCount: latestDetectionRun?.eventCount ?? 0,
      latestViolatorCount: latestDetectionRun?.violatorCount ?? 0,
      latestOutputDir: latestRun?.outputDir || null,
      latestSnapshotUrl,
      latestAnalysisType: latestDetectionRun?.analysisType || latestRun?.analysisType || null,
      hasActiveAlert: activeAlert,
    };
  });

  const analyzedSourceCount = sourceSummaries.filter((item) => item.runCount > 0).length;
  const latestRun = ppeHistory[0] || null;
  const recentRuns = mediaSources
    .map((source) => getLatestDetectionRun(getRunsForSource(ppeHistory, source)))
    .filter(Boolean)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 10);

  res.json({
    ok: true,
    summary: {
      totalSources: mediaSources.length,
      activeSources: mediaSources.filter((item) => item.status === "active").length,
      uploadSources: mediaSources.filter((item) => item.type === "upload").length,
      cameraSources: mediaSources.filter((item) => item.type === "camera").length,
      monitoringSources: mediaSources.filter((item) => item.monitoringStatus === "running").length,
      analyzedSourceCount,
      totalNoHelmetRuns: ppeHistory.length,
      totalNoHelmetEvents: ppeHistory.reduce((sum, run) => sum + Number(run.eventCount || 0), 0),
      totalViolatorTracks: ppeHistory.reduce((sum, run) => sum + Number(run.violatorCount || 0), 0),
      latestRunAt: latestRun?.createdAt || null,
      latestRunSourceName: latestRun?.sourceName || path.basename(latestRun?.videoPath || "") || null,
      latestAnalysisSummary: buildLatestAnalysisSummary(_req, latestRun),
      sourceSummaries,
      recentRuns,
    },
  });
});

app.get("/dashboard-summary/source/:id/latest-analysis", (req, res) => {
  const mediaSources = readMediaRegistry();
  const source = mediaSources.find((item) => item.id === req.params.id);
  if (!source) {
    return res.status(404).json({ ok: false, message: "Media source not found." });
  }

  const ppeHistory = getPpeAnalysisHistory();
  const sourceRuns = getRunsForSource(ppeHistory, source);
  const latestRun = sourceRuns[0] || null;
  const latestDetectionRun = getLatestDetectionRun(sourceRuns);
  const noHelmetRuns = sourceRuns.filter((run) => run.analysisType === "no_helmet");
  const noSafetyVestRuns = sourceRuns.filter((run) => run.analysisType === "no_safety_vest");
  const noLifeVestRuns = sourceRuns.filter((run) => run.analysisType === "no_life_vest");
  const latestNoHelmetRun = noHelmetRuns[0] || null;
  const latestNoSafetyVestRun = noSafetyVestRuns[0] || null;
  const latestNoLifeVestRun = noLifeVestRuns[0] || null;
  const latestNoHelmetDetectionRun = getLatestDetectionRun(noHelmetRuns);
  const latestNoSafetyVestDetectionRun = getLatestDetectionRun(noSafetyVestRuns);
  const latestNoLifeVestDetectionRun = getLatestDetectionRun(noLifeVestRuns);

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
    latestDetectionSummary: buildLatestAnalysisSummary(req, latestDetectionRun),
    latestPpeByModule: {
      noHelmet: buildLatestAnalysisSummary(req, latestNoHelmetRun),
      noSafetyVest: buildLatestAnalysisSummary(req, latestNoSafetyVestRun),
      noLifeVest: buildLatestAnalysisSummary(req, latestNoLifeVestRun),
    },
    latestDetectionByModule: {
      noHelmet: buildLatestAnalysisSummary(req, latestNoHelmetDetectionRun),
      noSafetyVest: buildLatestAnalysisSummary(req, latestNoSafetyVestDetectionRun),
      noLifeVest: buildLatestAnalysisSummary(req, latestNoLifeVestDetectionRun),
    },
  });
});

app.get("/analysis/no-helmet/defaults", (_req, res) => {
  const resolved = resolveModuleConfigEnvelope("no-helmet");
  res.json({
    ok: true,
    defaultModelPath: resolved?.ok ? resolved.resolvedModelPath : defaultModelPath,
    defaultRoiConfigPath,
    analysisOutputRoot,
    serverPort: Number(PORT),
    uploadRoot,
    activeModel: resolved?.ok ? resolved.activeModel : null,
    modelSource: resolved?.ok && resolved.usesDeploymentGate ? "deployment-gate" : "manual",
  });
});

app.get("/analysis/no-safety-vest/defaults", (_req, res) => {
  const resolved = resolveModuleConfigEnvelope("no-safety-vest");
  res.json({
    ok: true,
    defaultModelPath: resolved?.ok ? resolved.resolvedModelPath : defaultModelPath,
    defaultRoiConfigPath,
    analysisOutputRoot,
    serverPort: Number(PORT),
    uploadRoot,
    activeModel: resolved?.ok ? resolved.activeModel : null,
    modelSource: resolved?.ok && resolved.usesDeploymentGate ? "deployment-gate" : "manual",
  });
});

app.get("/analysis/no-life-vest/defaults", (_req, res) => {
  const resolved = resolveModuleConfigEnvelope("no-life-vest");
  res.json({
    ok: true,
    defaultModelPath: resolved?.ok ? resolved.resolvedModelPath : defaultModelPath,
    defaultRoiConfigPath,
    analysisOutputRoot,
    serverPort: Number(PORT),
    uploadRoot,
    activeModel: resolved?.ok ? resolved.activeModel : null,
    modelSource: resolved?.ok && resolved.usesDeploymentGate ? "deployment-gate" : "manual",
  });
});

app.get("/analysis/working-at-height/defaults", (_req, res) => {
  const resolved = resolveModuleConfigEnvelope("working-at-height");
  res.json({
    ok: true,
    defaultModelPath: resolved?.ok ? resolved.resolvedModelPath : defaultModelPath,
    defaultZoneConfigPath: defaultRoiConfigPath,
    analysisOutputRoot,
    serverPort: Number(PORT),
    uploadRoot,
    activeModel: resolved?.ok ? resolved.activeModel : null,
    modelSource: resolved?.ok && resolved.usesDeploymentGate ? "deployment-gate" : "manual",
  });
});

app.get("/analysis/red-light-violation/defaults", (_req, res) => {
  const resolved = resolveModuleConfigEnvelope("red-light-violation");
  res.json({
    ok: true,
    defaultVehicleModelPath: resolved?.ok ? resolved.config.vehicleModelPath : defaultModelPath,
    defaultTrafficLightModelPath: resolved?.ok ? resolved.config.trafficLightModelPath : defaultModelPath,
    defaultStopLineConfigPath: defaultRoiConfigPath,
    analysisOutputRoot,
    serverPort: Number(PORT),
    uploadRoot,
    activeModel: resolved?.ok ? resolved.activeModel : null,
    modelSource: resolved?.ok && resolved.usesDeploymentGate ? "deployment-gate" : "manual",
  });
});

app.get("/analysis/dump-truck-bed-open/defaults", (_req, res) => {
  const resolved = resolveModuleConfigEnvelope("dump-truck-bed-open");
  res.json({
    ok: true,
    defaultModelPath: resolved?.ok ? resolved.resolvedModelPath : defaultModelPath,
    defaultRoiConfigPath,
    analysisOutputRoot,
    serverPort: Number(PORT),
    uploadRoot,
    activeModel: resolved?.ok ? resolved.activeModel : null,
    modelSource: resolved?.ok && resolved.usesDeploymentGate ? "deployment-gate" : "manual",
  });
});

app.get("/analysis/hse-safety-rules/defaults", (_req, res) => {
  const resolved = resolveModuleConfigEnvelope("safety-rules");
  return res.json({
    ok: true,
    moduleKey: "safety-rules",
    analysisOutputRoot,
    config: resolved?.ok ? resolved.config : getModuleConfig("safety-rules"),
    activeModel: resolved?.ok ? resolved.activeModel : null,
    modelSource: resolved?.ok && resolved.usesDeploymentGate ? "deployment-gate" : "manual",
  });
});

app.get("/models/overview", (_req, res) => {
  return res.json({
    ok: true,
    overview: buildModelsOverview(),
  });
});

app.get("/models/datasets", (_req, res) => {
  return res.json({
    ok: true,
    items: readModelDatasets().sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    ),
  });
});

app.post("/models/datasets", (req, res) => {
  const parsed = createModelDatasetPayloadSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Invalid model dataset payload.",
      errors: parsed.error.flatten(),
    });
  }

  const now = new Date().toISOString();
  const item = {
    id: `dataset-${Date.now()}-${randomUUID().slice(0, 8)}`,
    ...parsed.data,
    createdAt: now,
    updatedAt: now,
  };

  const items = readModelDatasets();
  items.unshift(item);
  writeModelDatasets(items);

  return res.status(201).json({
    ok: true,
    item,
    overview: buildModelsOverview(),
  });
});

app.patch("/models/datasets/:id", (req, res) => {
  const parsed = updateModelDatasetPayloadSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Invalid model dataset update payload.",
      errors: parsed.error.flatten(),
    });
  }

  const items = readModelDatasets();
  const index = items.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ ok: false, message: "Model dataset not found." });
  }

  const updated = {
    ...items[index],
    ...parsed.data,
    updatedAt: new Date().toISOString(),
  };
  items[index] = updated;
  writeModelDatasets(items);

  return res.json({
    ok: true,
    item: updated,
    overview: buildModelsOverview(),
  });
});

app.get("/models/training-jobs", (_req, res) => {
  return res.json({
    ok: true,
    items: readModelTrainingJobs().sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    ),
  });
});

app.get("/models/versions", (_req, res) => {
  return res.json({
    ok: true,
    items: readModelVersions().sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    ),
  });
});

app.patch("/models/versions/:id", (req, res) => {
  const parsed = updateModelVersionPayloadSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Invalid model version update payload.",
      errors: parsed.error.flatten(),
    });
  }

  const items = readModelVersions();
  const index = items.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ ok: false, message: "Model version not found." });
  }

  const target = items[index];
  const now = new Date().toISOString();

  if (parsed.data.status === "active") {
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex];
      if (item.moduleKey === target.moduleKey && item.status === "active" && item.id !== target.id) {
        items[itemIndex] = {
          ...item,
          status: "approved",
          updatedAt: now,
        };
      }
    }
  }

  const updated = {
    ...target,
    status: parsed.data.status,
    updatedAt: now,
  };
  items[index] = updated;
  writeModelVersions(items);

  return res.json({
    ok: true,
    item: updated,
    overview: buildModelsOverview(),
  });
});

app.post("/models/training-jobs", (req, res) => {
  const parsed = createModelTrainingJobPayloadSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Invalid training job payload.",
      errors: parsed.error.flatten(),
    });
  }

  const datasets = readModelDatasets();
  const dataset = datasets.find((item) => item.id === parsed.data.datasetId);
  if (!dataset) {
    return res.status(404).json({ ok: false, message: "Model dataset not found." });
  }
  if (dataset.status !== "ready") {
    return res.status(400).json({ ok: false, message: "Only datasets with status 'ready' can start training jobs." });
  }

  const candidateJob = {
    targetModule: parsed.data.targetModule,
    domain: dataset.domain,
  };

  if (!isTrainingJobCompatibleWithDataset(candidateJob, dataset)) {
    return res.status(400).json({
      ok: false,
      message: "Dataset domain and target module are not compatible.",
    });
  }

  const now = new Date().toISOString();
  const item = {
    id: `train-${Date.now()}-${randomUUID().slice(0, 8)}`,
    datasetId: dataset.id,
    datasetName: dataset.name,
    domain: dataset.domain,
    targetModule: parsed.data.targetModule,
    baseModelPath: parsed.data.baseModelPath,
    outputModelPath: null,
    labels: dataset.labels,
    status: "queued",
    epochs: parsed.data.epochs,
    imageSize: parsed.data.imageSize,
    notes: parsed.data.notes,
    metrics: {},
    createdAt: now,
    startedAt: null,
    endedAt: null,
    updatedAt: now,
  };

  const items = readModelTrainingJobs();
  items.unshift(item);
  writeModelTrainingJobs(items);

  return res.status(201).json({
    ok: true,
    item,
    overview: buildModelsOverview(),
  });
});

app.patch("/models/training-jobs/:id", (req, res) => {
  const parsed = updateModelTrainingJobPayloadSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Invalid training job update payload.",
      errors: parsed.error.flatten(),
    });
  }

  const items = readModelTrainingJobs();
  const index = items.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ ok: false, message: "Training job not found." });
  }

  const current = items[index];
  const nextStatus = parsed.data.status || current.status;
  const now = new Date().toISOString();
  const updated = {
    ...current,
    ...parsed.data,
    status: nextStatus,
    startedAt:
      nextStatus === "running"
        ? current.startedAt || now
        : nextStatus === "queued"
          ? null
          : current.startedAt,
    endedAt:
      nextStatus === "completed" || nextStatus === "failed"
        ? now
        : nextStatus === "running" || nextStatus === "queued"
          ? null
          : current.endedAt,
    updatedAt: now,
  };

  items[index] = updated;
  writeModelTrainingJobs(items);
  syncModelVersionForTrainingJob(updated);

  return res.json({
    ok: true,
    item: updated,
    overview: buildModelsOverview(),
  });
});

app.get("/models/evaluations", (_req, res) => {
  return res.json({
    ok: true,
    items: readModelEvaluations().sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    ),
  });
});

app.post("/models/evaluations", (req, res) => {
  const parsed = createModelEvaluationPayloadSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Invalid model evaluation payload.",
      errors: parsed.error.flatten(),
    });
  }

  const modelVersions = readModelVersions();
  const modelVersion = modelVersions.find((item) => item.id === parsed.data.modelVersionId);
  if (!modelVersion) {
    return res.status(404).json({ ok: false, message: "Model version not found." });
  }

  const now = new Date().toISOString();
  const item = {
    id: `evaluation-${Date.now()}-${randomUUID().slice(0, 8)}`,
    modelVersionId: modelVersion.id,
    modelName: modelVersion.name,
    moduleKey: modelVersion.moduleKey,
    domain: modelVersion.domain,
    ...parsed.data,
    createdAt: now,
    updatedAt: now,
  };

  const items = readModelEvaluations();
  items.unshift(item);
  writeModelEvaluations(items);
  syncModelVersionForEvaluation(item);

  return res.status(201).json({
    ok: true,
    item,
    overview: buildModelsOverview(),
  });
});

app.patch("/models/evaluations/:id", (req, res) => {
  const parsed = updateModelEvaluationPayloadSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Invalid model evaluation update payload.",
      errors: parsed.error.flatten(),
    });
  }

  const items = readModelEvaluations();
  const index = items.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ ok: false, message: "Model evaluation not found." });
  }

  const updated = {
    ...items[index],
    ...parsed.data,
    updatedAt: new Date().toISOString(),
  };
  items[index] = updated;
  writeModelEvaluations(items);
  syncModelVersionForEvaluation(updated);

  return res.json({
    ok: true,
    item: updated,
    overview: buildModelsOverview(),
  });
});

app.get("/models/benchmarks", (_req, res) => {
  return res.json({
    ok: true,
    items: readModelBenchmarks().sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    ),
  });
});

app.post("/models/benchmarks", (req, res) => {
  const parsed = createModelBenchmarkPayloadSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Invalid model benchmark payload.",
      errors: parsed.error.flatten(),
    });
  }

  const datasets = readModelDatasets();
  const dataset = datasets.find((item) => item.id === parsed.data.datasetId);
  if (!dataset) {
    return res.status(404).json({ ok: false, message: "Dataset not found." });
  }

  const modelVersions = readModelVersions();
  const modelVersion = modelVersions.find((item) => item.id === parsed.data.modelVersionId);
  if (!modelVersion) {
    return res.status(404).json({ ok: false, message: "Model version not found." });
  }

  const now = new Date().toISOString();
  const item = {
    id: `benchmark-${Date.now()}-${randomUUID().slice(0, 8)}`,
    datasetId: dataset.id,
    datasetName: dataset.name,
    modelVersionId: modelVersion.id,
    modelName: modelVersion.name,
    moduleKey: modelVersion.moduleKey,
    domain: modelVersion.domain,
    ...parsed.data,
    createdAt: now,
    updatedAt: now,
  };

  const items = readModelBenchmarks();
  items.unshift(item);
  writeModelBenchmarks(items);

  return res.status(201).json({
    ok: true,
    item,
    overview: buildModelsOverview(),
  });
});

app.patch("/models/benchmarks/:id", (req, res) => {
  const parsed = updateModelBenchmarkPayloadSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Invalid model benchmark update payload.",
      errors: parsed.error.flatten(),
    });
  }

  const items = readModelBenchmarks();
  const index = items.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ ok: false, message: "Model benchmark not found." });
  }

  const updated = {
    ...items[index],
    ...parsed.data,
    updatedAt: new Date().toISOString(),
  };
  items[index] = updated;
  writeModelBenchmarks(items);

  return res.json({
    ok: true,
    item: updated,
    overview: buildModelsOverview(),
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
  const createdAt = new Date().toISOString();
  fs.mkdirSync(outputDir, { recursive: true });

  const report = buildHseSafetyRulesReport(req, source, config, {
    runId,
    outputDir,
    createdAt,
  });
  const reportPayload = {
    id: runId,
    analysisType: "hse_safety_rules",
    outputDir,
    createdAt,
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

app.post("/analysis/no-safety-vest", async (req, res) => {
  try {
    const parsed = noSafetyVestPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid analysis payload",
        errors: parsed.error.flatten(),
      });
    }

    const job = enqueueAnalysisJob(buildNoSafetyVestAnalysisJob(parsed.data));
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

app.get("/analysis/no-safety-vest/jobs/:id", (req, res) => {
  const job = analysisJobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ ok: false, message: "Analysis job not found." });
  }

  return res.json(sanitizeAnalysisJobForResponse(req, job));
});

app.post("/analysis/no-life-vest", async (req, res) => {
  try {
    const parsed = noLifeVestPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid analysis payload",
        errors: parsed.error.flatten(),
      });
    }

    const job = enqueueAnalysisJob(buildNoLifeVestAnalysisJob(parsed.data));
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

app.get("/analysis/no-life-vest/jobs/:id", (req, res) => {
  const job = analysisJobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ ok: false, message: "Analysis job not found." });
  }

  return res.json(sanitizeAnalysisJobForResponse(req, job));
});

app.post("/analysis/working-at-height", async (req, res) => {
  try {
    const parsed = workingAtHeightPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid analysis payload",
        errors: parsed.error.flatten(),
      });
    }

    const job = enqueueAnalysisJob(buildWorkingAtHeightAnalysisJob(parsed.data));
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

app.get("/analysis/working-at-height/jobs/:id", (req, res) => {
  const job = analysisJobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ ok: false, message: "Analysis job not found." });
  }

  return res.json(sanitizeAnalysisJobForResponse(req, job));
});

app.post("/analysis/red-light-violation", async (req, res) => {
  try {
    const parsed = redLightViolationPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid analysis payload",
        errors: parsed.error.flatten(),
      });
    }

    const job = enqueueAnalysisJob(buildRedLightViolationAnalysisJob(parsed.data));
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

app.get("/analysis/red-light-violation/jobs/:id", (req, res) => {
  const job = analysisJobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ ok: false, message: "Analysis job not found." });
  }

  return res.json(sanitizeAnalysisJobForResponse(req, job));
});

app.post("/analysis/dump-truck-bed-open", async (req, res) => {
  try {
    const parsed = dumpTruckBedOpenPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid analysis payload",
        errors: parsed.error.flatten(),
      });
    }

    const job = enqueueAnalysisJob(buildDumpTruckBedOpenAnalysisJob(parsed.data));
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

app.get("/analysis/dump-truck-bed-open/jobs/:id", (req, res) => {
  const job = analysisJobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ ok: false, message: "Analysis job not found." });
  }

  return res.json(sanitizeAnalysisJobForResponse(req, job));
});

app.get("/module-configs/:moduleKey", (req, res) => {
  if (!moduleConfigSchemas[req.params.moduleKey]) {
    return res.status(404).json({ ok: false, message: "Module config not found." });
  }

  const resolved = resolveModuleConfigEnvelope(req.params.moduleKey);
  if (!resolved?.ok) {
    return res.status(500).json({
      ok: false,
      message: "Stored module config is invalid.",
      errors: resolved?.error || {},
    });
  }

  return res.json({
    ok: true,
    moduleKey: req.params.moduleKey,
    config: resolved.config,
    resolvedModelPath: resolved.resolvedModelPath,
    activeModel: resolved.activeModel,
    modelSource: resolved.usesDeploymentGate ? "deployment-gate" : "manual",
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

const server = app.listen(Number(PORT), HOST, () => {
  console.log(`Local analysis server running on http://${HOST}:${PORT}`);
  refreshMonitoringRuntime();
  setInterval(refreshMonitoringRuntime, LIVE_MONITORING_POLL_INTERVAL_MS);
});

server.on("error", (error) => {
  console.error(
    `[startup] Failed to bind local analysis server on http://${HOST}:${PORT}: ${
      error?.message || error
    }`
  );
  process.exit(1);
});
