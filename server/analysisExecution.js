const fs = require("fs");
const path = require("path");

const createAnalysisJobExecutor = ({
  AnalysisJobConflictError,
  analysisJobRepository,
  appendAnalysisHistory,
  env = process.env,
  fileExists,
  getSafeErrorLogMetadata,
  logger = console,
  operationalMetrics,
  readMediaRegistry,
  runAnalysisCommand,
}) => {
  const executePpeAnalysisJob = async (job) => {
    const startedAtNs = process.hrtime.bigint();
    let currentJob =
      job.status === "running"
        ? job
        : analysisJobRepository.update(job.id, {
            status: "running",
            message: "Analisis sedang berjalan di background worker.",
            startedAt: new Date().toISOString(),
          }) || job;
    operationalMetrics.recordJobStarted({ moduleKey: currentJob.moduleKey });
    logger.info("analysis_job_started", {
      jobId: currentJob.id,
      runId: currentJob.runId,
      moduleKey: currentJob.moduleKey,
      analysisType: currentJob.analysisType,
      mediaSourceId: currentJob.mediaSourceId || undefined,
    });

    try {
      const { stdout, stderr } = await runAnalysisCommand(currentJob.commandArgs, {
        timeout: Number(currentJob.timeoutMs || env.ANALYSIS_JOB_TIMEOUT_MS || 30 * 60 * 1000),
      });
      const summaryPath = path.join(currentJob.outputDir, "summary.json");
      if (!fileExists(summaryPath)) {
        const error = new Error("Analysis finished without summary.json output.");
        error.stdout = stdout;
        error.stderr = stderr;
        throw error;
      }

      const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
      const mediaRegistry = readMediaRegistry();
      const mediaSource =
        mediaRegistry.find((item) => item.id === currentJob.mediaSourceId) ||
        mediaRegistry.find((item) => item.source === currentJob.videoPath) ||
        null;

      appendAnalysisHistory({
        id: currentJob.runId,
        analysisType: currentJob.analysisType,
        mediaSourceId: mediaSource?.id || null,
        sourceName: mediaSource?.name || path.basename(currentJob.videoPath),
        location: mediaSource?.location || null,
        videoPath: currentJob.videoPath,
        outputDir: currentJob.outputDir,
        eventCount: Number(summary.event_count || 0),
        violatorCount: Number(summary.global_summary?.violator_count || 0),
        stableDetectedTrackCount: Number(summary.global_summary?.stable_detected_track_count || 0),
        rawDetectedTrackCount: Number(summary.global_summary?.detected_track_count || 0),
        createdAt: new Date().toISOString(),
      });

      currentJob =
        analysisJobRepository.update(
          currentJob.id,
          {
            status: "completed",
            message: `Analisis selesai dengan ${Number(summary.event_count || 0)} event.`,
            completedAt: new Date().toISOString(),
            stdout: stdout || "",
            stderr: stderr || "",
            summary,
          },
          { expectedVersion: currentJob.version }
        ) || currentJob;
      const durationMs = Number(process.hrtime.bigint() - startedAtNs) / 1_000_000;
      operationalMetrics.recordJobCompleted({
        moduleKey: currentJob.moduleKey,
        durationMs,
      });
      logger.info("analysis_job_completed", {
        jobId: currentJob.id,
        runId: currentJob.runId,
        moduleKey: currentJob.moduleKey,
        analysisType: currentJob.analysisType,
        status: currentJob.status,
        durationMs: Number(durationMs.toFixed(2)),
        eventCount: Number(summary.event_count || 0),
      });
    } catch (error) {
      if (error instanceof AnalysisJobConflictError) {
        logger.warn("analysis_job_terminal_update_skipped", {
          jobId: currentJob.id,
          runId: currentJob.runId,
          moduleKey: currentJob.moduleKey,
          analysisType: currentJob.analysisType,
          errorCode: error.code,
        });
        return;
      }

      try {
        analysisJobRepository.update(
          currentJob.id,
          {
            status: "failed",
            message: error?.message || "Analysis failed",
            failedAt: new Date().toISOString(),
            stdout: error?.stdout || "",
            stderr: error?.stderr || error?.message || "",
            lastErrorCode: error?.code || "python",
            lastErrorMessage: error?.message || "Analysis failed",
          },
          { expectedVersion: currentJob.version }
        );
      } catch (updateError) {
        if (updateError instanceof AnalysisJobConflictError) {
          logger.warn("analysis_job_terminal_update_skipped", {
            jobId: currentJob.id,
            runId: currentJob.runId,
            moduleKey: currentJob.moduleKey,
            analysisType: currentJob.analysisType,
            errorCode: updateError.code,
          });
          return;
        }
        throw updateError;
      }
      const durationMs = Number(process.hrtime.bigint() - startedAtNs) / 1_000_000;
      operationalMetrics.recordJobFailed({
        moduleKey: currentJob.moduleKey,
        durationMs,
        failureType: "python",
      });
      logger.error("analysis_job_failed", {
        jobId: currentJob.id,
        runId: currentJob.runId,
        moduleKey: currentJob.moduleKey,
        analysisType: currentJob.analysisType,
        status: "failed",
        durationMs: Number(durationMs.toFixed(2)),
        error: getSafeErrorLogMetadata(error),
      });
    }
  };

  return {
    executePpeAnalysisJob,
  };
};

module.exports = {
  createAnalysisJobExecutor,
};
