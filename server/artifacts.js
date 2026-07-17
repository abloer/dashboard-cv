const { createHmac, timingSafeEqual } = require("crypto");
const express = require("express");
const fs = require("fs");
const path = require("path");
const { z } = require("zod");

const artifactCleanupPayloadSchema = z
  .object({
    maxAgeDays: z.number().positive().max(3650).optional(),
    maxBytes: z.number().int().nonnegative().optional(),
    dryRun: z.boolean().optional().default(false),
  })
  .optional()
  .default({});

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
};

const getRequestPathWithQueryRemoved = (req) => String(req.originalUrl || req.url || "").split("?")[0];

const createArtifactAccess = ({ signingSecret }) => {
  const getEncodedPathFromRequest = (req) => {
    const requestPath = getRequestPathWithQueryRemoved(req);
    if (!requestPath.startsWith("/analysis-output/")) {
      return null;
    }
    return requestPath.replace(/^\/analysis-output\//, "");
  };

  const createArtifactSignature = (encodedPath, expiresAt) => {
    if (!signingSecret) {
      return null;
    }
    return createHmac("sha256", signingSecret)
      .update(`${encodedPath}.${expiresAt}`)
      .digest("base64url");
  };

  const verifyArtifactSignature = (encodedPath, expiresAt, signature) => {
    const expiresAtNumber = Number(expiresAt);
    if (!encodedPath || !expiresAtNumber || !signature || Date.now() >= expiresAtNumber * 1000) {
      return false;
    }
    const expectedSignature = createArtifactSignature(encodedPath, expiresAtNumber);
    return Boolean(expectedSignature) && safeEqual(String(signature), expectedSignature);
  };

  const isSignedArtifactRequest = (req) => {
    const encodedPath = getEncodedPathFromRequest(req);
    if (!encodedPath) {
      return false;
    }
    return verifyArtifactSignature(encodedPath, req.query?.expires, req.query?.signature);
  };

  return {
    createArtifactSignature,
    getEncodedPathFromRequest,
    isSignedArtifactRequest,
    verifyArtifactSignature,
  };
};

const isPathWithinOrEqual = (candidatePath, parentPath) =>
  candidatePath === parentPath || candidatePath.startsWith(`${parentPath}${path.sep}`);

const resolveArtifactRequestPath = ({ req, outputRoot, access, fileExists = fs.existsSync }) => {
  const encodedPath = access.getEncodedPathFromRequest(req);
  if (!encodedPath) {
    return null;
  }

  let relativePath;
  try {
    relativePath = decodeURIComponent(encodedPath);
  } catch (_error) {
    return null;
  }

  const absolutePath = path.resolve(outputRoot, relativePath);
  let realPath;
  try {
    realPath = fs.realpathSync.native(absolutePath);
  } catch (_error) {
    return null;
  }

  if (!isPathWithinOrEqual(realPath, outputRoot) || realPath === outputRoot || !fileExists(realPath)) {
    return null;
  }
  return realPath;
};

const getArtifactEntryStats = (entryPath) => {
  const stat = fs.lstatSync(entryPath);
  if (stat.isSymbolicLink()) {
    return {
      bytes: 0,
      mtimeMs: stat.mtimeMs,
    };
  }
  if (!stat.isDirectory()) {
    return {
      bytes: stat.size,
      mtimeMs: stat.mtimeMs,
    };
  }

  let bytes = 0;
  let mtimeMs = stat.mtimeMs;
  const stack = [entryPath];
  while (stack.length > 0) {
    const currentPath = stack.pop();
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    entries.forEach((entry) => {
      const childPath = path.join(currentPath, entry.name);
      const childStat = fs.lstatSync(childPath);
      mtimeMs = Math.max(mtimeMs, childStat.mtimeMs);
      if (childStat.isSymbolicLink()) {
        return;
      }
      if (childStat.isDirectory()) {
        stack.push(childPath);
        return;
      }
      bytes += childStat.size;
    });
  }
  return { bytes, mtimeMs };
};

const resolveCleanupCandidate = (outputRoot, candidatePath) => {
  const rootRealPath = fs.realpathSync.native(outputRoot);
  const absolutePath = path.isAbsolute(candidatePath)
    ? path.resolve(candidatePath)
    : path.resolve(rootRealPath, candidatePath);

  let realPath;
  try {
    realPath = fs.realpathSync.native(absolutePath);
  } catch (_error) {
    return { rootRealPath, absolutePath, realPath: null, outsideRoot: true };
  }

  return {
    rootRealPath,
    absolutePath,
    realPath,
    outsideRoot: !isPathWithinOrEqual(realPath, rootRealPath) || realPath === rootRealPath,
  };
};

const getActiveArtifactRoots = (outputRoot, jobs = []) => {
  const rootRealPath = fs.realpathSync.native(outputRoot);
  return jobs
    .filter((job) => job?.status === "queued" || job?.status === "running")
    .map((job) => job.outputDir)
    .filter(Boolean)
    .map((outputDir) => path.resolve(outputDir))
    .map((outputDir) => {
      try {
        return fs.existsSync(outputDir) ? fs.realpathSync.native(outputDir) : outputDir;
      } catch (_error) {
        return null;
      }
    })
    .filter((outputDir) => outputDir && isPathWithinOrEqual(outputDir, rootRealPath));
};

const cleanupAnalysisArtifacts = ({
  outputRoot,
  jobs = [],
  maxAgeMs,
  maxBytes = 0,
  dryRun = false,
  now = () => Date.now(),
  candidatePaths = null,
} = {}) => {
  const startedAtNs = process.hrtime.bigint();
  const rootRealPath = fs.realpathSync.native(outputRoot);
  const activeRoots = getActiveArtifactRoots(rootRealPath, jobs);
  const scannedCandidates =
    candidatePaths ||
    fs.readdirSync(rootRealPath, { withFileTypes: true }).map((entry) => path.join(rootRealPath, entry.name));
  const candidates = [];
  const result = {
    ok: true,
    dryRun,
    deletedCount: 0,
    skippedCount: 0,
    bytesReclaimed: 0,
    retainedBytes: 0,
    durationMs: 0,
    errorCode: null,
  };

  scannedCandidates.forEach((candidatePath) => {
    const resolved = resolveCleanupCandidate(rootRealPath, candidatePath);
    if (resolved.outsideRoot || !resolved.realPath) {
      result.skippedCount += 1;
      return;
    }
    if (
      activeRoots.some(
        (activeRoot) =>
          isPathWithinOrEqual(activeRoot, resolved.realPath) ||
          isPathWithinOrEqual(resolved.realPath, activeRoot)
      )
    ) {
      result.skippedCount += 1;
      return;
    }

    const stats = getArtifactEntryStats(resolved.realPath);
    const ageMs = now() - stats.mtimeMs;
    candidates.push({
      path: resolved.realPath,
      bytes: stats.bytes,
      mtimeMs: stats.mtimeMs,
      expired: maxAgeMs !== undefined && ageMs > maxAgeMs,
    });
  });

  const currentBytes = candidates.reduce((sum, candidate) => sum + candidate.bytes, 0);
  let projectedBytes = currentBytes;
  const toDelete = new Set(candidates.filter((candidate) => candidate.expired).map((candidate) => candidate.path));
  projectedBytes -= candidates
    .filter((candidate) => toDelete.has(candidate.path))
    .reduce((sum, candidate) => sum + candidate.bytes, 0);

  if (maxBytes > 0 && projectedBytes > maxBytes) {
    candidates
      .filter((candidate) => !toDelete.has(candidate.path))
      .sort((left, right) => left.mtimeMs - right.mtimeMs)
      .some((candidate) => {
        toDelete.add(candidate.path);
        projectedBytes -= candidate.bytes;
        return projectedBytes <= maxBytes;
      });
  }

  candidates.forEach((candidate) => {
    if (!toDelete.has(candidate.path)) {
      result.retainedBytes += candidate.bytes;
      return;
    }
    result.deletedCount += 1;
    result.bytesReclaimed += candidate.bytes;
    if (!dryRun) {
      fs.rmSync(candidate.path, { recursive: true, force: true });
    }
  });

  result.durationMs = Number((Number(process.hrtime.bigint() - startedAtNs) / 1_000_000).toFixed(2));
  return result;
};

const createArtifactRouter = ({
  access,
  outputRoot,
  jobRepository,
  logger,
  retentionMaxAgeMs,
  retentionMaxBytes,
}) => {
  const router = express.Router();

  const resolveRequestPath = (req) =>
    resolveArtifactRequestPath({
      req,
      outputRoot,
      access,
    });

  const cleanupConfiguredAnalysisArtifacts = (options = {}) =>
    cleanupAnalysisArtifacts({
      outputRoot,
      jobs: jobRepository.list(),
      maxAgeMs: options.maxAgeMs ?? retentionMaxAgeMs,
      maxBytes: options.maxBytes ?? retentionMaxBytes,
      dryRun: Boolean(options.dryRun),
    });

  router.post("/analysis-output/cleanup", (req, res) => {
    const parsed = artifactCleanupPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Invalid cleanup request." });
    }

    const startedAtNs = process.hrtime.bigint();
    try {
      const result = cleanupConfiguredAnalysisArtifacts({
        maxAgeMs:
          parsed.data.maxAgeDays !== undefined
            ? parsed.data.maxAgeDays * 24 * 60 * 60 * 1000
            : retentionMaxAgeMs,
        maxBytes: parsed.data.maxBytes ?? retentionMaxBytes,
        dryRun: parsed.data.dryRun,
      });
      logger.info("analysis_artifact_cleanup_completed", {
        deletedCount: result.deletedCount,
        skippedCount: result.skippedCount,
        bytesReclaimed: result.bytesReclaimed,
        durationMs: result.durationMs,
        dryRun: result.dryRun,
      });
      return res.json(result);
    } catch (error) {
      const durationMs = Number(process.hrtime.bigint() - startedAtNs) / 1_000_000;
      logger.error("analysis_artifact_cleanup_failed", {
        deletedCount: 0,
        skippedCount: 0,
        bytesReclaimed: 0,
        durationMs: Number(durationMs.toFixed(2)),
        errorCode: error?.code || error?.name || "ARTIFACT_CLEANUP_FAILED",
      });
      return res.status(500).json({
        ok: false,
        message: "Artifact cleanup failed.",
        errorCode: "ARTIFACT_CLEANUP_FAILED",
      });
    }
  });

  router.get("/analysis-output/*", (req, res) => {
    if (!access.isSignedArtifactRequest(req)) {
      return res.status(401).json({ ok: false, message: "Valid signed artifact URL is required." });
    }

    const artifactPath = resolveRequestPath(req);
    if (!artifactPath) {
      return res.status(404).json({ ok: false, message: "Artifact not found." });
    }

    return res.sendFile(artifactPath, {
      headers: {
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });

  return {
    cleanupConfiguredAnalysisArtifacts,
    resolveArtifactRequestPath: resolveRequestPath,
    router,
  };
};

module.exports = {
  cleanupAnalysisArtifacts,
  createArtifactAccess,
  createArtifactRouter,
  resolveArtifactRequestPath,
};
