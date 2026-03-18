#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const args = process.argv.slice(2);

const readArg = (flag, fallback) => {
  const index = args.indexOf(flag);
  if (index === -1 || index === args.length - 1) {
    return fallback;
  }
  return args[index + 1];
};

const hostRuntimeDir = path.resolve(
  readArg("--runtime-dir", process.env.HOST_RUNTIME_ANALYSIS_DIR || path.resolve("runtime-analysis"))
);
const hostDataDir = path.resolve(
  readArg("--data-dir", process.env.HOST_SERVER_DATA_DIR || path.resolve("server/data"))
);
const containerRuntimeDir = readArg(
  "--container-runtime-dir",
  process.env.ANALYSIS_OUTPUT_ROOT || "/app/runtime-analysis"
);
const defaultAnalytics = String(readArg("--analytics", "PPE"))
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const mediaRegistryPath = path.join(hostDataDir, "media-sources.json");
const analysisHistoryPath = path.join(hostDataDir, "analysis-history.json");

const ensureDir = (directoryPath) => {
  fs.mkdirSync(directoryPath, { recursive: true });
};

const readJsonArray = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};

const writeJson = (filePath, value) => {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

const toIso = (value) => {
  try {
    return new Date(value).toISOString();
  } catch (_error) {
    return new Date().toISOString();
  }
};

const sanitizeNameFromFile = (fileName) => {
  const withoutExt = fileName.replace(/\.[^.]+$/, "");
  const withoutTimestamp = withoutExt.replace(/^\d+-/, "");
  return (
    withoutTimestamp
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase()) || "Recovered Source"
  );
};

const createRecoveredSource = ({ source, name, note, createdAt, updatedAt, lastSeen }) => ({
  id: `media-${randomUUID()}`,
  name,
  location: "Recovered Runtime",
  source,
  type: "upload",
  status: "active",
  analytics: defaultAnalytics,
  executionMode: "manual",
  monitoringStatus: "idle",
  monitoringIntervalSeconds: null,
  lastSeen,
  note,
  createdAt,
  updatedAt,
});

const createRecoveredHistory = ({
  id,
  mediaSourceId,
  sourceName,
  videoPath,
  outputDir,
  summary,
  createdAt,
}) => ({
  id,
  analysisType: "no_helmet",
  mediaSourceId,
  sourceName,
  location: "Recovered Runtime",
  videoPath,
  outputDir,
  eventCount: Number(summary?.event_count || 0),
  violatorCount: Number(summary?.global_summary?.violator_count || 0),
  stableDetectedTrackCount: Number(summary?.global_summary?.stable_detected_track_count || 0),
  rawDetectedTrackCount: Number(summary?.global_summary?.detected_track_count || 0),
  createdAt,
});

const relativeToContainerRuntime = (...segments) =>
  path.posix.join(containerRuntimeDir.replace(/\\/g, "/"), ...segments);

ensureDir(hostDataDir);
ensureDir(hostRuntimeDir);

const existingSources = readJsonArray(mediaRegistryPath);
const existingHistory = readJsonArray(analysisHistoryPath);

const sourceByPath = new Map(existingSources.map((item) => [item.source, item]));
const historyByOutputDir = new Map(existingHistory.map((item) => [item.outputDir, item]));

let recoveredSourceCount = 0;
let recoveredHistoryCount = 0;

const uploadsDir = path.join(hostRuntimeDir, "uploads");
if (fs.existsSync(uploadsDir)) {
  const uploadFiles = fs
    .readdirSync(uploadsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  uploadFiles.forEach((fileName) => {
    const hostFilePath = path.join(uploadsDir, fileName);
    const stat = fs.statSync(hostFilePath);
    const containerVideoPath = relativeToContainerRuntime("uploads", fileName);
    if (sourceByPath.has(containerVideoPath)) {
      return;
    }

    const createdAt = toIso(stat.birthtimeMs || stat.mtimeMs || Date.now());
    const source = createRecoveredSource({
      source: containerVideoPath,
      name: sanitizeNameFromFile(fileName),
      note: "Dipulihkan otomatis dari file upload yang masih ada di runtime.",
      createdAt,
      updatedAt: toIso(stat.mtimeMs || Date.now()),
      lastSeen: `${fileName} recovered`,
    });

    existingSources.push(source);
    sourceByPath.set(containerVideoPath, source);
    recoveredSourceCount += 1;
  });
}

const runDirs = fs.existsSync(hostRuntimeDir)
  ? fs
      .readdirSync(hostRuntimeDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^run-/.test(entry.name))
      .map((entry) => entry.name)
  : [];

runDirs.forEach((runDirName) => {
  const hostRunDir = path.join(hostRuntimeDir, runDirName);
  const hostSummaryPath = path.join(hostRunDir, "summary.json");
  if (!fs.existsSync(hostSummaryPath)) {
    return;
  }

  const containerOutputDir = relativeToContainerRuntime(runDirName);
  if (historyByOutputDir.has(containerOutputDir)) {
    return;
  }

  try {
    const summary = JSON.parse(fs.readFileSync(hostSummaryPath, "utf8"));
    const videoPath = summary?.video_path;
    if (typeof videoPath !== "string" || videoPath.trim().length === 0) {
      return;
    }

    let mediaSource = sourceByPath.get(videoPath) || null;
    if (!mediaSource) {
      const stat = fs.statSync(hostSummaryPath);
      mediaSource = createRecoveredSource({
        source: videoPath,
        name: sanitizeNameFromFile(path.basename(videoPath)),
        note: "Dipulihkan otomatis dari hasil run analisis yang masih ada di runtime.",
        createdAt: toIso(stat.birthtimeMs || stat.mtimeMs || Date.now()),
        updatedAt: toIso(stat.mtimeMs || Date.now()),
        lastSeen: "Recovered from analysis summary",
      });
      existingSources.push(mediaSource);
      sourceByPath.set(videoPath, mediaSource);
      recoveredSourceCount += 1;
    }

    const stat = fs.statSync(hostSummaryPath);
    const historyEntry = createRecoveredHistory({
      id: runDirName,
      mediaSourceId: mediaSource.id,
      sourceName: mediaSource.name,
      videoPath,
      outputDir: containerOutputDir,
      summary,
      createdAt: toIso(stat.mtimeMs || Date.now()),
    });

    existingHistory.push(historyEntry);
    historyByOutputDir.set(containerOutputDir, historyEntry);
    recoveredHistoryCount += 1;
  } catch (error) {
    console.error(`Failed to recover ${runDirName}: ${error.message}`);
  }
});

existingSources.sort(
  (left, right) =>
    new Date(right.updatedAt || right.createdAt || 0).getTime() -
    new Date(left.updatedAt || left.createdAt || 0).getTime()
);
existingHistory.sort(
  (left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
);

writeJson(mediaRegistryPath, existingSources);
writeJson(analysisHistoryPath, existingHistory);

console.log(
  JSON.stringify(
    {
      ok: true,
      hostRuntimeDir,
      hostDataDir,
      containerRuntimeDir,
      recoveredSources: recoveredSourceCount,
      recoveredHistory: recoveredHistoryCount,
      totalSources: existingSources.length,
      totalHistory: existingHistory.length,
    },
    null,
    2
  )
);
