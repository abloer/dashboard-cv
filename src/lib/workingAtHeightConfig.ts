export interface WorkingAtHeightModuleConfig {
  modelSource: "deployment-gate" | "manual";
  modelPath: string;
  zoneId: string;
  zoneConfigPath: string;
  personLabels: string;
  confidenceThreshold: string;
  iouThreshold: string;
  frameStep: string;
  imageSize: string;
  minimumPresenceSeconds: string;
  requiredPpeAtHeight: string;
  alertCooldownSeconds: string;
  operationalNotes: string;
}

const STORAGE_KEY = "dashboard-cv-ut:working-at-height-config";

export const DEFAULT_WORKING_AT_HEIGHT_CONFIG: WorkingAtHeightModuleConfig = {
  modelSource: "deployment-gate",
  modelPath: "/app/models/detect-construction-safety-best.pt",
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
    "Gunakan modul ini untuk area scaffold, platform, conveyor head, atau elevasi lain. Fase awal memakai zone-based assessment untuk mendeteksi keberadaan person pada area kerja di ketinggian.",
};

export function readWorkingAtHeightConfig(): WorkingAtHeightModuleConfig {
  if (typeof window === "undefined") {
    return DEFAULT_WORKING_AT_HEIGHT_CONFIG;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_WORKING_AT_HEIGHT_CONFIG;
    }

    const parsed = JSON.parse(raw) as Partial<WorkingAtHeightModuleConfig>;
    return {
      ...DEFAULT_WORKING_AT_HEIGHT_CONFIG,
      ...parsed,
    };
  } catch (_error) {
    return DEFAULT_WORKING_AT_HEIGHT_CONFIG;
  }
}

export function writeWorkingAtHeightConfig(config: WorkingAtHeightModuleConfig) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resetWorkingAtHeightConfig() {
  if (typeof window === "undefined") {
    return DEFAULT_WORKING_AT_HEIGHT_CONFIG;
  }

  window.localStorage.removeItem(STORAGE_KEY);
  return DEFAULT_WORKING_AT_HEIGHT_CONFIG;
}
