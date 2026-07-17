const express = require("express");
const path = require("path");

const PPE_ANALYSIS_TYPES = new Set(["no_helmet", "no_safety_vest", "no_life_vest"]);
const LIVE_ALERT_WINDOW_MS = 5 * 60 * 1000;

const getRunsForSource = (runs, mediaSource) =>
  runs.filter(
    (run) => run.mediaSourceId === mediaSource.id || run.videoPath === mediaSource.source
  );

const getLatestDetectionRun = (runs) =>
  runs.find((run) => Number(run.eventCount || 0) > 0) || null;

const isRecentAlert = (createdAt, now = Date.now()) => {
  if (!createdAt) {
    return false;
  }

  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return now - timestamp <= LIVE_ALERT_WINDOW_MS;
};

const createDashboardSourceSummary = ({
  req,
  source,
  ppeHistory,
  readRunSummary,
  now,
}) => {
  const runs = getRunsForSource(ppeHistory, source);
  const latestRun = runs[0] || null;
  const latestDetectionRun = getLatestDetectionRun(runs);
  const latestRunSummary = latestRun
    ? readRunSummary(req, latestRun.outputDir, {
        analysisType: latestRun.analysisType,
        runId: latestRun.id,
        outputDir: latestRun.outputDir,
        createdAt: latestRun.createdAt,
        sourceId: source.id,
        sourceName: source.name,
        sourceLocation: source.location,
        sourceType: source.type,
      })
    : null;
  const latestDetectionSummary = latestDetectionRun
    ? readRunSummary(req, latestDetectionRun.outputDir, {
        analysisType: latestDetectionRun.analysisType,
        runId: latestDetectionRun.id,
        outputDir: latestDetectionRun.outputDir,
        createdAt: latestDetectionRun.createdAt,
        sourceId: source.id,
        sourceName: source.name,
        sourceLocation: source.location,
        sourceType: source.type,
      })
    : null;
  const latestSnapshotUrl =
    latestDetectionSummary?.events?.find((event) => event.snapshotUrl)?.snapshotUrl ||
    latestRunSummary?.events?.find((event) => event.snapshotUrl)?.snapshotUrl ||
    null;
  const latestDetectionAt = latestDetectionRun?.createdAt || null;

  return {
    mediaSourceId: source.id,
    name: source.name,
    location: source.location,
    type: source.type,
    status: source.status,
    analytics: source.analytics,
    executionMode: source.executionMode,
    monitoringStatus: source.monitoringStatus,
    monitoringIntervalSeconds: source.monitoringIntervalSeconds,
    runCount: runs.length,
    totalEvents: runs.reduce((sum, run) => sum + Number(run.eventCount || 0), 0),
    totalViolators: runs.reduce((sum, run) => sum + Number(run.violatorCount || 0), 0),
    latestRunAt: latestRun?.createdAt || null,
    latestDetectionAt,
    latestEventCount: latestDetectionRun?.eventCount ?? 0,
    latestViolatorCount: latestDetectionRun?.violatorCount ?? 0,
    latestOutputDir: latestRun?.outputDir || null,
    latestSnapshotUrl,
    latestAnalysisType: latestDetectionRun?.analysisType || latestRun?.analysisType || null,
    hasActiveAlert: Boolean(latestDetectionRun && isRecentAlert(latestDetectionAt, now())),
  };
};

