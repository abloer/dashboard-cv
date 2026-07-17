const { randomUUID } = require("crypto");
const express = require("express");
const { z } = require("zod");
const { MediaSourceConflictError } = require("./repositories/mediaSourceRepository");

const VALID_ANALYTICS = new Set(["HSE", "PPE", "Operations", "Fleet & KPI"]);
const VALID_EXECUTION_MODES = new Set(["manual", "scheduled", "continuous"]);
const VALID_MONITORING_STATUSES = new Set(["idle", "running", "paused"]);

const createClientInputError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const normalizeAnalytics = (analytics = []) => {
  const next = new Set();
  for (const item of Array.isArray(analytics) ? analytics : []) {
    if (item === "No Helmet") {
      next.add("PPE");
      continue;
    }
    if (item === "People Count") {
      next.add("Operations");
      continue;
    }
    if (VALID_ANALYTICS.has(item)) {
      next.add(item);
    }
  }
  return Array.from(next);
};

const normalizeMediaSource = (item) => {
  const type = item?.type === "camera" ? "camera" : "upload";
  const analytics = normalizeAnalytics(item?.analytics);
  const executionMode = VALID_EXECUTION_MODES.has(item?.executionMode)
    ? item.executionMode
    : type === "camera"
      ? "continuous"
      : "manual";
  const monitoringStatus = VALID_MONITORING_STATUSES.has(item?.monitoringStatus)
    ? item.monitoringStatus
    : type === "camera" && executionMode !== "manual"
      ? "paused"
      : "idle";
  const intervalCandidate = Number(item?.monitoringIntervalSeconds);
  const monitoringIntervalSeconds =
    executionMode === "scheduled" && Number.isFinite(intervalCandidate) && intervalCandidate > 0
      ? Math.round(intervalCandidate)
      : executionMode === "scheduled"
        ? 15
        : null;

  return {
    ...item,
    type,
    analytics,
    executionMode,
    monitoringStatus: type === "upload" && executionMode === "manual" ? "idle" : monitoringStatus,
    monitoringIntervalSeconds,
  };
};

const mediaTypeSchema = z.enum(["upload", "camera"]);
const mediaStatusSchema = z.enum(["active", "inactive", "maintenance"]);
const mediaExecutionModeSchema = z.enum(["manual", "scheduled", "continuous"]);
const mediaMonitoringStatusSchema = z.enum(["idle", "running", "paused"]);
const mediaSourcePayloadSchema = z.object({
  name: z.string().trim().min(1),
  location: z.string().trim().min(1),
  source: z.string().trim().min(1),
  type: mediaTypeSchema,
  status: mediaStatusSchema,
  analytics: z.array(z.string().trim().min(1)).default([]),
  executionMode: mediaExecutionModeSchema.default("manual"),
  monitoringStatus: mediaMonitoringStatusSchema.default("idle"),
  monitoringIntervalSeconds: z.number().int().positive().nullable().optional(),
  note: z.string().trim().default(""),
  lastSeen: z.string().trim().min(1).optional(),
});
const mediaSourceMutationVersionSchema = z.object({
  expectedVersion: z.number().int().positive(),
});
const mediaSourceStatusPayloadSchema = z.object({
  status: mediaStatusSchema,
  expectedVersion: z.number().int().positive(),
});
const mediaSourceMonitoringPayloadSchema = z.object({
  monitoringStatus: mediaMonitoringStatusSchema,
  executionMode: mediaExecutionModeSchema.optional(),
  monitoringIntervalSeconds: z.number().int().positive().nullable().optional(),
  expectedVersion: z.number().int().positive(),
});

const createMediaSourceStorageValidator = ({ resolveManagedVideoPath, validateSourcePreviewInput }) =>
  async (payload) => {
    if (payload.type === "camera") {
      return {
        ...payload,
        source: await validateSourcePreviewInput(payload.source),
      };
    }

    return {
      ...payload,
      source: resolveManagedVideoPath(payload.source),
    };
  };

const parseMediaSourceExpectedVersion = (payload) => {
  const parsed = mediaSourceMutationVersionSchema.safeParse(payload || {});
  if (!parsed.success) {
    const error = createClientInputError("expectedVersion is required for media source mutations.");
    error.errors = parsed.error.flatten();
    throw error;
  }
  return parsed.data.expectedVersion;
};

const sendMediaSourceMutationError = (res, error, fallbackMessage) => {
  if (error instanceof MediaSourceConflictError || error?.code === "MEDIA_SOURCE_VERSION_CONFLICT") {
    return res.status(409).json({
      ok: false,
      code: "MEDIA_SOURCE_VERSION_CONFLICT",
      message: "Media source was modified by another request. Refresh and retry.",
    });
  }

  return res.status(error?.statusCode || 500).json({
    ok: false,
    code: error?.code || undefined,
    message: error?.statusCode ? error.message : fallbackMessage,
    errors: error?.errors || undefined,
  });
};

