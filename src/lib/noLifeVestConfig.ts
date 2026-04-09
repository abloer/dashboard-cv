export interface NoLifeVestModuleConfig {
  modelSource: "deployment-gate" | "manual";
  modelPath: string;
  roiId: string;
  roiConfigPath: string;
  confidenceThreshold: string;
  iouThreshold: string;
  lifeVestLabels: string;
  violationLabels: string;
  violationOnFrames: string;
  cleanOffFrames: string;
  frameStep: string;
  imageSize: string;
  requiredPpe: string;
  alertCooldownSeconds: string;
  operationalNotes: string;
}

const STORAGE_KEY = "dashboard-cv-ut:no-life-vest-config";

export const DEFAULT_NO_LIFE_VEST_CONFIG: NoLifeVestModuleConfig = {
  modelSource: "deployment-gate",
  modelPath: "/Users/abloer/my_project/dashboard-cv-ut/models/life-vest-baseline.pt",
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
    "Gunakan modul ini untuk area dermaga, ponton, barge, atau zona dekat air. Baseline default disarankan memakai model positive life vest yang stabil, lalu fallback logic menangani missing life vest.",
};

export function readNoLifeVestConfig(): NoLifeVestModuleConfig {
  if (typeof window === "undefined") {
    return DEFAULT_NO_LIFE_VEST_CONFIG;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_NO_LIFE_VEST_CONFIG;
    }

    const parsed = JSON.parse(raw) as Partial<NoLifeVestModuleConfig>;
    return {
      ...DEFAULT_NO_LIFE_VEST_CONFIG,
      ...parsed,
    };
  } catch (_error) {
    return DEFAULT_NO_LIFE_VEST_CONFIG;
  }
}

export function writeNoLifeVestConfig(config: NoLifeVestModuleConfig) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resetNoLifeVestConfig() {
  if (typeof window === "undefined") {
    return DEFAULT_NO_LIFE_VEST_CONFIG;
  }

  window.localStorage.removeItem(STORAGE_KEY);
  return DEFAULT_NO_LIFE_VEST_CONFIG;
}
