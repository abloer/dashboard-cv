export interface NoSafetyVestModuleConfig {
  modelSource: "deployment-gate" | "manual";
  modelPath: string;
  roiId: string;
  roiConfigPath: string;
  confidenceThreshold: string;
  iouThreshold: string;
  vestLabels: string;
  violationLabels: string;
  violationOnFrames: string;
  cleanOffFrames: string;
  frameStep: string;
  imageSize: string;
  requiredPpe: string;
  alertCooldownSeconds: string;
  operationalNotes: string;
}

const STORAGE_KEY = "dashboard-cv-ut:no-safety-vest-config";

export const DEFAULT_NO_SAFETY_VEST_CONFIG: NoSafetyVestModuleConfig = {
  modelSource: "deployment-gate",
  modelPath: "/app/models/detect-construction-safety-best.pt",
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
};

export function readNoSafetyVestConfig(): NoSafetyVestModuleConfig {
  if (typeof window === "undefined") {
    return DEFAULT_NO_SAFETY_VEST_CONFIG;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_NO_SAFETY_VEST_CONFIG;
    }

    const parsed = JSON.parse(raw) as Partial<NoSafetyVestModuleConfig>;
    return {
      ...DEFAULT_NO_SAFETY_VEST_CONFIG,
      ...parsed,
    };
  } catch (_error) {
    return DEFAULT_NO_SAFETY_VEST_CONFIG;
  }
}

export function writeNoSafetyVestConfig(config: NoSafetyVestModuleConfig) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resetNoSafetyVestConfig() {
  if (typeof window === "undefined") {
    return DEFAULT_NO_SAFETY_VEST_CONFIG;
  }

  window.localStorage.removeItem(STORAGE_KEY);
  return DEFAULT_NO_SAFETY_VEST_CONFIG;
}
