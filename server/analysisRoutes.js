const express = require("express");
const fs = require("fs");
const path = require("path");
const {
  createDurableAnalysisQueue,
  parseAnalysisJobConcurrencyLimits,
} = require("./analysisQueue");
const { createAnalysisJobBuilders } = require("./analysisJobBuilders");
const { createAnalysisJobExecutor } = require("./analysisExecution");
const {
  dumpTruckBedOpenPayloadSchema,
  hseSafetyRulesPayloadSchema,
  noHelmetPayloadSchema,
  noLifeVestPayloadSchema,
  noSafetyVestPayloadSchema,
  redLightViolationPayloadSchema,
  workingAtHeightPayloadSchema,
} = require("./analysisSchemas");

const createAnalysisBoundary = ({
  AnalysisJobConflictError,
  analysisJobRepository,
  analysisOutputRoot,
  analysisScriptPath,
  appendAnalysisHistory,
  buildHseSafetyRulesReport,
  createAnalysisQueue = createDurableAnalysisQueue,
  defaultModelPath,
  defaultRoiConfigPath,
  dumpTruckBedOpenScriptPath,
  enrichSummary,
  env = process.env,
  fileExists,
  getModuleConfig,
  getLatestRunForSource,
  getPpeAnalysisDefinition,
  getSafeErrorLogMetadata,
  logger = console,
  operationalMetrics,
  port,
  readHseSafetyRulesReport,
  readMediaRegistry,
  readModelVersions,
  resolveManagedConfigPath,
  resolveManagedModelPath,
  resolveManagedVideoPath,
  resolveModuleConfigEnvelope,
  runAnalysisCommand,
  uploadRoot,
  workingAtHeightScriptPath,
  redLightViolationScriptPath,
}) => {
  const router = express.Router();
  let analysisQueue = null;

  const {
    buildDumpTruckBedOpenAnalysisJob,
    buildNoHelmetAnalysisJob,
    buildNoLifeVestAnalysisJob,
    buildNoSafetyVestAnalysisJob,
    buildRedLightViolationAnalysisJob,
    buildWorkingAtHeightAnalysisJob,
    resolveModuleAnalysisInputPaths,
    resolvePpeAnalysisInputPaths,
    resolveRedLightAnalysisInputPaths,
  } = createAnalysisJobBuilders({
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
  });

  const { executePpeAnalysisJob } = createAnalysisJobExecutor({
    AnalysisJobConflictError,
    analysisJobRepository,
    appendAnalysisHistory,
    env,
    fileExists,
    getSafeErrorLogMetadata,
    logger,
    operationalMetrics,
    readMediaRegistry,
    runAnalysisCommand,
  });

  const sanitizeAnalysisJobForResponse = (req, job) => {
    if (!job) return null;

    const mediaSource = job.mediaSourceId
      ? readMediaRegistry().find((item) => item.id === job.mediaSourceId) || null
      : null;
    const queuePosition = job.status === "queued" ? analysisQueue?.getQueuePosition(job.id) || 0 : 0;

    return {
      ok: true,
      job: {
        id: job.id,
        status: job.status,
        message: job.message,
        runId: job.runId,
        outputDir: job.outputDir,
        createdAt: job.createdAt,
        startedAt: job.startedAt || null,
        completedAt: job.completedAt || null,
        failedAt: job.failedAt || null,
        attemptCount: Number(job.attemptCount || 0),
        retryCount: Number(job.retryCount || 0),
        maxRetries: Number(job.maxRetries || 0),
        timeoutMs: Number(job.timeoutMs || 0),
        lastAttemptAt: job.lastAttemptAt || null,
        nextAttemptAt: job.nextAttemptAt || null,
        mediaSourceId: job.mediaSourceId || null,
        videoPath: job.videoPath,
        stdout: job.stdout || "",
        stderr: job.stderr || "",
        summary: job.summary
          ? enrichSummary(req, job.summary, {
              analysisType: job.analysisType,
              runId: job.runId,
              outputDir: job.outputDir,
              createdAt: job.completedAt || job.failedAt || job.createdAt,
              sourceId: mediaSource?.id || job.mediaSourceId || "",
              sourceName: mediaSource?.name || "",
              sourceLocation: mediaSource?.location || "",
              sourceType: mediaSource?.type || "upload",
              configSnapshot: job.configSnapshot || {},
            })
          : null,
        queuePosition,
      },
    };
  };

  const pruneAnalysisJobs = () => {
    const terminalStatuses = new Set(["completed", "failed"]);
    const maxRetention = Number(env.MAX_ANALYSIS_JOB_RETENTION || 50);
    const removableJobs = analysisJobRepository.list()
      .filter((job) => terminalStatuses.has(job.status))
      .sort(
        (left, right) =>
          new Date(right.completedAt || right.failedAt || right.createdAt).getTime() -
          new Date(left.completedAt || left.failedAt || left.createdAt).getTime()
      );

    removableJobs.slice(maxRetention).forEach((job) => {
      analysisJobRepository.delete(job.id);
    });
  };

  analysisQueue = createAnalysisQueue({
    jobRepository: analysisJobRepository,
    executeJob: executePpeAnalysisJob,
    logger,
    metrics: operationalMetrics,
    onJobSettled: pruneAnalysisJobs,
    options: {
      maxRetries: Number(env.ANALYSIS_JOB_MAX_RETRIES || 1),
      timeoutMs: Number(env.ANALYSIS_JOB_TIMEOUT_MS || 30 * 60 * 1000),
      defaultConcurrency: Number(env.ANALYSIS_JOB_DEFAULT_CONCURRENCY || 1),
      concurrencyLimits: parseAnalysisJobConcurrencyLimits(env.ANALYSIS_JOB_CONCURRENCY_LIMITS),
    },
  });

  const enqueueAnalysisJob = (job) => analysisQueue.enqueue(job);

  const sendQueuedJobResponse = (res, job) =>
    res.status(202).json({
      ok: true,
      jobId: job.id,
      status: job.status,
      message: job.message,
      runId: job.runId,
      outputDir: job.outputDir,
      createdAt: job.createdAt,
    });

  const sendAnalysisErrorResponse = (res, error) => {
    const statusCode = error?.statusCode || 500;
    const isServerError = statusCode >= 500;
    return res.status(statusCode).json({
      ok: false,
      message: isServerError ? "Analysis failed" : error?.message || "Analysis failed",
      stdout: isServerError ? "" : error?.stdout || "",
      stderr: isServerError ? "" : error?.stderr || "",
    });
  };

  const registerAnalysisModuleRoutes = ({ route, schema, buildJob }) => {
    router.post(route, async (req, res) => {
      try {
        const parsed = schema.safeParse(req.body || {});
        if (!parsed.success) {
          return res.status(400).json({
            ok: false,
            message: "Invalid analysis payload",
            errors: parsed.error.flatten(),
          });
        }

        return sendQueuedJobResponse(res, enqueueAnalysisJob(buildJob(parsed.data)));
      } catch (error) {
        return sendAnalysisErrorResponse(res, error);
      }
    });

    router.get(`${route}/jobs/:id`, (req, res) => {
      const job = analysisJobRepository.get(req.params.id);
      if (!job) {
        return res.status(404).json({ ok: false, message: "Analysis job not found." });
      }
      return res.json(sanitizeAnalysisJobForResponse(req, job));
    });
  };

  const sendDefaults = (res, moduleKey, payload) => {
    const resolved = resolveModuleConfigEnvelope(moduleKey);
    return res.json(payload(resolved));
  };

  const basicDefaultsPayload = (resolved) => ({
    ok: true,
    defaultModelPath: resolved?.ok ? resolved.resolvedModelPath : defaultModelPath,
    defaultRoiConfigPath,
    analysisOutputRoot,
    serverPort: Number(port),
    uploadRoot,
    activeModel: resolved?.ok ? resolved.activeModel : null,
    modelSource: resolved?.ok && resolved.usesDeploymentGate ? "deployment-gate" : "manual",
  });

  router.get("/analysis/no-helmet/defaults", (_req, res) =>
    sendDefaults(res, "no-helmet", basicDefaultsPayload)
  );
  router.get("/analysis/no-safety-vest/defaults", (_req, res) =>
    sendDefaults(res, "no-safety-vest", basicDefaultsPayload)
  );
  router.get("/analysis/no-life-vest/defaults", (_req, res) =>
    sendDefaults(res, "no-life-vest", basicDefaultsPayload)
  );

  router.get("/analysis/working-at-height/defaults", (_req, res) =>
    sendDefaults(res, "working-at-height", (resolved) => ({
      ok: true,
      defaultModelPath: resolved?.ok ? resolved.resolvedModelPath : defaultModelPath,
      defaultZoneConfigPath: defaultRoiConfigPath,
      analysisOutputRoot,
      serverPort: Number(port),
      uploadRoot,
      activeModel: resolved?.ok ? resolved.activeModel : null,
      modelSource: resolved?.ok && resolved.usesDeploymentGate ? "deployment-gate" : "manual",
    }))
  );

  router.get("/analysis/red-light-violation/defaults", (_req, res) =>
    sendDefaults(res, "red-light-violation", (resolved) => ({
      ok: true,
      defaultVehicleModelPath: resolved?.ok ? resolved.config.vehicleModelPath : defaultModelPath,
      defaultTrafficLightModelPath: resolved?.ok ? resolved.config.trafficLightModelPath : defaultModelPath,
      defaultStopLineConfigPath: defaultRoiConfigPath,
      analysisOutputRoot,
      serverPort: Number(port),
      uploadRoot,
      activeModel: resolved?.ok ? resolved.activeModel : null,
      modelSource: resolved?.ok && resolved.usesDeploymentGate ? "deployment-gate" : "manual",
    }))
  );

  router.get("/analysis/dump-truck-bed-open/defaults", (_req, res) =>
    sendDefaults(res, "dump-truck-bed-open", basicDefaultsPayload)
  );

  router.get("/analysis/hse-safety-rules/defaults", (_req, res) => {
    const resolved = resolveModuleConfigEnvelope("safety-rules");
    return res.json({
      ok: true,
      moduleKey: "safety-rules",
      analysisOutputRoot,
      config: resolved?.ok ? resolved.config : getModuleConfig("safety-rules"),
      activeModel: resolved?.ok ? resolved.activeModel : null,
      modelSource: resolved?.ok && resolved.usesDeploymentGate ? "deployment-gate" : "manual",
    });
  });

  router.get("/analysis/hse-safety-rules/source/:id/latest", (req, res) => {
    const source = readMediaRegistry().find((item) => item.id === req.params.id);
    if (!source) {
      return res.status(404).json({ ok: false, message: "Media source not found." });
    }

    const latestRun = getLatestRunForSource("hse_safety_rules", source);
    const report = latestRun ? readHseSafetyRulesReport(latestRun.outputDir) : null;

    return res.json({
      ok: true,
      source: {
        id: source.id,
        name: source.name,
        location: source.location,
        type: source.type,
        status: source.status,
        analytics: source.analytics,
        executionMode: source.executionMode,
        monitoringStatus: source.monitoringStatus,
        monitoringIntervalSeconds: source.monitoringIntervalSeconds,
      },
      latestReport: report,
    });
  });

  router.post("/analysis/hse-safety-rules", (req, res) => {
    const parsed = hseSafetyRulesPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid HSE Safety Rules payload",
        errors: parsed.error.flatten(),
      });
    }

    const source = readMediaRegistry().find((item) => item.id === parsed.data.mediaSourceId);
    if (!source) {
      return res.status(404).json({ ok: false, message: "Media source not found." });
    }

    const config = getModuleConfig("safety-rules");
    if (!config) {
      return res.status(500).json({ ok: false, message: "HSE Safety Rules config is unavailable." });
    }

    const runId = `hse-run-${Date.now()}`;
    const outputDir = path.join(analysisOutputRoot, runId);
    const createdAt = new Date().toISOString();
    fs.mkdirSync(outputDir, { recursive: true });

    const report = buildHseSafetyRulesReport(req, source, config, {
      runId,
      outputDir,
      createdAt,
    });
    const reportPayload = {
      id: runId,
      analysisType: "hse_safety_rules",
      outputDir,
      createdAt,
      ...report,
    };
    fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(reportPayload, null, 2));

    appendAnalysisHistory({
      id: runId,
      analysisType: "hse_safety_rules",
      mediaSourceId: source.id,
      sourceName: source.name,
      location: source.location || null,
      videoPath: source.source,
      outputDir,
      eventCount: reportPayload.summary.openFindingCount,
      violatorCount: reportPayload.summary.highSeverityCount,
      stableDetectedTrackCount: reportPayload.readiness.readyCount,
      rawDetectedTrackCount: reportPayload.readiness.totalCount,
      createdAt: reportPayload.createdAt,
    });

    return res.json({
      ok: true,
      report: reportPayload,
    });
  });

  registerAnalysisModuleRoutes({
    route: "/analysis/no-helmet",
    schema: noHelmetPayloadSchema,
    buildJob: buildNoHelmetAnalysisJob,
  });
  registerAnalysisModuleRoutes({
    route: "/analysis/no-safety-vest",
    schema: noSafetyVestPayloadSchema,
    buildJob: buildNoSafetyVestAnalysisJob,
  });
  registerAnalysisModuleRoutes({
    route: "/analysis/no-life-vest",
    schema: noLifeVestPayloadSchema,
    buildJob: buildNoLifeVestAnalysisJob,
  });
  registerAnalysisModuleRoutes({
    route: "/analysis/working-at-height",
    schema: workingAtHeightPayloadSchema,
    buildJob: buildWorkingAtHeightAnalysisJob,
  });
  registerAnalysisModuleRoutes({
    route: "/analysis/red-light-violation",
    schema: redLightViolationPayloadSchema,
    buildJob: buildRedLightViolationAnalysisJob,
  });
  registerAnalysisModuleRoutes({
    route: "/analysis/dump-truck-bed-open",
    schema: dumpTruckBedOpenPayloadSchema,
    buildJob: buildDumpTruckBedOpenAnalysisJob,
  });

  return {
    analysisQueue,
    buildDumpTruckBedOpenAnalysisJob,
    buildNoHelmetAnalysisJob,
    buildNoLifeVestAnalysisJob,
    buildNoSafetyVestAnalysisJob,
    buildRedLightViolationAnalysisJob,
    buildWorkingAtHeightAnalysisJob,
    enqueueAnalysisJob,
    executePpeAnalysisJob,
    resolveModuleAnalysisInputPaths,
    resolvePpeAnalysisInputPaths,
    resolveRedLightAnalysisInputPaths,
    router,
    sanitizeAnalysisJobForResponse,
  };
};

module.exports = {
  createAnalysisBoundary,
};
