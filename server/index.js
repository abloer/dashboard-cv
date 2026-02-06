const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");
const { z } = require("zod");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const { SUPABASE_URL, SUPABASE_ANON_KEY, PORT = 8080 } = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  AVG_CYCLETIME: row.avg_cycletime ?? null
});

const mapExcavatorType = (row) => ({
  ...(row.id !== undefined && { ID: row.id }),
  TYPE: row.type ?? null
});

const mapDumpTruckType = (row) => ({
  ...(row.id !== undefined && { ID: row.id }),
  TYPE: row.type ?? null,
  TURNING_RADIUS: row.turning_radius ?? null
});

const mapExcavatorData = (row) => ({
  ...(row.id !== undefined && { ID: row.id }),
  EXCAVATOR_TYPE_FK: row.excavator_type_fk ?? null,
  VIDEO_ANALITYC_FK: row.video_analityc_fk ?? null
});

const mapDumpTruckData = (row) => ({
  ...(row.id !== undefined && { ID: row.id }),
  VIDEO_ANALITYC_FK: row.video_analityc_fk ?? null,
  DUMP_TRUCK_TYPE_FK: row.dump_truck_type_fk ?? null,
  QUEUE_TIME: row.queue_time ?? null,
  ESTIMATED_LOAD: row.estimated_load ?? null
});

const normalizeArray = (value) => (Array.isArray(value) ? value : []);

const upsertRows = async (table, rows, onConflict = "ID") => {
  if (rows.length === 0) return { count: 0 };
  const { error, data } = await supabase
    .from(table)
    .upsert(rows, { onConflict });
  if (error) throw error;
  return { count: data ? data.length : rows.length };
};

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/sync", async (req, res) => {
  try {
    const payload = req.body || {};

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
      avg_cycletime: numberOrNull
    });

    const excavatorTypeSchema = z.object({
      id: idField,
      type: stringOrNull
    });

    const dumpTruckTypeSchema = z.object({
      id: idField,
      type: stringOrNull,
      turning_radius: numberOrNull
    });

    const excavatorDataSchema = z.object({
      id: idField,
      excavator_type_fk: z.number().int().positive().nullable().optional(),
      video_analityc_fk: z.number().int().positive().nullable().optional()
    });

    const dumpTruckDataSchema = z.object({
      id: idField,
      video_analityc_fk: z.number().int().positive().nullable().optional(),
      dump_truck_type_fk: z.number().int().positive().nullable().optional(),
      queue_time: numberOrNull,
      estimated_load: numberOrNull
    });

    const payloadSchema = z.object({
      video_analytic: z.array(videoAnalyticSchema).optional(),
      excavator_type: z.array(excavatorTypeSchema).optional(),
      dump_truck_type: z.array(dumpTruckTypeSchema).optional(),
      excavator_data: z.array(excavatorDataSchema).optional(),
      dump_truck_data: z.array(dumpTruckDataSchema).optional()
    });

    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid payload",
        errors: parsed.error.flatten()
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

    res.json({ ok: true, results });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error?.message || "Sync failed"
    });
  }
});

app.listen(Number(PORT), () => {
  console.log(`Sync server running on port ${PORT}`);
});