const createMediaSourceRouter = ({ repository, validatePayloadForStorage }) => {
  const router = express.Router();

  router.get("/media-sources", (_req, res) => {
    const items = repository.list().sort((left, right) =>
      String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""))
    );
    res.json({ ok: true, items });
  });

  router.post("/media-sources", async (req, res) => {
    try {
      const parsed = mediaSourcePayloadSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          message: "Invalid media source payload.",
          errors: parsed.error.flatten(),
        });
      }

      const validatedPayload = await validatePayloadForStorage(parsed.data);
      const now = new Date().toISOString();
      const newItem = normalizeMediaSource({
        id: `media-${randomUUID()}`,
        ...validatedPayload,
        lastSeen:
          validatedPayload.lastSeen ||
          (validatedPayload.type === "camera" ? "Baru ditambahkan" : "Upload baru"),
        createdAt: now,
        updatedAt: now,
      });

      const committed = repository.create(newItem);
      return res.status(201).json({ ok: true, item: committed });
    } catch (error) {
      return res.status(error?.statusCode || 500).json({
        ok: false,
        message: error?.statusCode ? error.message : "Media source validation failed.",
      });
    }
  });

  router.put("/media-sources/:id", async (req, res) => {
    try {
      const expectedVersion = parseMediaSourceExpectedVersion(req.body);
      const parsed = mediaSourcePayloadSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          message: "Invalid media source payload.",
          errors: parsed.error.flatten(),
        });
      }

      const validatedPayload = await validatePayloadForStorage(parsed.data);
      const updated = repository.update(
        req.params.id,
        (current) => ({
          ...validatedPayload,
          lastSeen: validatedPayload.lastSeen || current.lastSeen,
          updatedAt: new Date().toISOString(),
        }),
        { expectedVersion }
      );
      if (!updated) {
        return res.status(404).json({ ok: false, message: "Media source not found." });
      }

      return res.json({ ok: true, item: updated });
    } catch (error) {
      return sendMediaSourceMutationError(res, error, "Media source validation failed.");
    }
  });

  router.patch("/media-sources/:id/status", (req, res) => {
    const parsed = mediaSourceStatusPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid media source status payload.",
        errors: parsed.error.flatten(),
      });
    }

    try {
      const updated = repository.update(
        req.params.id,
        (current) => ({
          status: parsed.data.status,
          monitoringStatus:
            parsed.data.status !== "active"
              ? current.type === "camera" && current.executionMode !== "manual"
                ? "paused"
                : "idle"
              : current.monitoringStatus,
          updatedAt: new Date().toISOString(),
        }),
        { expectedVersion: parsed.data.expectedVersion }
      );
      if (!updated) {
        return res.status(404).json({ ok: false, message: "Media source not found." });
      }

      return res.json({ ok: true, item: updated });
    } catch (error) {
      return sendMediaSourceMutationError(res, error, "Media source status update failed.");
    }
  });

  router.patch("/media-sources/:id/monitoring", (req, res) => {
    const parsed = mediaSourceMonitoringPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid monitoring payload.",
        errors: parsed.error.flatten(),
      });
    }

    try {
      const updated = repository.update(
        req.params.id,
        (current) => {
          const nextExecutionMode = parsed.data.executionMode || current.executionMode;
          const nextMonitoringStatus =
            current.type === "upload" && nextExecutionMode === "manual"
              ? "idle"
              : parsed.data.monitoringStatus;

          return {
            executionMode: nextExecutionMode,
            monitoringStatus: nextMonitoringStatus,
            monitoringIntervalSeconds:
              parsed.data.monitoringIntervalSeconds !== undefined
                ? parsed.data.monitoringIntervalSeconds
                : current.monitoringIntervalSeconds,
            lastSeen:
              nextMonitoringStatus === "running"
                ? "Monitoring aktif"
                : nextMonitoringStatus === "paused"
                  ? "Monitoring dijeda"
                  : current.type === "camera"
                    ? "Siap dipantau"
                    : current.lastSeen,
            updatedAt: new Date().toISOString(),
          };
        },
        { expectedVersion: parsed.data.expectedVersion }
      );
      if (!updated) {
        return res.status(404).json({ ok: false, message: "Media source not found." });
      }

      return res.json({ ok: true, item: updated });
    } catch (error) {
      return sendMediaSourceMutationError(res, error, "Media source monitoring update failed.");
    }
  });

  router.delete("/media-sources/:id", (req, res) => {
    try {
      const expectedVersion = parseMediaSourceExpectedVersion(req.body);
      const removed = repository.delete(req.params.id, { expectedVersion });
      if (!removed) {
        return res.status(404).json({ ok: false, message: "Media source not found." });
      }

      return res.json({ ok: true, item: removed });
    } catch (error) {
      return sendMediaSourceMutationError(res, error, "Media source deletion failed.");
    }
  });

  return router;
};

module.exports = {
  createMediaSourceRouter,
  createMediaSourceStorageValidator,
  normalizeAnalytics,
  normalizeMediaSource,
  parseMediaSourceExpectedVersion,
};
