const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { createAuthBoundary } = require("./auth");
const { createSyncBoundary } = require("./sync");

const findRouteHandler = (router, method, routePath) => {
  const layer = router.stack.find(
    (item) => item.route?.path === routePath && item.route?.methods?.[method.toLowerCase()]
  );
  assert.ok(layer, `Route ${method} ${routePath} not found.`);
  const routeLayer = layer.route.stack[layer.route.stack.length - 1];
  assert.ok(routeLayer, `Handler ${method} ${routePath} not found.`);
  return routeLayer.handle;
};

const invokeRoute = async (router, method, routePath, { body, requestId = "req-sync-test" } = {}) => {
  const handler = findRouteHandler(router, method, routePath);
  const req = {
    body,
    requestId,
  };
  const res = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  await handler(req, res);
  return res;
};

const createMemoryLogger = () => {
  const events = [];
  const push = (level, event, fields) => events.push({ level, event, fields });
  return {
    events,
    debug(event, fields) {
      push("debug", event, fields);
    },
    info(event, fields) {
      push("info", event, fields);
    },
    warn(event, fields) {
      push("warn", event, fields);
    },
    error(event, fields) {
      push("error", event, fields);
    },
  };
};

describe("sync boundary", () => {
  it("keeps /sync admin-only through the auth boundary", () => {
    const authBoundary = createAuthBoundary({
      artifactAccess: { isSignedArtifactRequest: () => false },
      env: {
        AUTH_REQUIRED: "true",
        AUTH_TOKEN_OPERATOR: "operator-token",
        AUTH_TOKEN_ADMIN: "admin-token",
        AUTH_SESSION_SECRET: "session-secret",
      },
    });

    assert.equal(authBoundary.getRequiredRole({ method: "POST", path: "/sync" }), "admin");
  });

  it("returns the existing unavailable response when Supabase credentials are missing", async () => {
    const logger = createMemoryLogger();
    const boundary = createSyncBoundary({ logger, supabase: null });

    const response = await invokeRoute(boundary.router, "POST", "/sync", {
      body: { video_analytic: [] },
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.payload, {
      ok: false,
      message: "Supabase sync is unavailable because credentials are not configured.",
    });
    assert.equal(logger.events.some((item) => item.event === "supabase_sync_disabled"), true);
  });

  it("maps valid payload rows and upserts through the injected Supabase client", async () => {
    const calls = [];
    const logger = createMemoryLogger();
    const supabase = {
      from(table) {
        return {
          async upsert(rows, options) {
            calls.push({ table, rows, options });
            return { data: rows, error: null };
          },
        };
      },
    };
    const boundary = createSyncBoundary({ logger, supabase });

    const response = await invokeRoute(boundary.router, "POST", "/sync", {
      body: {
        video_analytic: [
          {
            id: 7,
            file_name: "shift-a.mp4",
            bench_height: 3.5,
            analityc_type: "loading",
          },
        ],
        excavator_type: [{ id: 2, type: "PC200" }],
        dump_truck_type: [{ id: 3, type: "HD785", turning_radius: 10 }],
        excavator_data: [{ id: 4, excavator_type_fk: 2, video_analityc_fk: 7 }],
        dump_truck_data: [
          {
            id: 5,
            video_analityc_fk: 7,
            dump_truck_type_fk: 3,
            queue_time: 12,
            estimated_load: 45,
          },
        ],
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload.results.video_analytic, { count: 1 });
    assert.equal(calls.length, 5);
    assert.deepEqual(calls[0], {
      table: "VIDEO_ANALITYC",
      options: { onConflict: "ID" },
      rows: [
        {
          ID: 7,
          FILE_NAME: "shift-a.mp4",
          BENCH_HEIGHT: 3.5,
          FRONT_LOADING_AREA_LENGTH: null,
          DIGGING_TIME: null,
          SWINGING_TIME: null,
          DUMPING_TIME: null,
          LOADING_TIME: null,
          ANALITYC_TYPE: "loading",
          LOCATION: null,
          OPERATOR: null,
          AVG_CYCLETIME: null,
        },
      ],
    });
    assert.equal(logger.events.some((item) => item.event === "sync_completed"), true);
  });

  it("returns a sanitized failure response and logs safe error metadata", async () => {
    const logger = createMemoryLogger();
    const secretMessage = "postgres://user:secret@localhost/private env SUPABASE_ANON_KEY=secret";
    const boundary = createSyncBoundary({
      logger,
      supabase: {},
      getSafeErrorLogMetadata: () => ({ code: "SYNC_UPSERT_FAILED", message: "[redacted]" }),
      upsertRows: async () => {
        throw new Error(secretMessage);
      },
    });

    const response = await invokeRoute(boundary.router, "POST", "/sync", {
      body: { video_analytic: [{ id: 1, file_name: "a.mp4" }] },
    });

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.payload, { ok: false, message: "Sync failed" });
    assert.doesNotMatch(JSON.stringify(response.payload), /secret|SUPABASE_ANON_KEY|private/);
    const failureLog = logger.events.find((item) => item.event === "sync_failed");
    assert.ok(failureLog);
    assert.doesNotMatch(JSON.stringify(failureLog), /secret|SUPABASE_ANON_KEY|private/);
  });
});
