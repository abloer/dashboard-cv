export interface NoHelmetModuleConfig {
  modelSource: "deployment-gate" | "manual";
  modelPath: string;
  roiId: string;
  roiConfigPath: string;
  confidenceThreshold: string;
  iouThreshold: string;
  topRatio: string;
  helmetOverlapThreshold: string;
  violationOnFrames: string;
  cleanOffFrames: string;
  frameStep: string;
  imageSize: string;
  personLabels: string;
  helmetLabels: string;
  violationLabels: string;
  requiredPpe: string;
  alertCooldownSeconds: string;
  operationalNotes: string;
}

export const COMMUNITY_DEMO_PRESET = {
  name: "DetectConstructionSafety",
  repoUrl: "https://github.com/rahilmoosavi/DetectConstructionSafety",
  suggestedModelPath: "/app/models/detect-construction-safety-best.pt",
  personLabels: "person",
  helmetLabels: "hardhat",
  violationLabels: "no-hardhat",
  confidenceThreshold: "0.20",
  violationOnFrames: "2",
  cleanOffFrames: "2",
  frameStep: "5",
  imageSize: "960",
} as const;

export const STRICT_DISTANCE_PRESET = {
  name: "Strict Distant-View",
  repoUrl: COMMUNITY_DEMO_PRESET.repoUrl,
  suggestedModelPath: COMMUNITY_DEMO_PRESET.suggestedModelPath,
  personLabels: "person",
  helmetLabels: "hardhat",
  violationLabels: "",
  confidenceThreshold: "0.40",
  iouThreshold: "0.30",
  topRatio: "0.30",
  helmetOverlapThreshold: "0.20",
  violationOnFrames: "4",
  cleanOffFrames: "4",
  frameStep: "2",
  imageSize: "1280",
} as const;

const STORAGE_KEY = "dashboard-cv-ut:no-helmet-config";

export const DEFAULT_NO_HELMET_CONFIG: NoHelmetModuleConfig = {
  modelSource: "deployment-gate",
  modelPath: STRICT_DISTANCE_PRESET.suggestedModelPath,
  roiId: "area-produksi-dashboard",
  roiConfigPath: "",
  confidenceThreshold: STRICT_DISTANCE_PRESET.confidenceThreshold,
  iouThreshold: STRICT_DISTANCE_PRESET.iouThreshold,
  topRatio: STRICT_DISTANCE_PRESET.topRatio,
  helmetOverlapThreshold: STRICT_DISTANCE_PRESET.helmetOverlapThreshold,
  violationOnFrames: STRICT_DISTANCE_PRESET.violationOnFrames,
  cleanOffFrames: STRICT_DISTANCE_PRESET.cleanOffFrames,
  frameStep: STRICT_DISTANCE_PRESET.frameStep,
  imageSize: STRICT_DISTANCE_PRESET.imageSize,
  personLabels: STRICT_DISTANCE_PRESET.personLabels,
  helmetLabels: STRICT_DISTANCE_PRESET.helmetLabels,
  violationLabels: STRICT_DISTANCE_PRESET.violationLabels,
  requiredPpe: "helmet, safety shoes",
  alertCooldownSeconds: "90",
  operationalNotes:
    "Gunakan modul ini sebagai baseline inspeksi kepatuhan helm pada area produksi, jalur alat berat, dan titik kerja dengan risiko benda jatuh. Preset default dibuat lebih konservatif untuk kamera jarak jauh agar false positive berkurang.",
};

function normalizeSavedNoHelmetConfig(parsed: Partial<NoHelmetModuleConfig>): NoHelmetModuleConfig {
  const normalizedModelPath =
    typeof parsed.modelPath === "string" && parsed.modelPath.startsWith("/Users/")
      ? DEFAULT_NO_HELMET_CONFIG.modelPath
      : parsed.modelPath;

  const merged = {
    ...DEFAULT_NO_HELMET_CONFIG,
    ...parsed,
    ...(normalizedModelPath ? { modelPath: normalizedModelPath } : {}),
  };

  const isLegacyAggressivePreset =
    merged.personLabels === COMMUNITY_DEMO_PRESET.personLabels &&
    merged.helmetLabels === COMMUNITY_DEMO_PRESET.helmetLabels &&
    merged.violationLabels === COMMUNITY_DEMO_PRESET.violationLabels &&
    merged.confidenceThreshold === COMMUNITY_DEMO_PRESET.confidenceThreshold &&
    merged.iouThreshold === "0.30" &&
    merged.topRatio === "0.35" &&
    merged.helmetOverlapThreshold === "0.30" &&
    merged.violationOnFrames === COMMUNITY_DEMO_PRESET.violationOnFrames &&
    merged.cleanOffFrames === COMMUNITY_DEMO_PRESET.cleanOffFrames &&
    merged.frameStep === COMMUNITY_DEMO_PRESET.frameStep &&
    merged.imageSize === COMMUNITY_DEMO_PRESET.imageSize;

  if (!isLegacyAggressivePreset) {
    return merged;
  }

  return {
    ...merged,
    modelSource: merged.modelSource || DEFAULT_NO_HELMET_CONFIG.modelSource,
    confidenceThreshold: STRICT_DISTANCE_PRESET.confidenceThreshold,
    iouThreshold: STRICT_DISTANCE_PRESET.iouThreshold,
    topRatio: STRICT_DISTANCE_PRESET.topRatio,
    helmetOverlapThreshold: STRICT_DISTANCE_PRESET.helmetOverlapThreshold,
    violationOnFrames: STRICT_DISTANCE_PRESET.violationOnFrames,
    cleanOffFrames: STRICT_DISTANCE_PRESET.cleanOffFrames,
    frameStep: STRICT_DISTANCE_PRESET.frameStep,
    imageSize: STRICT_DISTANCE_PRESET.imageSize,
    violationLabels: STRICT_DISTANCE_PRESET.violationLabels,
    operationalNotes:
      merged.operationalNotes ||
      DEFAULT_NO_HELMET_CONFIG.operationalNotes,
  };
}

export function readNoHelmetConfig(): NoHelmetModuleConfig {
  if (typeof window === "undefined") {
    return DEFAULT_NO_HELMET_CONFIG;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_NO_HELMET_CONFIG;
    }

    const parsed = JSON.parse(raw) as Partial<NoHelmetModuleConfig>;
    return normalizeSavedNoHelmetConfig(parsed);
  } catch (_error) {
    return DEFAULT_NO_HELMET_CONFIG;
  }
}

export function writeNoHelmetConfig(config: NoHelmetModuleConfig) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resetNoHelmetConfig() {
  if (typeof window === "undefined") {
    return DEFAULT_NO_HELMET_CONFIG;
  }

  window.localStorage.removeItem(STORAGE_KEY);
  return DEFAULT_NO_HELMET_CONFIG;
}
