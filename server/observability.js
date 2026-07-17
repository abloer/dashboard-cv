const { randomUUID } = require("crypto");
const express = require("express");
const fs = require("fs");
const path = require("path");

const REQUEST_ID_HEADER = "x-request-id";
const LOG_LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};
const currentLogLevel = LOG_LEVELS[String(process.env.LOG_LEVEL || "info").toLowerCase()] || LOG_LEVELS.info;
const latencyBucketsMs = [50, 100, 250, 500, 1000, 2500, 5000, 10000];

function repoRootForLogEscape(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const sanitizeLogMessage = (message) =>
  String(message || "")
    .replace(new RegExp(repoRootForLogEscape(process.cwd()), "g"), "[cwd]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/cv_session=[^;\s]+/gi, "cv_session=[redacted]");

const createStructuredLogger = ({ sink = console, now = () => new Date().toISOString() } = {}) => {
  const write = (level, event, fields = {}) => {
    if ((LOG_LEVELS[level] || LOG_LEVELS.info) < currentLogLevel) {
      return;
    }
    const payload = {
      ts: now(),
      level,
      event,
      ...fields,
    };
    if (payload.message) {
      payload.message = sanitizeLogMessage(payload.message);
    }
    sink.log(JSON.stringify(payload));
  };

  return {
    debug(event, fields) {
      write("debug", event, fields);
    },
    info(event, fields) {
      write("info", event, fields);
    },
    warn(event, fields) {
      write("warn", event, fields);
    },
    error(event, fields) {
      write("error", event, fields);
    },
  };
};

const getSafeAuthLogMetadata = (auth) => {
  if (!auth?.role) {
    return {};
  }
  return {
    role: auth.role,
    authSubjectType: auth.subject === "static-token" ? "static-token" : "authenticated",
  };
};

const getSafeErrorLogMetadata = (error) => ({
  code: error?.code || undefined,
  statusCode: error?.statusCode || undefined,
  message: sanitizeLogMessage(error?.message || "Unexpected error"),
});

const isSafeRequestId = (value) => /^[A-Za-z0-9._:-]{1,128}$/.test(String(value || ""));

const getRequestPathWithQueryRemoved = (req) => String(req.originalUrl || req.url || "").split("?")[0];

const normalizeMetricPath = (requestPath) => {
  const pathOnly = String(requestPath || "/").split("?")[0];
  const replacements = [
    [/^\/media-sources\/[^/]+\/status$/, "/media-sources/{id}/status"],
    [/^\/media-sources\/[^/]+\/monitoring$/, "/media-sources/{id}/monitoring"],
    [/^\/media-sources\/[^/]+$/, "/media-sources/{id}"],
    [/^\/module-configs\/[^/]+$/, "/module-configs/{moduleKey}"],
    [/^\/models\/datasets\/[^/]+$/, "/models/datasets/{id}"],
    [/^\/models\/training-jobs\/[^/]+$/, "/models/training-jobs/{id}"],
    [/^\/models\/versions\/[^/]+$/, "/models/versions/{id}"],
    [/^\/models\/evaluations\/[^/]+$/, "/models/evaluations/{id}"],
    [/^\/models\/benchmarks\/[^/]+$/, "/models/benchmarks/{id}"],
    [/^\/analysis\/[^/]+\/jobs\/[^/]+$/, "/analysis/{moduleKey}/jobs/{id}"],
    [/^\/analysis-output\/.+$/, "/analysis-output/{artifactPath}"],
  ];
  const matched = replacements.find(([pattern]) => pattern.test(pathOnly));
  return matched ? matched[1] : pathOnly;
};

const createOperationalMetrics = () => {
  const state = {
    apiRequests: new Map(),
    apiLatency: new Map(),
    analysisJobs: new Map(),
    jobDuration: new Map(),
    ffmpegPythonFailures: new Map(),
    uploadBytesTotal: 0,
    uploadCount: 0,
    queueDepth: 0,
    runningJobs: 0,
  };

  const incrementMap = (map, key, amount = 1) => {
    map.set(key, (map.get(key) || 0) + amount);
  };

  const ensureLatency = (key) => {
    if (!state.apiLatency.has(key)) {
      state.apiLatency.set(key, {
        count: 0,
        sumMs: 0,
        buckets: new Map(latencyBucketsMs.map((bucket) => [bucket, 0])),
      });
    }
    return state.apiLatency.get(key);
  };

  const ensureJobDuration = (key) => {
    if (!state.jobDuration.has(key)) {
      state.jobDuration.set(key, { count: 0, sumMs: 0 });
    }
    return state.jobDuration.get(key);
  };

  return {
    state,
    recordRequest({ method, path: requestPath, status, durationMs }) {
      const normalizedPath = normalizeMetricPath(requestPath);
      const key = `${method}|${normalizedPath}|${status}`;
      incrementMap(state.apiRequests, key);
      const latency = ensureLatency(`${method}|${normalizedPath}`);
      latency.count += 1;
      latency.sumMs += durationMs;
      for (const bucket of latencyBucketsMs) {
        if (durationMs <= bucket) {
          latency.buckets.set(bucket, latency.buckets.get(bucket) + 1);
        }
      }
    },
    recordJobQueued({ moduleKey }) {
      incrementMap(state.analysisJobs, `${moduleKey || "unknown"}|queued`);
    },
    recordJobStarted({ moduleKey }) {
      state.runningJobs += 1;
      incrementMap(state.analysisJobs, `${moduleKey || "unknown"}|running`);
    },
    recordJobCompleted({ moduleKey, durationMs }) {
      state.runningJobs = Math.max(0, state.runningJobs - 1);
      incrementMap(state.analysisJobs, `${moduleKey || "unknown"}|completed`);
      const duration = ensureJobDuration(`${moduleKey || "unknown"}|completed`);
      duration.count += 1;
      duration.sumMs += durationMs;
    },
    recordJobFailed({ moduleKey, durationMs, failureType = "python" }) {
      state.runningJobs = Math.max(0, state.runningJobs - 1);
      incrementMap(state.analysisJobs, `${moduleKey || "unknown"}|failed`);
      incrementMap(state.ffmpegPythonFailures, `${moduleKey || "unknown"}|${failureType}`);
      const duration = ensureJobDuration(`${moduleKey || "unknown"}|failed`);
      duration.count += 1;
      duration.sumMs += durationMs;
    },
    recordUpload(sizeBytes) {
      state.uploadCount += 1;
      state.uploadBytesTotal += Number(sizeBytes || 0);
    },
    setQueueDepth(depth) {
      state.queueDepth = Math.max(0, Number(depth || 0));
    },
  };
};

const escapeMetricLabel = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const metricLine = (name, labels, value) => {
  const labelEntries = Object.entries(labels || {}).filter(([, labelValue]) => labelValue !== undefined);
  const serializedLabels =
    labelEntries.length > 0
      ? `{${labelEntries.map(([key, labelValue]) => `${key}="${escapeMetricLabel(labelValue)}"`).join(",")}}`
      : "";
  return `${name}${serializedLabels} ${Number(value || 0)}`;
};

const getDirectorySizeBytes = (targetPath, maxEntries = 5000) => {
  let total = 0;
  let seen = 0;
  const walk = (currentPath) => {
    if (seen >= maxEntries) {
      return;
    }
    let stat;
    try {
      stat = fs.statSync(currentPath);
    } catch (_error) {
      return;
    }
    seen += 1;
    if (stat.isFile()) {
      total += stat.size;
      return;
    }
    if (!stat.isDirectory()) {
      return;
    }
    let entries = [];
    try {
      entries = fs.readdirSync(currentPath);
    } catch (_error) {
      return;
    }
    entries.forEach((entry) => walk(path.join(currentPath, entry)));
  };
  walk(targetPath);
  return total;
};

const renderPrometheusMetrics = ({ metrics, diskUsageBytes = 0 }) => {
  const lines = [
    "# HELP dashboard_api_requests_total Total API requests by method, normalized path, and status.",
    "# TYPE dashboard_api_requests_total counter",
  ];
  for (const [key, value] of metrics.state.apiRequests.entries()) {
    const [method, pathLabel, status] = key.split("|");
    lines.push(metricLine("dashboard_api_requests_total", { method, path: pathLabel, status }, value));
  }

  lines.push(
    "# HELP dashboard_api_request_duration_ms API request duration in milliseconds.",
    "# TYPE dashboard_api_request_duration_ms histogram"
  );
  for (const [key, latency] of metrics.state.apiLatency.entries()) {
    const [method, pathLabel] = key.split("|");
    for (const [bucket, value] of latency.buckets.entries()) {
      lines.push(metricLine("dashboard_api_request_duration_ms_bucket", { method, path: pathLabel, le: bucket }, value));
    }
    lines.push(metricLine("dashboard_api_request_duration_ms_bucket", { method, path: pathLabel, le: "+Inf" }, latency.count));
    lines.push(metricLine("dashboard_api_request_duration_ms_sum", { method, path: pathLabel }, latency.sumMs.toFixed(2)));
    lines.push(metricLine("dashboard_api_request_duration_ms_count", { method, path: pathLabel }, latency.count));
  }

  lines.push(
    "# HELP dashboard_analysis_jobs_total Analysis jobs by module and status.",
    "# TYPE dashboard_analysis_jobs_total counter"
  );
  for (const [key, value] of metrics.state.analysisJobs.entries()) {
    const [moduleKey, status] = key.split("|");
    lines.push(metricLine("dashboard_analysis_jobs_total", { moduleKey, status }, value));
  }

  lines.push(
    "# HELP dashboard_analysis_queue_depth Current in-memory analysis queue depth.",
    "# TYPE dashboard_analysis_queue_depth gauge",
    metricLine("dashboard_analysis_queue_depth", {}, metrics.state.queueDepth),
    "# HELP dashboard_analysis_running_jobs Current running analysis jobs.",
    "# TYPE dashboard_analysis_running_jobs gauge",
    metricLine("dashboard_analysis_running_jobs", {}, metrics.state.runningJobs),
    "# HELP dashboard_analysis_job_duration_ms Analysis job duration in milliseconds.",
    "# TYPE dashboard_analysis_job_duration_ms summary"
  );
  for (const [key, duration] of metrics.state.jobDuration.entries()) {
    const [moduleKey, status] = key.split("|");
    lines.push(metricLine("dashboard_analysis_job_duration_ms_sum", { moduleKey, status }, duration.sumMs.toFixed(2)));
    lines.push(metricLine("dashboard_analysis_job_duration_ms_count", { moduleKey, status }, duration.count));
  }

  lines.push(
    "# HELP dashboard_analysis_ffmpeg_python_failures_total ffmpeg/Python analysis failures by module and failure type.",
    "# TYPE dashboard_analysis_ffmpeg_python_failures_total counter"
  );
  for (const [key, value] of metrics.state.ffmpegPythonFailures.entries()) {
    const [moduleKey, failureType] = key.split("|");
    lines.push(metricLine("dashboard_analysis_ffmpeg_python_failures_total", { moduleKey, failureType }, value));
  }

  lines.push(
    "# HELP dashboard_upload_bytes_total Total uploaded video bytes accepted by backend.",
    "# TYPE dashboard_upload_bytes_total counter",
    metricLine("dashboard_upload_bytes_total", {}, metrics.state.uploadBytesTotal),
    "# HELP dashboard_upload_count_total Total uploaded videos accepted by backend.",
    "# TYPE dashboard_upload_count_total counter",
    metricLine("dashboard_upload_count_total", {}, metrics.state.uploadCount),
    "# HELP dashboard_runtime_analysis_disk_usage_bytes Current runtime analysis disk usage in bytes.",
    "# TYPE dashboard_runtime_analysis_disk_usage_bytes gauge",
    metricLine("dashboard_runtime_analysis_disk_usage_bytes", {}, diskUsageBytes)
  );

  return `${lines.join("\n")}\n`;
};

const createRequestContextMiddleware = (
  requestLogger = console,
  { metrics = null, getSafeAuthLogMetadata = () => ({}) } = {}
) => (req, res, next) => {
  const requestIdHeader = req.header(REQUEST_ID_HEADER);
  const requestId = isSafeRequestId(requestIdHeader) ? requestIdHeader : randomUUID();
  const startedAt = process.hrtime.bigint();
  req.requestId = requestId;
  req.log = requestLogger;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  const requestPath = getRequestPathWithQueryRemoved(req);
  requestLogger.info("request_start", {
    requestId,
    method: req.method,
    path: requestPath,
  });

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    requestLogger.info("request_end", {
      requestId,
      method: req.method,
      path: requestPath,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      ...getSafeAuthLogMetadata(req.auth),
    });
    if (metrics) {
      metrics.recordRequest({
        method: req.method,
        path: requestPath,
        status: res.statusCode,
        durationMs,
      });
    }
  });

  return next();
};

