export interface NoHelmetModuleConfig {
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

const STORAGE_KEY = "dashboard-cv-ut:no-helmet-config";

export const DEFAULT_NO_HELMET_CONFIG: NoHelmetModuleConfig = {
  modelPath: COMMUNITY_DEMO_PRESET.suggestedModelPath,
  roiId: "area-produksi-dashboard",
  roiConfigPath: "",
  confidenceThreshold: COMMUNITY_DEMO_PRESET.confidenceThreshold,
  iouThreshold: "0.30",
  topRatio: "0.35",
  helmetOverlapThreshold: "0.30",
  violationOnFrames: COMMUNITY_DEMO_PRESET.violationOnFrames,
  cleanOffFrames: COMMUNITY_DEMO_PRESET.cleanOffFrames,
  frameStep: COMMUNITY_DEMO_PRESET.frameStep,
  imageSize: COMMUNITY_DEMO_PRESET.imageSize,
  personLabels: COMMUNITY_DEMO_PRESET.personLabels,
  helmetLabels: COMMUNITY_DEMO_PRESET.helmetLabels,
  violationLabels: COMMUNITY_DEMO_PRESET.violationLabels,
};

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
    const normalizedModelPath =
      typeof parsed.modelPath === "string" && parsed.modelPath.startsWith("/Users/")
        ? DEFAULT_NO_HELMET_CONFIG.modelPath
        : parsed.modelPath;
    return {
      ...DEFAULT_NO_HELMET_CONFIG,
      ...parsed,
      ...(normalizedModelPath ? { modelPath: normalizedModelPath } : {}),
    };
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
