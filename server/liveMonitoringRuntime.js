const path = require("path");

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_CONTINUOUS_INTERVAL_SECONDS = 30;
const DEFAULT_CLIP_DURATION_SECONDS = 4;

const sanitizeMonitoringErrorMessage = (error) => {
  const code = error?.code || error?.name || "";
  if (code) {
    return `Monitoring analysis failed (${code}).`;
  }
  return "Monitoring analysis failed.";
};

const createLiveMonitoringRuntime = ({
  analysisJobRepository,
  buildNoHelmetAnalysisJob,
  buildMonitoringClipPath,
  clipDurationSeconds = DEFAULT_CLIP_DURATION_SECONDS,
  continuousIntervalSeconds = DEFAULT_CONTINUOUS_INTERVAL_SECONDS,
  enqueueAnalysisJob,
  ensureAnalysisDirectories,
  getModuleConfig,
  getSafeErrorLogMetadata,
  logger = console,
  now = () => new Date(),
  operationalMetrics,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  readMediaRegistry,
  requireBinary,
  runCommand,
  splitCommaSeparated,
  validateSourcePreviewInput,
}) => {
  const monitoringRuntime = new Map();
  let monitoringInterval = null;

  const getMonitoringIntervalSeconds = (source) =>
    source.executionMode === "scheduled"
      ? Number(source.monitoringIntervalSeconds || 15)
      : continuousIntervalSeconds;

  const hasPendingMonitoringJob = (sourceId) =>
    analysisJobRepository.list().some(
      (job) =>
        job.mediaSourceId === sourceId && (job.status === "queued" || job.status === "running")
    );

  const captureMonitoringClip = async (source, outputPath) => {
    await requireBinary("ffmpeg");
    const validatedSource = await validateSourcePreviewInput(source.source);
    const normalizedSource = validatedSource.trim().toLowerCase();
    const ffmpegArgs = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-rw_timeout",
      "10000000",
    ];

    if (normalizedSource.startsWith("rtsp://")) {
      ffmpegArgs.push("-rtsp_transport", "tcp");
    }

    ffmpegArgs.push(
      "-i",
      validatedSource,
      "-t",
      String(clipDurationSeconds),
      "-an",
      "-vf",
      "fps=5",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-y",
      outputPath
    );

    await runCommand("ffmpeg", ffmpegArgs, { timeout: 30000 });
  };

  const enqueueLiveMonitoringAnalysis = async (source) => {
    ensureAnalysisDirectories();
    const config = getModuleConfig("no-helmet");
    if (!config) {
      throw new Error("No Helmet config is unavailable.");
    }

    const clipPath = buildMonitoringClipPath(source);
    await captureMonitoringClip(source, clipPath);

    const payload = {
      mediaSourceId: source.id,
      videoPath: clipPath,
      modelPath: config.modelPath,
      roiConfigPath: config.roiConfigPath || undefined,
      roiId: config.roiId || undefined,
      confidenceThreshold: Number(config.confidenceThreshold),
      iouThreshold: Number(config.iouThreshold),
      topRatio: Number(config.topRatio),
      helmetOverlapThreshold: Number(config.helmetOverlapThreshold),
      violationOnFrames: Number(config.violationOnFrames),
      cleanOffFrames: Number(config.cleanOffFrames),
      frameStep: Number(config.frameStep),
      imageSize: Number(config.imageSize),
      personLabels: splitCommaSeparated(config.personLabels),
      helmetLabels: splitCommaSeparated(config.helmetLabels),
      violationLabels: splitCommaSeparated(config.violationLabels),
    };

    const job = enqueueAnalysisJob(buildNoHelmetAnalysisJob(payload));
    const runtimeState = monitoringRuntime.get(source.id) || {};
    monitoringRuntime.set(source.id, {
      ...runtimeState,
      lastQueuedAt: now().toISOString(),
      lastJobId: job.id,
      status: "queued",
      error: null,
    });
    return job;
  };

  const refreshMonitoringRuntime = () => {
    const sources = readMediaRegistry().filter(
      (item) =>
        item.type === "camera" &&
        item.status === "active" &&
        item.monitoringStatus === "running" &&
        item.analytics.includes("PPE")
    );

    const currentTimeMs = now().getTime();
    const eligibleSourceIds = new Set(sources.map((item) => item.id));

    for (const [sourceId] of monitoringRuntime.entries()) {
      if (!eligibleSourceIds.has(sourceId)) {
        monitoringRuntime.delete(sourceId);
      }
    }

    sources.forEach((source) => {
      const intervalSeconds = getMonitoringIntervalSeconds(source);
      const state = monitoringRuntime.get(source.id) || {};
      const lastQueuedAt = state.lastQueuedAt ? new Date(state.lastQueuedAt).getTime() : 0;
      const elapsedMs = currentTimeMs - lastQueuedAt;
      const due = !lastQueuedAt || elapsedMs >= intervalSeconds * 1000;

      if (!due || hasPendingMonitoringJob(source.id)) {
        return;
      }

      enqueueLiveMonitoringAnalysis(source).catch((error) => {
        monitoringRuntime.set(source.id, {
          ...state,
          lastQueuedAt: now().toISOString(),
          status: "failed",
          error: sanitizeMonitoringErrorMessage(error),
        });
        operationalMetrics.recordJobFailed({
          moduleKey: "ppe.no-helmet",
          durationMs: 0,
          failureType: "ffmpeg",
        });
        logger.error("live_monitoring_enqueue_failed", {
          mediaSourceId: source.id,
          sourceType: source.type,
          error: getSafeErrorLogMetadata(error),
        });
      });
    });

    for (const [sourceId, state] of monitoringRuntime.entries()) {
      if (!state.lastJobId) {
        continue;
      }
      const job = analysisJobRepository.get(state.lastJobId);
      if (!job) {
        continue;
      }
      monitoringRuntime.set(sourceId, {
        ...state,
        status: job.status,
        error: job.status === "failed" ? job.message || job.stderr || "Analysis failed" : null,
        lastCompletedAt: job.completedAt || state.lastCompletedAt || null,
      });
    }
  };

  const start = () => {
    refreshMonitoringRuntime();
    monitoringInterval = setInterval(refreshMonitoringRuntime, pollIntervalMs);
    return monitoringInterval;
  };

  const stop = () => {
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
    }
  };

  const getRuntimeState = (sourceId) => monitoringRuntime.get(sourceId) || null;

  return {
    captureMonitoringClip,
    enqueueLiveMonitoringAnalysis,
    getMonitoringIntervalSeconds,
    getRuntimeState,
    hasPendingMonitoringJob,
    refresh: refreshMonitoringRuntime,
    start,
    stop,
  };
};

module.exports = {
  DEFAULT_CLIP_DURATION_SECONDS,
  DEFAULT_CONTINUOUS_INTERVAL_SECONDS,
  DEFAULT_POLL_INTERVAL_MS,
  createLiveMonitoringRuntime,
  sanitizeMonitoringErrorMessage,
};