const createDashboardSummaryBoundary = ({
  buildLatestAnalysisSummary,
  readAnalysisHistory,
  readMediaRegistry,
  readRunSummary,
  now = Date.now,
}) => {
  const router = express.Router();

  const getPpeAnalysisHistory = () =>
    readAnalysisHistory().filter((item) => PPE_ANALYSIS_TYPES.has(item.analysisType));

  const buildDashboardSummary = (req) => {
    const mediaSources = readMediaRegistry();
    const ppeHistory = getPpeAnalysisHistory();
    const sourceSummaries = mediaSources.map((source) =>
      createDashboardSourceSummary({
        req,
        source,
        ppeHistory,
        readRunSummary,
        now,
      })
    );
    const analyzedSourceCount = sourceSummaries.filter((item) => item.runCount > 0).length;
    const latestRun = ppeHistory[0] || null;
    const recentRuns = mediaSources
      .map((source) => getLatestDetectionRun(getRunsForSource(ppeHistory, source)))
      .filter(Boolean)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 10);

    return {
      totalSources: mediaSources.length,
      activeSources: mediaSources.filter((item) => item.status === "active").length,
      uploadSources: mediaSources.filter((item) => item.type === "upload").length,
      cameraSources: mediaSources.filter((item) => item.type === "camera").length,
      monitoringSources: mediaSources.filter((item) => item.monitoringStatus === "running").length,
      analyzedSourceCount,
      totalNoHelmetRuns: ppeHistory.length,
      totalNoHelmetEvents: ppeHistory.reduce((sum, run) => sum + Number(run.eventCount || 0), 0),
      totalViolatorTracks: ppeHistory.reduce((sum, run) => sum + Number(run.violatorCount || 0), 0),
      latestRunAt: latestRun?.createdAt || null,
      latestRunSourceName: latestRun?.sourceName || path.basename(latestRun?.videoPath || "") || null,
      latestAnalysisSummary: buildLatestAnalysisSummary(req, latestRun),
      sourceSummaries,
      recentRuns,
    };
  };

  const buildSourceLatestAnalysisSummary = (req, source) => {
    const ppeHistory = getPpeAnalysisHistory();
    const sourceRuns = getRunsForSource(ppeHistory, source);
    const latestRun = sourceRuns[0] || null;
    const latestDetectionRun = getLatestDetectionRun(sourceRuns);
    const noHelmetRuns = sourceRuns.filter((run) => run.analysisType === "no_helmet");
    const noSafetyVestRuns = sourceRuns.filter((run) => run.analysisType === "no_safety_vest");
    const noLifeVestRuns = sourceRuns.filter((run) => run.analysisType === "no_life_vest");
    const latestNoHelmetRun = noHelmetRuns[0] || null;
    const latestNoSafetyVestRun = noSafetyVestRuns[0] || null;
    const latestNoLifeVestRun = noLifeVestRuns[0] || null;
    const latestNoHelmetDetectionRun = getLatestDetectionRun(noHelmetRuns);
    const latestNoSafetyVestDetectionRun = getLatestDetectionRun(noSafetyVestRuns);
    const latestNoLifeVestDetectionRun = getLatestDetectionRun(noLifeVestRuns);

    return {
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
      latestAnalysisSummary: buildLatestAnalysisSummary(req, latestRun),
      latestDetectionSummary: buildLatestAnalysisSummary(req, latestDetectionRun),
      latestPpeByModule: {
        noHelmet: buildLatestAnalysisSummary(req, latestNoHelmetRun),
        noSafetyVest: buildLatestAnalysisSummary(req, latestNoSafetyVestRun),
        noLifeVest: buildLatestAnalysisSummary(req, latestNoLifeVestRun),
      },
      latestDetectionByModule: {
        noHelmet: buildLatestAnalysisSummary(req, latestNoHelmetDetectionRun),
        noSafetyVest: buildLatestAnalysisSummary(req, latestNoSafetyVestDetectionRun),
        noLifeVest: buildLatestAnalysisSummary(req, latestNoLifeVestDetectionRun),
      },
    };
  };

  router.get("/dashboard-summary", (req, res) => {
    res.json({
      ok: true,
      summary: buildDashboardSummary(req),
    });
  });

  router.get("/dashboard-summary/source/:id/latest-analysis", (req, res) => {
    const mediaSources = readMediaRegistry();
    const source = mediaSources.find((item) => item.id === req.params.id);
    if (!source) {
      return res.status(404).json({ ok: false, message: "Media source not found." });
    }

    return res.json({
      ok: true,
      ...buildSourceLatestAnalysisSummary(req, source),
    });
  });

  return {
    buildDashboardSummary,
    buildSourceLatestAnalysisSummary,
    router,
  };
};

module.exports = {
  createDashboardSummaryBoundary,
  createDashboardSourceSummary,
  getLatestDetectionRun,
  getRunsForSource,
  isRecentAlert,
};
