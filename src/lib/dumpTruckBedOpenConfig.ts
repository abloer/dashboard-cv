export interface DumpTruckBedOpenModuleConfig {
  modelSource: "deployment-gate" | "manual";
  modelPath: string;
  roiId: string;
  roiConfigPath: string;
  truckLabels: string;
  bedOpenLabels: string;
  bedClosedLabels: string;
  confidenceThreshold: string;
  iouThreshold: string;
  frameStep: string;
  imageSize: string;
  movementThreshold: string;
  minimumMovingSeconds: string;
  alertCooldownSeconds: string;
  operationalNotes: string;
}

const STORAGE_KEY = "dashboard-cv-ut:dump-truck-bed-open-config";

export const DEFAULT_DUMP_TRUCK_BED_OPEN_CONFIG: DumpTruckBedOpenModuleConfig = {
  modelSource: "deployment-gate",
  modelPath: "/Users/abloer/my_project/dashboard-cv-ut/models/yolo11l.pt",
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
    "Gunakan modul ini untuk hauling road, dumping point keluar, atau jalur perpindahan dump truck. Fokus phase 1 adalah mendeteksi truck yang bergerak dengan bak masih terbuka.",
};

function normalizeSavedDumpTruckConfig(
  parsed: Partial<DumpTruckBedOpenModuleConfig>
): DumpTruckBedOpenModuleConfig {
  return {
    ...DEFAULT_DUMP_TRUCK_BED_OPEN_CONFIG,
    ...parsed,
  };
}

export function readDumpTruckBedOpenConfig(): DumpTruckBedOpenModuleConfig {
  if (typeof window === "undefined") {
    return DEFAULT_DUMP_TRUCK_BED_OPEN_CONFIG;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_DUMP_TRUCK_BED_OPEN_CONFIG;
    }

    const parsed = JSON.parse(raw) as Partial<DumpTruckBedOpenModuleConfig>;
    return normalizeSavedDumpTruckConfig(parsed);
  } catch (_error) {
    return DEFAULT_DUMP_TRUCK_BED_OPEN_CONFIG;
  }
}

export function writeDumpTruckBedOpenConfig(config: DumpTruckBedOpenModuleConfig) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resetDumpTruckBedOpenConfig() {
  if (typeof window === "undefined") {
    return DEFAULT_DUMP_TRUCK_BED_OPEN_CONFIG;
  }

  window.localStorage.removeItem(STORAGE_KEY);
  return DEFAULT_DUMP_TRUCK_BED_OPEN_CONFIG;
}
