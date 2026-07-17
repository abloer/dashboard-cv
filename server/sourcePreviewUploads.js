const dns = require("dns").promises;
const express = require("express");
const fs = require("fs");
const net = require("net");
const path = require("path");
const { z } = require("zod");

const sanitizeFilename = (filename) =>
  String(filename || "upload.bin")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "upload.bin";

const createClientInputError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const parseRate = (value) => {
  const [numerator = "0", denominator = "1"] = String(value).split("/");
  const denominatorNumber = Number(denominator) || 1;
  return Number(numerator) / denominatorNumber;
};

const isPrivateIpv4 = (address) => {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [first, second] = parts;
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127) ||
    first === 0
  );
};

const isPrivateIpv6 = (address) => {
  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized === "::"
  );
};

const isPrivateIpAddress = (address) => {
  const family = net.isIP(address);
  if (family === 4) {
    return isPrivateIpv4(address);
  }
  if (family === 6) {
    return isPrivateIpv6(address);
  }
  return false;
};

const sanitizePreviewError = (error, fallbackMessage) => ({
  ok: false,
  message: error?.statusCode ? error.message : fallbackMessage,
  stdout: "",
  stderr: "",
});

const createSourcePreviewUploadBoundary = ({
  allowedSourcePreviewSchemes,
  allowPrivateSourcePreviewIps = false,
  ensureAnalysisDirectories,
  fileExists = fs.existsSync,
  operationalMetrics,
  previewRoot,
  publicSnapshotUrl,
  resolveManagedVideoPath,
  runCommand,
  uploadRoot,
}) => {
  const router = express.Router();
  const allowedSchemes = allowedSourcePreviewSchemes instanceof Set
    ? allowedSourcePreviewSchemes
    : new Set(allowedSourcePreviewSchemes || []);

  const requireBinary = async (binaryName) => {
    try {
      await runCommand("which", [binaryName]);
    } catch (_error) {
      throw new Error(`Required binary '${binaryName}' is not available on the server.`);
    }
  };

  const lookupHostWithTimeout = async (hostname) => {
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(createClientInputError("Source host resolution timed out.")), 2000);
    });
    return Promise.race([
      dns.lookup(hostname, { all: true, verbatim: true }),
      timeout,
    ]);
  };

  const validateSourcePreviewInput = async (source) => {
    const value = String(source || "").trim();
    let url;
    try {
      url = new URL(value);
    } catch (_error) {
      throw createClientInputError("Source must be a valid URL.");
    }

    const scheme = url.protocol.replace(/:$/, "").toLowerCase();
    if (!allowedSchemes.has(scheme)) {
      throw createClientInputError("Source scheme is not allowed for preview.");
    }
    if (!url.hostname || ["localhost", "ip6-localhost"].includes(url.hostname.toLowerCase())) {
      throw createClientInputError("Source host is not allowed for preview.");
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const literalIpFamily = net.isIP(hostname);
    const addresses = literalIpFamily
      ? [{ address: hostname }]
      : await lookupHostWithTimeout(hostname).catch((error) => {
          throw createClientInputError(error?.message || "Source host could not be resolved.");
        });

    if (
      !allowPrivateSourcePreviewIps &&
      addresses.some((entry) => isPrivateIpAddress(entry.address))
    ) {
      throw createClientInputError("Source host resolves to a private or internal address.");
    }

    return value;
  };

  const resolveUploadedVideoPath = (candidate) => {
    const videoPath = String(candidate || "").trim();
    if (!videoPath) {
      throw createClientInputError("videoPath is required.");
    }
    if (!path.isAbsolute(videoPath) || !fileExists(videoPath)) {
      throw createClientInputError("Only uploaded videos inside the upload directory can be used.");
    }
    const realUploadRoot = fs.realpathSync.native(uploadRoot);
    const realVideoPath = fs.realpathSync.native(videoPath);
    const relativePath = path.relative(realUploadRoot, realVideoPath);
    if (relativePath === "" || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      throw createClientInputError("Only uploaded videos inside the upload directory can be used.");
    }
    return realVideoPath;
  };

  const probeVideo = async (videoPath) => {
    await requireBinary("ffprobe");
    const { stdout } = await runCommand("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,avg_frame_rate:format=duration",
      "-of",
      "json",
      videoPath,
    ]);
    const payload = JSON.parse(stdout);
    const stream = payload.streams?.[0] || {};
    const format = payload.format || {};
    return {
      width: Number(stream.width || 0),
      height: Number(stream.height || 0),
      fps: parseRate(stream.avg_frame_rate || "0/1"),
      durationSeconds: Number(format.duration || 0),
    };
  };

  router.post(
    "/analysis/upload-video",
    express.raw({
      type: ["application/octet-stream", "video/*"],
      limit: "1024mb",
    }),
    async (req, res) => {
      try {
        ensureAnalysisDirectories();
        const fileName = sanitizeFilename(
          req.query.filename || req.header("x-file-name") || "uploaded-video.mp4"
        );
        const extension = path.extname(fileName) || ".mp4";
        const storedFileName = `${Date.now()}-${fileName.replace(/\.[^.]+$/, "")}${extension}`;
        const storedPath = path.join(uploadRoot, storedFileName);

        if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
          return res.status(400).json({
            ok: false,
            message: "Request body is empty. Upload the video as a binary request body.",
          });
        }

        fs.writeFileSync(storedPath, req.body);
        operationalMetrics.recordUpload(req.body.length);
        let metadata = null;
        let warning = null;
        try {
          metadata = await probeVideo(storedPath);
        } catch (error) {
          warning = error?.message || "Video metadata could not be probed.";
        }

        return res.json({
          ok: true,
          fileName,
          videoPath: storedPath,
          sizeBytes: req.body.length,
          metadata,
          warning,
        });
      } catch (error) {
        return res.status(500).json({
          ok: false,
          message: error?.message || "Video upload failed.",
        });
      }
    }
  );

  router.delete("/analysis/upload-video", (req, res) => {
    try {
      ensureAnalysisDirectories();
      let resolvedVideoPath;
      try {
        resolvedVideoPath = resolveUploadedVideoPath(req.query.videoPath);
      } catch (_error) {
        return res.status(400).json({
          ok: false,
          message: "Only uploaded videos inside the upload directory can be deleted.",
        });
      }

      fs.unlinkSync(resolvedVideoPath);
      return res.json({ ok: true, videoPath: resolvedVideoPath });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: error?.message || "Uploaded video cleanup failed.",
      });
    }
  });

  router.post("/analysis/video-preview", async (req, res) => {
    try {
      ensureAnalysisDirectories();
      const payloadSchema = z.object({
        videoPath: z.string().trim().min(1),
        timestampSeconds: z.number().min(0).optional(),
      });
      const parsed = payloadSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          message: "Invalid preview payload",
          errors: parsed.error.flatten(),
        });
      }

      const { timestampSeconds } = parsed.data;
      const videoPath = resolveManagedVideoPath(parsed.data.videoPath);

      await requireBinary("ffmpeg");
      const metadata = await probeVideo(videoPath);
      const previewFileName = `${Date.now()}-${sanitizeFilename(
        path.basename(videoPath).replace(/\.[^.]+$/, "")
      )}.jpg`;
      const previewPath = path.join(previewRoot, previewFileName);
      const previewTimestamp =
        typeof timestampSeconds === "number"
          ? timestampSeconds
          : metadata.durationSeconds > 0
            ? metadata.durationSeconds / 2
            : 0;

      await runCommand("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        String(previewTimestamp),
        "-i",
        videoPath,
        "-frames:v",
        "1",
        "-y",
        previewPath,
      ]);

      return res.json({
        ok: true,
        videoPath,
        previewPath,
        previewUrl: publicSnapshotUrl(req, previewPath),
        timestampSeconds: previewTimestamp,
        metadata,
      });
    } catch (error) {
      return res.status(error?.statusCode || 500).json(
        sanitizePreviewError(error, "Preview generation failed.")
      );
    }
  });

  router.post("/analysis/source-preview", async (req, res) => {
    try {
      ensureAnalysisDirectories();
      const payloadSchema = z.object({
        source: z.string().trim().min(1),
      });
      const parsed = payloadSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          message: "Invalid source preview payload",
          errors: parsed.error.flatten(),
        });
      }

      const source = await validateSourcePreviewInput(parsed.data.source);
      await requireBinary("ffmpeg");

      const previewFileName = `${Date.now()}-${sanitizeFilename(
        source.replace(/^[a-z]+:\/\//i, "").slice(0, 64) || "source-preview"
      )}.jpg`;
      const previewPath = path.join(previewRoot, previewFileName);
      const normalizedSource = source.trim().toLowerCase();
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
        source,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        "-y",
        previewPath
      );

      await runCommand("ffmpeg", ffmpegArgs, { timeout: 15000 });

      return res.json({
        ok: true,
        source,
        previewPath,
        previewUrl: publicSnapshotUrl(req, previewPath),
        capturedAt: new Date().toISOString(),
      });
    } catch (error) {
      return res.status(error?.statusCode || 500).json(
        sanitizePreviewError(error, "Source preview generation failed.")
      );
    }
  });

  return {
    probeVideo,
    requireBinary,
    router,
    sanitizeFilename,
    validateSourcePreviewInput,
  };
};

module.exports = {
  createSourcePreviewUploadBoundary,
  sanitizeFilename,
};
