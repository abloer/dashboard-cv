const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_CONCURRENCY_LIMIT = 1;
const TERMINAL_STATUSES = new Set(["completed", "failed"]);

const toPositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const toNonNegativeInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

const parseAnalysisJobConcurrencyLimits = (value) => {
  const limits = {};
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const [moduleKey, rawLimit] = item.split(/[=:]/).map((part) => part.trim());
      const limit = Number(rawLimit);
      if (moduleKey && Number.isInteger(limit) && limit > 0) {
        limits[moduleKey] = limit;
      }
    });
  return limits;
};

const timestampMs = (value) => {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const sortQueuedJobs = (jobs) =>
  [...jobs].sort((left, right) => {
    const leftTime = timestampMs(left.nextAttemptAt || left.queuedAt || left.createdAt);
    const rightTime = timestampMs(right.nextAttemptAt || right.queuedAt || right.createdAt);
    if (leftTime !== rightTime) return leftTime - rightTime;
    return String(left.id).localeCompare(String(right.id));
  });

const sanitizeErrorMessage = (error) => String(error?.message || error || "Analysis job failed.").slice(0, 500);

const createDurableAnalysisQueue = ({
  jobRepository,
  executeJob,
  logger = console,
  metrics = {},
  onJobSettled = () => {},
  now = () => new Date(),
  options = {},
}) => {
  if (!jobRepository || typeof jobRepository.list !== "function") {
    throw new Error("jobRepository is required.");
  }
  if (typeof executeJob !== "function") {
    throw new Error("executeJob is required.");
  }

  const defaultMaxRetries = toNonNegativeInteger(options.maxRetries, DEFAULT_MAX_RETRIES);
  const defaultTimeoutMs = toPositiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const defaultConcurrency = toPositiveInteger(options.defaultConcurrency, DEFAULT_CONCURRENCY_LIMIT);
  const concurrencyLimits = {
    ...(options.concurrencyLimits || {}),
    ...parseAnalysisJobConcurrencyLimits(options.concurrencyLimitsEnv),
  };
  const activeJobs = new Map();

  const nowIso = () => now().toISOString();
  const getRetryCount = (job) => toNonNegativeInteger(job?.retryCount, 0);
  const getMaxRetries = (job) => toNonNegativeInteger(job?.maxRetries, defaultMaxRetries);
  const getTimeoutMs = (job) => toPositiveInteger(job?.timeoutMs, defaultTimeoutMs);
  const getModuleLimit = (moduleKey) =>
    toPositiveInteger(concurrencyLimits[moduleKey] ?? concurrencyLimits["*"], defaultConcurrency);
  const getQueuedJobs = () =>
    sortQueuedJobs(
      jobRepository
        .list()
        .filter((job) => job.status === "queued")
        .filter((job) => timestampMs(job.nextAttemptAt) <= now().getTime())
    );
  const setQueueDepth = () => {
    metrics.setQueueDepth?.(jobRepository.list().filter((job) => job.status === "queued").length);
  };
  const activeCountForModule = (moduleKey) =>
    Array.from(activeJobs.values()).filter((job) => job.moduleKey === moduleKey).length;

  const recordRetryFailure = (job, failureType, durationMs = 0) => {
    metrics.recordJobFailed?.({
      moduleKey: job.moduleKey,
      durationMs,
      failureType,
    });
  };

  const requeueOrFailJob = (job, { reasonCode, message, durationMs = 0, recordFailureMetric = true }) => {
    const retryCount = getRetryCount(job);
    const maxRetries = getMaxRetries(job);
    if (recordFailureMetric) {
      recordRetryFailure(job, reasonCode, durationMs);
    }

    if (retryCount < maxRetries) {
      const nextRetryCount = retryCount + 1;
      const committed = jobRepository.update(job.id, {
        status: "queued",
        message: `${message} Retry ${nextRetryCount}/${maxRetries} dijadwalkan.`,
        startedAt: null,
        failedAt: null,
        retryCount: nextRetryCount,
        maxRetries,
        timeoutMs: getTimeoutMs(job),
        nextAttemptAt: nowIso(),
        lastErrorCode: reasonCode,
        lastErrorMessage: message,
      });
      metrics.recordJobQueued?.({ moduleKey: committed.moduleKey });
      logger.warn?.("analysis_job_requeued", {
        jobId: committed.id,
        runId: committed.runId,
        moduleKey: committed.moduleKey,
        retryCount: committed.retryCount,
        maxRetries: committed.maxRetries,
        reasonCode,
      });
      setQueueDepth();
      return committed;
    }

    const committed = jobRepository.update(job.id, {
      status: "failed",
      message,
      failedAt: nowIso(),
      retryCount,
      maxRetries,
      timeoutMs: getTimeoutMs(job),
      lastErrorCode: reasonCode,
      lastErrorMessage: message,
    });
    logger.error?.("analysis_job_exhausted", {
      jobId: committed.id,
      runId: committed.runId,
      moduleKey: committed.moduleKey,
      retryCount: committed.retryCount,
      maxRetries: committed.maxRetries,
      reasonCode,
    });
    setQueueDepth();
    return committed;
  };

  const recoverTimedOutJobs = ({ includeOrphanedRunning = false } = {}) => {
    const currentTime = now().getTime();
    jobRepository
      .list()
      .filter((job) => job.status === "running")
      .forEach((job) => {
        const activeJob = activeJobs.get(job.id);
        const startedAtMs = timestampMs(job.startedAt);
        const timedOut = startedAtMs > 0 && currentTime - startedAtMs > getTimeoutMs(job);
        if (!timedOut && !(includeOrphanedRunning && !activeJob)) {
          return;
        }

        activeJobs.delete(job.id);
        const reasonCode = timedOut ? "timeout" : "restart_recovery";
        const message = timedOut
          ? "Analysis job melewati batas timeout."
          : "Analysis job dipulihkan setelah restart backend.";
        requeueOrFailJob(job, {
          reasonCode,
          message,
          durationMs: startedAtMs > 0 ? Math.max(0, currentTime - startedAtMs) : 0,
        });
      });
  };

  const runJob = (queuedJob) => {
    let runningJob;
    try {
      runningJob = jobRepository.update(
        queuedJob.id,
        (current) => ({
          status: "running",
          message: "Analisis sedang berjalan di background worker.",
          startedAt: nowIso(),
          failedAt: null,
          attemptCount: toNonNegativeInteger(current.attemptCount, 0) + 1,
          maxRetries: getMaxRetries(current),
          timeoutMs: getTimeoutMs(current),
          lastAttemptAt: nowIso(),
        }),
        { expectedVersion: queuedJob.version }
      );
    } catch (error) {
      logger.warn?.("analysis_job_start_conflict", {
        jobId: queuedJob.id,
        moduleKey: queuedJob.moduleKey,
        errorCode: error?.code || error?.name || "JOB_START_CONFLICT",
      });
      return false;
    }

    activeJobs.set(runningJob.id, {
      moduleKey: runningJob.moduleKey,
      startedAt: runningJob.startedAt,
    });

    Promise.resolve()
      .then(() => executeJob(runningJob))
      .catch((error) => {
        const latest = jobRepository.get(runningJob.id);
        if (!latest || TERMINAL_STATUSES.has(latest.status)) return;
        const failed = jobRepository.update(runningJob.id, {
          status: "failed",
          message: sanitizeErrorMessage(error),
          failedAt: nowIso(),
          stderr: error?.stderr || sanitizeErrorMessage(error),
        });
        requeueOrFailJob(failed, {
          reasonCode: "execution_error",
          message: sanitizeErrorMessage(error),
        });
      })
      .finally(() => {
        activeJobs.delete(runningJob.id);
        const latest = jobRepository.get(runningJob.id);
        if (latest?.status === "failed") {
        requeueOrFailJob(latest, {
          reasonCode: latest.lastErrorCode || "execution_error",
          message: latest.message || "Analysis job failed.",
          recordFailureMetric: false,
        });
        }
        onJobSettled(latest);
        setQueueDepth();
        processAvailableJobs();
      });

    return true;
  };

  const processAvailableJobs = () => {
    recoverTimedOutJobs();
    let started = false;
    getQueuedJobs().forEach((job) => {
      if (activeJobs.has(job.id)) return;
      if (activeCountForModule(job.moduleKey) >= getModuleLimit(job.moduleKey)) return;
      started = runJob(job) || started;
    });
    setQueueDepth();
    return started;
  };

  const enqueue = (job) => {
    const queuedAt = nowIso();
    const committed = jobRepository.create({
      ...job,
      status: "queued",
      queuedAt: job.queuedAt || queuedAt,
      attemptCount: toNonNegativeInteger(job.attemptCount, 0),
      retryCount: toNonNegativeInteger(job.retryCount, 0),
      maxRetries: toNonNegativeInteger(job.maxRetries, defaultMaxRetries),
      timeoutMs: toPositiveInteger(job.timeoutMs, defaultTimeoutMs),
      nextAttemptAt: job.nextAttemptAt || queuedAt,
    });
    metrics.recordJobQueued?.({ moduleKey: committed.moduleKey });
    logger.info?.("analysis_job_queued", {
      jobId: committed.id,
      runId: committed.runId,
      moduleKey: committed.moduleKey,
      analysisType: committed.analysisType,
      mediaSourceId: committed.mediaSourceId || undefined,
      queueDepth: jobRepository.list().filter((item) => item.status === "queued").length,
    });
    processAvailableJobs();
    return committed;
  };

  const recover = () => {
    recoverTimedOutJobs({ includeOrphanedRunning: true });
    processAvailableJobs();
  };

  const getQueuePosition = (jobId) => {
    const index = sortQueuedJobs(jobRepository.list().filter((job) => job.status === "queued")).findIndex(
      (job) => job.id === jobId
    );
    return index >= 0 ? index + 1 : 0;
  };

  return {
    enqueue,
    processAvailableJobs,
    recover,
    recoverTimedOutJobs,
    getQueuePosition,
    getActiveJobCount: () => activeJobs.size,
  };
};

module.exports = {
  DEFAULT_CONCURRENCY_LIMIT,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  createDurableAnalysisQueue,
  parseAnalysisJobConcurrencyLimits,
};
