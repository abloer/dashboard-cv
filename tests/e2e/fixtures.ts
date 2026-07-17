import type { Page, Route } from "@playwright/test";

type MediaSourceFixture = {
  id: string;
  version: number;
  name: string;
  location: string;
  source: string;
  type: "upload" | "camera";
  status: "active" | "inactive" | "maintenance";
  analytics: string[];
  executionMode: "manual" | "scheduled" | "continuous";
  monitoringStatus: "idle" | "running" | "paused";
  monitoringIntervalSeconds: number | null;
  lastSeen: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

const now = "2026-05-26T00:00:00.000Z";

const initialSources = (): MediaSourceFixture[] => [
  {
    id: "source-upload-1",
    version: 1,
    name: "Gate Upload Fixture",
    location: "Gate 1",
    source: "/runtime-analysis/uploads/gate.mp4",
    type: "upload",
    status: "active",
    analytics: ["PPE", "HSE"],
    executionMode: "manual",
    monitoringStatus: "idle",
    monitoringIntervalSeconds: null,
    lastSeen: "fixture",
    note: "Fixture upload source",
    createdAt: now,
    updatedAt: now,
  },
];

const json = (value: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(value),
});

const readBody = async (route: Route) => {
  const request = route.request();
  return request.postDataJSON?.() ?? JSON.parse(request.postData() || "{}");
};

export const installApiFixtures = async (page: Page) => {
  let mediaSources = initialSources();

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.hostname !== "127.0.0.1" || url.port !== "8081") {
      await route.continue();
      return;
    }

    if (url.pathname === "/media-sources" && request.method() === "GET") {
      await route.fulfill(json({ ok: true, items: mediaSources }));
      return;
    }

    if (url.pathname === "/media-sources" && request.method() === "POST") {
      const body = await readBody(route);
      const item: MediaSourceFixture = {
        id: "source-camera-1",
        version: 1,
        name: body.name,
        location: body.location,
        source: body.source,
        type: body.type,
        status: body.status,
        analytics: body.analytics,
        executionMode: body.executionMode,
        monitoringStatus: body.monitoringStatus ?? "idle",
        monitoringIntervalSeconds: body.monitoringIntervalSeconds ?? null,
        lastSeen: body.lastSeen ?? "fixture",
        note: body.note,
        createdAt: now,
        updatedAt: now,
      };
      mediaSources = [item, ...mediaSources];
      await route.fulfill(json({ ok: true, item }));
      return;
    }

    const mediaSourceMatch = url.pathname.match(/^\/media-sources\/([^/]+)$/);
    if (mediaSourceMatch && request.method() === "PUT") {
      const sourceId = decodeURIComponent(mediaSourceMatch[1]);
      const body = await readBody(route);
      const current = mediaSources.find((item) => item.id === sourceId);
      if (!current) {
        await route.fulfill(json({ ok: false, message: "Not found." }, 404));
        return;
      }
      const item: MediaSourceFixture = {
        ...current,
        ...body,
        id: current.id,
        version: current.version + 1,
        updatedAt: now,
      };
      mediaSources = mediaSources.map((source) => (source.id === sourceId ? item : source));
      await route.fulfill(json({ ok: true, item }));
      return;
    }

    if (url.pathname === "/dashboard-summary") {
      await route.fulfill(
        json({
          ok: true,
          summary: {
            totalSources: mediaSources.length,
            activeSources: mediaSources.filter((item) => item.status === "active").length,
            uploadSources: mediaSources.filter((item) => item.type === "upload").length,
            cameraSources: mediaSources.filter((item) => item.type === "camera").length,
            monitoringSources: 0,
            analyzedSourceCount: 0,
            totalNoHelmetRuns: 0,
            totalNoHelmetEvents: 0,
            totalViolatorTracks: 0,
            latestRunAt: null,
            latestRunSourceName: null,
            totalEvents: 0,
            sourceSummaries: [],
            latestAnalysisSummary: null,
            recentRuns: [],
          },
        })
      );
      return;
    }

    if (url.pathname === "/analysis/no-helmet/defaults") {
      await route.fulfill(
        json({
          ok: true,
          defaultModelPath: "/models/no-helmet.pt",
          defaultRoiConfigPath: "/configs/no-helmet-roi.json",
          analysisOutputRoot: "/runtime-analysis",
        })
      );
      return;
    }

    if (url.pathname === "/analysis/no-safety-vest/defaults" || url.pathname === "/analysis/no-life-vest/defaults") {
      await route.fulfill(json({ ok: true, defaultModelPath: "/models/ppe.pt" }));
      return;
    }

    if (url.pathname === "/analysis/working-at-height/defaults") {
      await route.fulfill(
        json({
          ok: true,
          defaultModelPath: "/models/working-at-height.pt",
          defaultZoneConfigPath: "/configs/working-at-height-zone.json",
        })
      );
      return;
    }

    if (url.pathname === "/analysis/red-light-violation/defaults") {
      await route.fulfill(
        json({
          ok: true,
          defaultVehicleModelPath: "/models/vehicle.pt",
          defaultTrafficLightModelPath: "/models/traffic-light.pt",
          defaultStopLineConfigPath: "/configs/stop-line.json",
        })
      );
      return;
    }

    if (url.pathname === "/analysis/dump-truck-bed-open/defaults") {
      await route.fulfill(
        json({
          ok: true,
          defaultModelPath: "/models/dump-truck.pt",
          defaultRoiConfigPath: "/configs/dump-truck-roi.json",
        })
      );
      return;
    }

    if (url.pathname.startsWith("/analysis/hse-safety-rules/source/")) {
      await route.fulfill(
        json({
          ok: true,
          source: null,
          latestAnalysisSummary: null,
          latestDetectionSummary: null,
          latestPpeByModule: {
            noHelmet: null,
            noSafetyVest: null,
            noLifeVest: null,
          },
          latestDetectionByModule: {
            noHelmet: null,
            noSafetyVest: null,
            noLifeVest: null,
          },
        })
      );
      return;
    }

    if (url.pathname === "/models/overview") {
      await route.fulfill(
        json({
          ok: true,
          overview: {
            totals: {
              datasets: 0,
              readyDatasets: 0,
              draftDatasets: 0,
              trainingJobs: 0,
              runningTrainingJobs: 0,
              modelVersions: 0,
              activeModels: 0,
            },
            domainSplit: { PPE: 0, HSE: 0, Operations: 0 },
            activeModelsByModule: [],
            latestDatasetAt: null,
          },
        })
      );
      return;
    }

    if (
      [
        "/models/datasets",
        "/models/training-jobs",
        "/models/versions",
        "/models/evaluations",
        "/models/benchmarks",
      ].includes(url.pathname)
    ) {
      await route.fulfill(json({ ok: true, items: [] }));
      return;
    }

    if (url.pathname.startsWith("/analysis/")) {
      await route.fulfill(json({ ok: true }));
      return;
    }

    await route.fulfill(json({ ok: true }));
  });
};
