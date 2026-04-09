export interface RedLightViolationModuleConfig {
  modelSource: "deployment-gate" | "manual";
  vehicleModelPath: string;
  trafficLightModelPath: string;
  intersectionId: string;
  stopLineConfigPath: string;
  vehicleLabels: string;
  redLightLabels: string;
  greenLightLabels: string;
  confidenceThreshold: string;
  iouThreshold: string;
  frameStep: string;
  imageSize: string;
  crossingWindowSeconds: string;
  alertCooldownSeconds: string;
  operationalNotes: string;
}

const STORAGE_KEY = "dashboard-cv-ut:red-light-violation-config";

export const DEFAULT_RED_LIGHT_VIOLATION_CONFIG: RedLightViolationModuleConfig = {
  modelSource: "deployment-gate",
  vehicleModelPath: "/Users/abloer/my_project/dashboard-cv-ut/models/yolo11l.pt",
  trafficLightModelPath: "/Users/abloer/my_project/dashboard-cv-ut/models/yolo11l.pt",
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
    "Gunakan modul ini untuk persimpangan hauling road atau area crossing tambang. Source harus memiliki view jelas ke lampu dan stop line agar kendaraan yang melintas saat lampu merah bisa diverifikasi.",
};

function normalizeSavedRedLightConfig(
  parsed: Partial<RedLightViolationModuleConfig>
): RedLightViolationModuleConfig {
  return {
    ...DEFAULT_RED_LIGHT_VIOLATION_CONFIG,
    ...parsed,
  };
}

export function readRedLightViolationConfig(): RedLightViolationModuleConfig {
  if (typeof window === "undefined") {
    return DEFAULT_RED_LIGHT_VIOLATION_CONFIG;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_RED_LIGHT_VIOLATION_CONFIG;
    }

    const parsed = JSON.parse(raw) as Partial<RedLightViolationModuleConfig>;
    return normalizeSavedRedLightConfig(parsed);
  } catch (_error) {
    return DEFAULT_RED_LIGHT_VIOLATION_CONFIG;
  }
}

export function writeRedLightViolationConfig(config: RedLightViolationModuleConfig) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resetRedLightViolationConfig() {
  if (typeof window === "undefined") {
    return DEFAULT_RED_LIGHT_VIOLATION_CONFIG;
  }

  window.localStorage.removeItem(STORAGE_KEY);
  return DEFAULT_RED_LIGHT_VIOLATION_CONFIG;
}
