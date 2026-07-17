const express = require("express");
const { z } = require("zod");

const numberOrNull = z.number().finite().nullable().optional();
const stringOrNull = z.string().trim().min(1).nullable().optional();
const idField = z.number().int().positive().optional();

const videoAnalyticSchema = z.object({
  id: idField,
  file_name: stringOrNull,
  bench_height: numberOrNull,
  front_loading_area_length: numberOrNull,
  digging_time: numberOrNull,
  swinging_time: numberOrNull,
  dumping_time: numberOrNull,
  loading_time: numberOrNull,
  analityc_type: stringOrNull,
  location: stringOrNull,
  operator: stringOrNull,
  avg_cycletime: numberOrNull,
});

const excavatorTypeSchema = z.object({
  id: idField,
  type: stringOrNull,
});

const dumpTruckTypeSchema = z.object({
  id: idField,
  type: stringOrNull,
  turning_radius: numberOrNull,
});

const excavatorDataSchema = z.object({
  id: idField,
  excavator_type_fk: z.number().int().positive().nullable().optional(),
  video_analityc_fk: z.number().int().positive().nullable().optional(),
});

const dumpTruckDataSchema = z.object({
  id: idField,
  video_analityc_fk: z.number().int().positive().nullable().optional(),
  dump_truck_type_fk: z.number().int().positive().nullable().optional(),
  queue_time: numberOrNull,
  estimated_load: numberOrNull,
});

const syncPayloadSchema = z.object({
  video_analytic: z.array(videoAnalyticSchema).optional(),
  excavator_type: z.array(excavatorTypeSchema).optional(),
  dump_truck_type: z.array(dumpTruckTypeSchema).optional(),
  excavator_data: z.array(excavatorDataSchema).optional(),
  dump_truck_data: z.array(dumpTruckDataSchema).optional(),
});

const normalizeArray = (value) => (Array.isArray(value) ? value : []);

const mapVideoAnalytic = (row) => ({
  ...(row.id !== undefined && { ID: row.id }),
  FILE_NAME: row.file_name ?? null,
  BENCH_HEIGHT: row.bench_height ?? null,
  FRONT_LOADING_AREA_LENGTH: row.front_loading_area_length ?? null,
  DIGGING_TIME: row.digging_time ?? null,
  SWINGING_TIME: row.swinging_time ?? null,
  DUMPING_TIME: row.dumping_time ?? null,
  LOADING_TIME: row.loading_time ?? null,
  ANALITYC_TYPE: row.analityc_type ?? null,
  LOCATION: row.location ?? null,
  OPERATOR: row.operator ?? null,
  AVG_CYCLETIME: row.avg_cycletime ?? null,
});

const mapExcavatorType = (row) => ({
  ...(row.id !== undefined && { ID: row.id }),
  TYPE: row.type ?? null,
});

const mapDumpTruckType = (row) => ({
  ...(row.id !== undefined && { ID: row.id }),
  TYPE: row.type ?? null,
  TURNING_RADIUS: row.turning_radius ?? null,
});

const mapExcavatorData = (row) => ({
  ...(row.id !== undefined && { ID: row.id }),
  EXCAVATOR_TYPE_FK: row.excavator_type_fk ?? null,
  VIDEO_ANALITYC_FK: row.video_analityc_fk ?? null,
});

const mapDumpTruckData = (row) => ({
  ...(row.id !== undefined && { ID: row.id }),
  VIDEO_ANALITYC_FK: row.video_analityc_fk ?? null,
  DUMP_TRUCK_TYPE_FK: row.dump_truck_type_fk ?? null,
  QUEUE_TIME: row.queue_time ?? null,
  ESTIMATED_LOAD: row.estimated_load ?? null,
});

const createSupabaseUpsertRows = (supabase) => async (table, rows, onConflict = "ID") => {
  if (!supabase) {
    throw new Error("Supabase client is not configured.");
  }
  if (rows.length === 0) return { count: 0 };
  const { error, data } = await supabase.from(table).upsert(rows, { onConflict });
  if (error) throw error;
  return { count: data ? data.length : rows.length };
};

const defaultSafeErrorLogMetadata = (error) => ({
  code: error?.code || undefined,
  statusCode: error?.statusCode || undefined,
  message: error?.message || "Unexpected error",
});

const createSyncBoundary = ({
  supabase = null,
  upsertRows = createSupabaseUpsertRows(supabase),
  logger = console,
  getSafeErrorLogMetadata = defaultSafeErrorLogMetadata,
} = {}) => {
  const router = express.Router();

  if (!supabase) {
    logger.warn("supabase_sync_disabled", {
      message:
        "SUPABASE_URL/SUPABASE_ANON_KEY not set. /sync is disabled, but local analysis endpoints remain available.",
    });
  }

  router.post("/sync", async (req, res) => {
    try {
      if (!supabase) {
        return res.status(503).json({
          ok: false,
          message: "Supabase sync is unavailable because credentials are not configured.",
        });
      }

      const parsed = syncPayloadSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          message: "Invalid payload",
          errors: parsed.error.flatten(),
        });
      }

      const videoAnalytic = normalizeArray(parsed.data.video_analytic).map(mapVideoAnalytic);
      const excavatorType = normalizeArray(parsed.data.excavator_type).map(mapExcavatorType);
      const dumpTruckType = normalizeArray(parsed.data.dump_truck_type).map(mapDumpTruckType);
      const excavatorData = normalizeArray(parsed.data.excavator_data).map(mapExcavatorData);
      const dumpTruckData = normalizeArray(parsed.data.dump_truck_data).map(mapDumpTruckData);

      const results = {};
      results.video_analytic = await upsertRows("VIDEO_ANALITYC", videoAnalytic);
      results.excavator_type = await upsertRows("EXCAVATOR_TYPE", excavatorType);
      results.dump_truck_type = await upsertRows("DUMP_TRUCK_TYPE", dumpTruckType);
      results.excavator_data = await upsertRows("EXCAVATOR_DATA", excavatorData);
      results.dump_truck_data = await upsertRows("DUMP_TRUCK_DATA", dumpTruckData);

      logger.info("sync_completed", {
        requestId: req.requestId,
        tables: Object.fromEntries(
          Object.entries(results).map(([table, result]) => [table, result.count])
        ),
      });

      return res.json({ ok: true, results });
    } catch (error) {
      logger.error("sync_failed", {
        requestId: req.requestId,
        error: getSafeErrorLogMetadata(error),
      });
      return res.status(500).json({
        ok: false,
        message: "Sync failed",
      });
    }
  });

  return {
    router,
    syncPayloadSchema,
    upsertRows,
  };
};

module.exports = {
  createSupabaseUpsertRows,
  createSyncBoundary,
  syncPayloadSchema,
};
