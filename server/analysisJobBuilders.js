const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");
const { ppeAnalysisConfigKeyByType } = require("./analysisSchemas");

const appendNumberArg = (commandArgs, flag, value) => {
  if (typeof value === "number") {
    commandArgs.push(flag, String(value));
  }
};

const createAnalysisJobBuilders = ({
  analysisOutputRoot,
  analysisScriptPath,
  defaultRoiConfigPath,
  dumpTruckBedOpenScriptPath,
  fileExists,
  getPpeAnalysisDefinition,
  readMediaRegistry,
  readModelVersions,
  resolveManagedConfigPath,
  resolveManagedModelPath,
  resolveManagedVideoPath,
  resolveModuleConfigEnvelope,
  workingAtHeightScriptPath,
  redLightViolationScriptPath,
}) => {
  const resolvePpeAnalysisInputPaths = (analysisType, payload, options = {}) => {
    const mediaSources = options.mediaSources || readMediaRegistry();
    const source = payload.mediaSourceId
      ? mediaSources.find((item) => item.id === payload.mediaSourceId) || null
      : null;

    if (payload.mediaSourceId && !source) {
      const error = new Error("Media source not found.");
      error.statusCode = 404;
      throw error;
    }
    if (source?.type === "camera") {
      const error = new Error("Camera sources must be captured through live monitoring before analysis.");
      error.statusCode = 400;
      throw error;
    }

    const configKey = ppeAnalysisConfigKeyByType[analysisType];
    const configEnvelope = configKey ? resolveModuleConfigEnvelope(configKey) : null;
    const config = configEnvelope?.ok ? configEnvelope.config : null;
    const targetModuleKey = configEnvelope?.targetModuleKey || null;
    const modelVersions = options.modelVersions || readModelVersions();
    const modelVersion = payload.modelVersionId
      ? modelVersions.find((item) => item.id === payload.modelVersionId) || null
      : null;

    if (payload.modelVersionId && !modelVersion) {
      const error = new Error("Model version not found.");
      error.statusCode = 404;
      throw error;
    }
    if (modelVersion && targetModuleKey && modelVersion.moduleKey !== targetModuleKey) {
      const error = new Error("Model version is not compatible with this analysis module.");
      error.statusCode = 400;
      throw error;
    }

    const videoPath = source?.source || payload.videoPath;
    const modelPath = modelVersion?.modelPath || configEnvelope?.resolvedModelPath || config?.modelPath || payload.modelPath;
    const roiConfigPath = payload.roiConfigPath || config?.roiConfigPath || defaultRoiConfigPath;

    if (!videoPath) {
      const error = new Error("mediaSourceId is required for analysis.");
      error.statusCode = 400;
      throw error;
    }
    if (!modelPath) {
      const error = new Error("Model path could not be resolved for analysis.");
      error.statusCode = 400;
      throw error;
    }

    return {
      mediaSourceId: source?.id || payload.mediaSourceId || null,
      videoPath: resolveManagedVideoPath(videoPath),
      modelPath: resolveManagedModelPath(modelPath),
      roiConfigPath: resolveManagedConfigPath(roiConfigPath || defaultRoiConfigPath, "ROI config path"),
      source,
      modelVersion,
    };
  };

  const resolveModuleAnalysisInputPaths = ({
    payload,
    configKey,
    modelLabel = "Model path",
    configPathField = "roiConfigPath",
    configPathLabel = "Config path",
    options = {},
  }) => {
    const mediaSources = options.mediaSources || readMediaRegistry();
    const source = payload.mediaSourceId
      ? mediaSources.find((item) => item.id === payload.mediaSourceId) || null
      : null;

    if (payload.mediaSourceId && !source) {
      const error = new Error("Media source not found.");
      error.statusCode = 404;
      throw error;
    }
    if (source?.type === "camera") {
      const error = new Error("Camera sources must be captured through live monitoring before analysis.");
      error.statusCode = 400;
      throw error;
    }

    const configEnvelope = resolveModuleConfigEnvelope(configKey);
    const config = configEnvelope?.ok ? configEnvelope.config : null;
    const targetModuleKey = configEnvelope?.targetModuleKey || null;
    const modelVersions = options.modelVersions || readModelVersions();
    const modelVersion = payload.modelVersionId
      ? modelVersions.find((item) => item.id === payload.modelVersionId) || null
      : null;

    if (payload.modelVersionId && !modelVersion) {
      const error = new Error("Model version not found.");
      error.statusCode = 404;
      throw error;
    }
    if (modelVersion && targetModuleKey && modelVersion.moduleKey !== targetModuleKey) {
      const error = new Error("Model version is not compatible with this analysis module.");
      error.statusCode = 400;
      throw error;
    }

    const videoPath = source?.source || payload.videoPath;
    const modelPath = modelVersion?.modelPath || configEnvelope?.resolvedModelPath || config?.modelPath || payload.modelPath;
    const configPath = payload[configPathField] || config?.[configPathField] || defaultRoiConfigPath;

    if (!videoPath) {
      const error = new Error("mediaSourceId is required for analysis.");
      error.statusCode = 400;
      throw error;
    }
    if (!modelPath) {
      const error = new Error(`${modelLabel} could not be resolved for analysis.`);
      error.statusCode = 400;
      throw error;
    }

    return {
      mediaSourceId: source?.id || payload.mediaSourceId || null,
      videoPath: resolveManagedVideoPath(videoPath),
      modelPath: resolveManagedModelPath(modelPath, modelLabel),
      configPath: resolveManagedConfigPath(configPath || defaultRoiConfigPath, configPathLabel),
      source,
      modelVersion,
    };
  };

  const resolveRedLightAnalysisInputPaths = (payload, options = {}) => {
    const mediaSources = options.mediaSources || readMediaRegistry();
    const source = payload.mediaSourceId
      ? mediaSources.find((item) => item.id === payload.mediaSourceId) || null
      : null;

    if (payload.mediaSourceId && !source) {
      const error = new Error("Media source not found.");
      error.statusCode = 404;
      throw error;
    }
    if (source?.type === "camera") {
      const error = new Error("Camera sources must be captured through live monitoring before analysis.");
      error.statusCode = 400;
      throw error;
    }

    const configEnvelope = resolveModuleConfigEnvelope("red-light-violation");
    const config = configEnvelope?.ok ? configEnvelope.config : null;
    const targetModuleKey = configEnvelope?.targetModuleKey || null;
    const modelVersions = options.modelVersions || readModelVersions();
    const modelVersion = payload.modelVersionId
      ? modelVersions.find((item) => item.id === payload.modelVersionId) || null
      : null;

    if (payload.modelVersionId && !modelVersion) {
      const error = new Error("Model version not found.");
      error.statusCode = 404;
      throw error;
    }
    if (modelVersion && targetModuleKey && modelVersion.moduleKey !== targetModuleKey) {
      const error = new Error("Model version is not compatible with this analysis module.");
      error.statusCode = 400;
      throw error;
    }

    const sharedModelPath = modelVersion?.modelPath || null;
    const videoPath = source?.source || payload.videoPath;
    const vehicleModelPath = sharedModelPath || config?.vehicleModelPath || payload.vehicleModelPath;
    const trafficLightModelPath = sharedModelPath || config?.trafficLightModelPath || payload.trafficLightModelPath;
    const stopLineConfigPath = payload.stopLineConfigPath || config?.stopLineConfigPath || defaultRoiConfigPath;

    if (!videoPath) {
      const error = new Error("mediaSourceId is required for analysis.");
      error.statusCode = 400;
      throw error;
    }
    if (!vehicleModelPath || !trafficLightModelPath) {
      const error = new Error("Red light model paths could not be resolved for analysis.");
      error.statusCode = 400;
      throw error;
    }

    return {
      mediaSourceId: source?.id || payload.mediaSourceId || null,
      videoPath: resolveManagedVideoPath(videoPath),
      vehicleModelPath: resolveManagedModelPath(vehicleModelPath, "Vehicle model path"),
      trafficLightModelPath: resolveManagedModelPath(trafficLightModelPath, "Traffic light model path"),
      stopLineConfigPath: resolveManagedConfigPath(stopLineConfigPath || defaultRoiConfigPath, "Stop line config path"),
      source,
      modelVersion,
    };
  };

  const createRunOutputDir = () => {
    const runId = `run-${Date.now()}`;
    const outputDir = path.join(analysisOutputRoot, runId);
    fs.mkdirSync(outputDir, { recursive: true });
    return outputDir;
  };

  const createJobEnvelope = ({ analysisType, moduleKey, mediaSourceId, videoPath, outputDir, commandArgs, message, payload }) => ({
    id: `job-${Date.now()}-${randomUUID().slice(0, 8)}`,
    runId: path.basename(outputDir),
    analysisType,
    moduleKey,
    mediaSourceId,
    videoPath,
    outputDir,
    commandArgs,
    status: "queued",
    message,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    failedAt: null,
    stdout: "",
    stderr: "",
    summary: null,
    configSnapshot: payload,
  });

  const buildPpeAnalysisJob = (analysisType, payload) => {
    const definition = getPpeAnalysisDefinition(analysisType);
    const resolvedInputs = resolvePpeAnalysisInputPaths(analysisType, payload);
    if (!fileExists(analysisScriptPath)) {
      const error = new Error("Analysis script not found.");
      error.statusCode = 500;
      throw error;
    }

    const outputDir = createRunOutputDir();
    const resolvedRoiConfigPath = payload.roiPolygon
      ? path.join(outputDir, "roi.generated.json")
      : resolvedInputs.roiConfigPath;

    if (payload.roiPolygon) {
      fs.writeFileSync(
        resolvedRoiConfigPath,
        JSON.stringify(
          {
            roi_id: payload.roiId || "roi-dashboard",
            normalized: payload.roiNormalized !== false,
            polygon: payload.roiPolygon,
          },
          null,
          2
        )
      );
    }

    const commandArgs = [
      analysisScriptPath,
      "--video-path",
      resolvedInputs.videoPath,
      "--roi-config-path",
      resolvedRoiConfigPath,
      "--output-dir",
      outputDir,
      "--model-path",
      resolvedInputs.modelPath,
      "--event-type",
      definition.eventType,
      "--finding-label",
      definition.findingLabel,
      "--match-region",
      definition.matchRegion,
    ];

    if (definition.fallbackToMissingPositive) {
      commandArgs.push("--fallback-to-missing-positive");
    }
    if (definition.vetoOnPositiveEvidence) {
      commandArgs.push("--veto-on-positive-evidence");
    }

    appendNumberArg(commandArgs, "--confidence-threshold", payload.confidenceThreshold);
    appendNumberArg(commandArgs, "--iou-threshold", payload.iouThreshold);
    appendNumberArg(commandArgs, "--top-ratio", payload.topRatio);
    appendNumberArg(commandArgs, "--helmet-overlap-threshold", payload.helmetOverlapThreshold);
    appendNumberArg(commandArgs, "--violation-on-frames", payload.violationOnFrames);
    appendNumberArg(commandArgs, "--clean-off-frames", payload.cleanOffFrames);
    appendNumberArg(commandArgs, "--frame-step", payload.frameStep);
    appendNumberArg(commandArgs, "--image-size", payload.imageSize);

    (payload.personLabels || []).forEach((label) => commandArgs.push("--person-label", label));
    (payload.helmetLabels || payload.vestLabels || []).forEach((label) => commandArgs.push("--helmet-label", label));
    (payload.violationLabels || []).forEach((label) => commandArgs.push("--violation-label", label));

    return createJobEnvelope({
      analysisType: definition.analysisType,
      moduleKey: definition.moduleKey,
      mediaSourceId: resolvedInputs.mediaSourceId,
      videoPath: resolvedInputs.videoPath,
      outputDir,
      commandArgs,
      message: "Job analisis masuk antrean dan menunggu worker.",
      payload,
    });
  };

  const buildNoHelmetAnalysisJob = (payload) => buildPpeAnalysisJob("no_helmet", payload);
  const buildNoSafetyVestAnalysisJob = (payload) => buildPpeAnalysisJob("no_safety_vest", payload);
  const buildNoLifeVestAnalysisJob = (payload) => buildPpeAnalysisJob("no_life_vest", payload);

  const buildWorkingAtHeightAnalysisJob = (payload) => {
    const resolvedInputs = resolveModuleAnalysisInputPaths({
      payload,
      configKey: "working-at-height",
      configPathField: "zoneConfigPath",
      configPathLabel: "Zone config path",
    });
    if (!fileExists(workingAtHeightScriptPath)) {
      const error = new Error("Working at Height script not found.");
      error.statusCode = 500;
      throw error;
    }

    const outputDir = createRunOutputDir();
    const resolvedZoneConfigPath = payload.zonePolygon
      ? path.join(outputDir, "zone.generated.json")
      : resolvedInputs.configPath;
    if (payload.zonePolygon) {
      fs.writeFileSync(
        resolvedZoneConfigPath,
        JSON.stringify(
          {
            roi_id: payload.zoneId || "working-at-height-zone",
            normalized: payload.zoneNormalized !== false,
            polygon: payload.zonePolygon,
          },
          null,
          2
        )
      );
    }

    const commandArgs = [
      workingAtHeightScriptPath,
      "--video-path",
      resolvedInputs.videoPath,
      "--roi-config-path",
      resolvedZoneConfigPath,
      "--output-dir",
      outputDir,
      "--model-path",
      resolvedInputs.modelPath,
      "--event-type",
      "working_at_height",
      "--finding-label",
      "working at height",
    ];
    appendNumberArg(commandArgs, "--confidence-threshold", payload.confidenceThreshold);
    appendNumberArg(commandArgs, "--iou-threshold", payload.iouThreshold);
    appendNumberArg(commandArgs, "--frame-step", payload.frameStep);
    appendNumberArg(commandArgs, "--image-size", payload.imageSize);
    appendNumberArg(commandArgs, "--minimum-presence-seconds", payload.minimumPresenceSeconds);
    (payload.personLabels || []).forEach((label) => commandArgs.push("--person-label", label));

    return createJobEnvelope({
      analysisType: "working_at_height",
      moduleKey: "hse.working-at-height",
      mediaSourceId: resolvedInputs.mediaSourceId,
      videoPath: resolvedInputs.videoPath,
      outputDir,
      commandArgs,
      message: "Job working at height masuk antrean dan menunggu worker.",
      payload,
    });
  };

  const buildRedLightViolationAnalysisJob = (payload) => {
    const resolvedInputs = resolveRedLightAnalysisInputPaths(payload);
    if (!fileExists(redLightViolationScriptPath)) {
      const error = new Error("Red Light Violation script not found.");
      error.statusCode = 500;
      throw error;
    }

    const outputDir = createRunOutputDir();
    const resolvedStopLineConfigPath = payload.stopLinePolygon
      ? path.join(outputDir, "stop-line.generated.json")
      : resolvedInputs.stopLineConfigPath;
    if (payload.stopLinePolygon) {
      fs.writeFileSync(
        resolvedStopLineConfigPath,
        JSON.stringify(
          {
            roi_id: payload.intersectionId || "mine-intersection-main",
            normalized: payload.stopLineNormalized !== false,
            polygon: payload.stopLinePolygon,
          },
          null,
          2
        )
      );
    }

    const commandArgs = [
      redLightViolationScriptPath,
      "--video-path",
      resolvedInputs.videoPath,
      "--roi-config-path",
      resolvedStopLineConfigPath,
      "--output-dir",
      outputDir,
      "--vehicle-model-path",
      resolvedInputs.vehicleModelPath,
      "--traffic-light-model-path",
      resolvedInputs.trafficLightModelPath,
      "--event-type",
      "red_light_violation",
      "--finding-label",
      "red light violation",
    ];
    appendNumberArg(commandArgs, "--confidence-threshold", payload.confidenceThreshold);
    appendNumberArg(commandArgs, "--iou-threshold", payload.iouThreshold);
    appendNumberArg(commandArgs, "--frame-step", payload.frameStep);
    appendNumberArg(commandArgs, "--image-size", payload.imageSize);
    appendNumberArg(commandArgs, "--crossing-window-seconds", payload.crossingWindowSeconds);
    (payload.vehicleLabels || []).forEach((label) => commandArgs.push("--vehicle-label", label));
    (payload.redLightLabels || []).forEach((label) => commandArgs.push("--red-light-label", label));
    (payload.greenLightLabels || []).forEach((label) => commandArgs.push("--green-light-label", label));

    return createJobEnvelope({
      analysisType: "red_light_violation",
      moduleKey: "operations.red-light-violation",
      mediaSourceId: resolvedInputs.mediaSourceId,
      videoPath: resolvedInputs.videoPath,
      outputDir,
      commandArgs,
      message: "Job red light violation masuk antrean dan menunggu worker.",
      payload,
    });
  };

  const buildDumpTruckBedOpenAnalysisJob = (payload) => {
    const resolvedInputs = resolveModuleAnalysisInputPaths({
      payload,
      configKey: "dump-truck-bed-open",
      configPathField: "roiConfigPath",
      configPathLabel: "ROI config path",
    });
    if (!fileExists(dumpTruckBedOpenScriptPath)) {
      const error = new Error("Dump Truck Bed Open script not found.");
      error.statusCode = 500;
      throw error;
    }

    const outputDir = createRunOutputDir();
    const resolvedRoiConfigPath = payload.roiPolygon
      ? path.join(outputDir, "dump-truck-roi.generated.json")
      : resolvedInputs.configPath;
    if (payload.roiPolygon) {
      fs.writeFileSync(
        resolvedRoiConfigPath,
        JSON.stringify(
          {
            roi_id: payload.roiId || "hauling-road-dump-truck",
            normalized: payload.roiNormalized !== false,
            polygon: payload.roiPolygon,
          },
          null,
          2
        )
      );
    }

    const commandArgs = [
      dumpTruckBedOpenScriptPath,
      "--video-path",
      resolvedInputs.videoPath,
      "--roi-config-path",
      resolvedRoiConfigPath,
      "--output-dir",
      outputDir,
      "--model-path",
      resolvedInputs.modelPath,
      "--event-type",
      "dump_truck_bed_open",
      "--finding-label",
      "dump truck bed open",
    ];
    appendNumberArg(commandArgs, "--confidence-threshold", payload.confidenceThreshold);
    appendNumberArg(commandArgs, "--iou-threshold", payload.iouThreshold);
    appendNumberArg(commandArgs, "--frame-step", payload.frameStep);
    appendNumberArg(commandArgs, "--image-size", payload.imageSize);
    appendNumberArg(commandArgs, "--movement-threshold", payload.movementThreshold);
    appendNumberArg(commandArgs, "--minimum-moving-seconds", payload.minimumMovingSeconds);
    (payload.truckLabels || []).forEach((label) => commandArgs.push("--truck-label", label));
    (payload.bedOpenLabels || []).forEach((label) => commandArgs.push("--bed-open-label", label));
    (payload.bedClosedLabels || []).forEach((label) => commandArgs.push("--bed-closed-label", label));

    return createJobEnvelope({
      analysisType: "dump_truck_bed_open",
      moduleKey: "operations.dump-truck-bed-open",
      mediaSourceId: resolvedInputs.mediaSourceId,
      videoPath: resolvedInputs.videoPath,
      outputDir,
      commandArgs,
      message: "Job dump truck bed open masuk antrean dan menunggu worker.",
      payload,
    });
  };

  return {
    buildDumpTruckBedOpenAnalysisJob,
    buildNoHelmetAnalysisJob,
    buildNoLifeVestAnalysisJob,
    buildNoSafetyVestAnalysisJob,
    buildRedLightViolationAnalysisJob,
    buildWorkingAtHeightAnalysisJob,
    resolveModuleAnalysisInputPaths,
    resolvePpeAnalysisInputPaths,
    resolveRedLightAnalysisInputPaths,
  };
};

module.exports = {
  createAnalysisJobBuilders,
};
