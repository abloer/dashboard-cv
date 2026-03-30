export interface SafetyRulesModuleConfig {
  modelSource: "deployment-gate" | "manual";
  ruleProfileName: string;
  modelPath: string;
  detectorLabels: string;
  violationLabels: string;
  confidenceThreshold: string;
  iouThreshold: string;
  frameStep: string;
  imageSize: string;
  restrictedZones: string;
  requiredPpe: string;
  maxPeopleInZone: string;
  alertCooldownSeconds: string;
  supervisorEscalationNote: string;
  incidentNarrativeTemplate: string;
}

const STORAGE_KEY = "dashboard-cv-ut:safety-rules-config";

export const DEFAULT_SAFETY_RULES_CONFIG: SafetyRulesModuleConfig = {
  modelSource: "deployment-gate",
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
};

export function readSafetyRulesConfig(): SafetyRulesModuleConfig {
  if (typeof window === "undefined") {
    return DEFAULT_SAFETY_RULES_CONFIG;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SAFETY_RULES_CONFIG;
    }

    const parsed = JSON.parse(raw) as Partial<SafetyRulesModuleConfig>;
    return {
      ...DEFAULT_SAFETY_RULES_CONFIG,
      ...parsed,
    };
  } catch (_error) {
    return DEFAULT_SAFETY_RULES_CONFIG;
  }
}

export function writeSafetyRulesConfig(config: SafetyRulesModuleConfig) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resetSafetyRulesConfig() {
  if (typeof window === "undefined") {
    return DEFAULT_SAFETY_RULES_CONFIG;
  }

  window.localStorage.removeItem(STORAGE_KEY);
  return DEFAULT_SAFETY_RULES_CONFIG;
}
