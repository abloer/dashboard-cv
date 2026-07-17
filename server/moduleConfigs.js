const express = require("express");
const { z } = require("zod");
const { ModuleConfigConflictError } = require("./repositories/moduleConfigRepository");

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

const createModuleConfigDefinitions = ({
  defaultModelPath,
  lifeVestBaselineModelPath,
  operationsGeneralModelPath,
}) => {
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

  return { defaultModuleConfigs, moduleConfigSchemas };
};

const moduleConfigMutationPayloadSchema = z.object({
  expectedVersion: z.number().int().positive(),
  config: z.unknown(),
});

const sendModuleConfigMutationError = (res, error, fallbackMessage) => {
  if (error instanceof ModuleConfigConflictError || error?.code === "MODULE_CONFIG_VERSION_CONFLICT") {
    return res.status(409).json({
      ok: false,
      code: "MODULE_CONFIG_VERSION_CONFLICT",
      message: "Module config was modified by another request. Refresh and retry.",
    });
  }

  return res.status(error?.statusCode || 500).json({
    ok: false,
    code: error?.code || undefined,
    message: error?.statusCode ? error.message : fallbackMessage,
    errors: error?.errors || undefined,
  });
};

const createModuleConfigBoundary = ({
  defaultModelPath,
  defaultModuleConfigs,
  fileExists,
  getActiveModelVersion,
  modelTargetModuleByConfigKey,
  moduleConfigRepository,
  moduleConfigSchemas,
}) => {
  const resolveModuleConfigEnvelope = (moduleKey) => {
    const schema = moduleConfigSchemas[moduleKey];
    const fallback = defaultModuleConfigs[moduleKey];
    if (!schema || !fallback) {
      return null;
    }

    const envelope = moduleConfigRepository.get(moduleKey);
    const config = {
      ...fallback,
      ...(envelope?.config || {}),
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
      resolvedModelPath =
        activeModel?.modelPath && fileExists(activeModel.modelPath)
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
        version: envelope?.version || 1,
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
      version: envelope?.version || 1,
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
    return Object.entries(moduleConfigRepository.list()).reduce((items, [moduleKey, envelope]) => {
      items[moduleKey] = envelope.config;
      return items;
    }, {});
  };

  const writeModuleConfigs = (items) => {
    const envelopes = Object.entries(items || {}).reduce((next, [moduleKey, config]) => {
      const current = moduleConfigRepository.get(moduleKey);
      next[moduleKey] = {
        version: current?.version || 1,
        config,
      };
      return next;
    }, {});
    moduleConfigRepository.replaceAll(envelopes);
    return readModuleConfigs();
  };

  const router = express.Router();

  router.get("/module-configs/:moduleKey", (req, res) => {
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
      version: resolved.version,
      config: resolved.config,
      resolvedModelPath: resolved.resolvedModelPath,
      activeModel: resolved.activeModel,
      modelSource: resolved.usesDeploymentGate ? "deployment-gate" : "manual",
    });
  });

  router.put("/module-configs/:moduleKey", (req, res) => {
    const schema = moduleConfigSchemas[req.params.moduleKey];
    if (!schema) {
      return res.status(404).json({ ok: false, message: "Module config not found." });
    }

    const requestPayload = moduleConfigMutationPayloadSchema.safeParse(req.body || {});
    if (!requestPayload.success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid module config mutation payload",
        errors: requestPayload.error.flatten(),
      });
    }

    const parsed = schema.safeParse(requestPayload.data.config || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid module config payload",
        errors: parsed.error.flatten(),
      });
    }

    try {
      const committed = moduleConfigRepository.update(req.params.moduleKey, parsed.data, {
        expectedVersion: requestPayload.data.expectedVersion,
      });

      return res.json({
        ok: true,
        moduleKey: req.params.moduleKey,
        version: committed.version,
        config: committed.config,
      });
    } catch (error) {
      return sendModuleConfigMutationError(res, error, "Module config update failed.");
    }
  });

  return {
    getModuleConfig,
    readModuleConfigs,
    resolveModuleConfigEnvelope,
    router,
    writeModuleConfigs,
  };
};

module.exports = {
  createModuleConfigBoundary,
  createModuleConfigDefinitions,
};