const createRateLimiter = ({ windowMs, max }) => {
  const buckets = new Map();
  return {
    consume(key, now = Date.now()) {
      const current = buckets.get(key);
      if (!current || now >= current.resetAt) {
        const resetAt = now + windowMs;
        buckets.set(key, { count: 1, resetAt });
        return { allowed: true, remaining: Math.max(0, max - 1), resetAt };
      }

      if (current.count >= max) {
        return { allowed: false, remaining: 0, resetAt: current.resetAt };
      }

      current.count += 1;
      return { allowed: true, remaining: Math.max(0, max - current.count), resetAt: current.resetAt };
    },
    reset() {
      buckets.clear();
    },
  };
};

const createSensitiveRateLimitMiddleware = ({
  authSessionRateLimiter,
  sourcePreviewRateLimiter,
  getRequestClientKey,
}) => (req, res, next) => {
  const pathOnly = getRequestPathWithQueryRemoved(req);
  const method = String(req.method || "GET").toUpperCase();
  let limiter = null;
  let scope = null;

  if (method === "POST" && pathOnly === "/auth/session") {
    limiter = authSessionRateLimiter;
    scope = "auth-session";
  } else if (
    (method === "POST" && pathOnly === "/analysis/source-preview") ||
    ((method === "POST" || method === "PUT") && pathOnly.startsWith("/media-sources"))
  ) {
    limiter = sourcePreviewRateLimiter;
    scope = "source-validation";
  }

  if (!limiter) {
    return next();
  }

  const result = limiter.consume(`${scope}:${getRequestClientKey(req)}`);
  if (!result.allowed) {
    res.setHeader("Retry-After", String(Math.ceil((result.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ ok: false, message: "Too many requests." });
  }
  return next();
};

const createObservabilityRouter = ({
  metrics,
  analysisOutputRoot,
  health,
  getDirectorySize = getDirectorySizeBytes,
}) => {
  const router = express.Router();

  router.get("/metrics", (_req, res) => {
    const diskUsageBytes = getDirectorySize(analysisOutputRoot);
    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return res.send(renderPrometheusMetrics({ metrics, diskUsageBytes }));
  });

  router.get("/health", (_req, res) => {
    res.json({
      ok: true,
      supabaseEnabled: Boolean(health.supabaseEnabled),
      analysisScriptPath: health.analysisScriptPath,
      analysisScriptReady: health.fileExists(health.analysisScriptPath),
      analysisPythonCommand: health.analysisPythonCommand,
      defaultRoiConfigPath: health.defaultRoiConfigPath,
      analysisOutputRoot: health.analysisOutputRoot,
    });
  });

  return router;
};

module.exports = {
  REQUEST_ID_HEADER,
  createOperationalMetrics,
  createObservabilityRouter,
  createRateLimiter,
  createRequestContextMiddleware,
  createSensitiveRateLimitMiddleware,
  createStructuredLogger,
  getDirectorySizeBytes,
  getRequestPathWithQueryRemoved,
  getSafeAuthLogMetadata,
  getSafeErrorLogMetadata,
  renderPrometheusMetrics,
};
