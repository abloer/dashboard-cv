export interface NoSafetyVestModuleConfig {
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
  operationalNotes: string;
}

const STORAGE_KEY = "dashboard-cv-ut:no-safety-vest-config";

export const DEFAULT_NO_SAFETY_VEST_CONFIG: NoSafetyVestModuleConfig = {
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
