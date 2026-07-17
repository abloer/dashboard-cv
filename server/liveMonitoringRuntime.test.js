const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { createLiveMonitoringRuntime } = require("./liveMonitoringRuntime");

const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

const createRuntime = ({
  jobs = [],
  now = () => new Date("2026-06-24T00:00:00.000Z"),
  runCommand = async () => {},
  validateSourcePreviewInput = async (source) => source,
} = {}) => {
  const enqueuedJobs = [];
  const commands = [];
  const errors = [];
  const failedMetrics = [];
  const sources = [
    {
      id: "camera-1",
      name: "Camera / One",
      type: "camera",
      source: "rtsp://camera.example/live?token=secret",
      status: "active",
      monitoringStatus: "running",
      executionMode: "scheduled",
      monitoringIntervalSeconds: 15,
      analytics: ["PPE"],
    },
  ];
  const runtime = createLiveMonitoringRuntime({
    analysisJobRepository: {
      get(id) {
        return jobs.find((job) => job.id === id) || null;
      },
      list() {
        return jobs;
      },
    },
    buildMonitoringClipPath(source) {
      return `/managed/monitoring/${source.id}.mp4`;
    },
    buildNoHelmetAnalysisJob(payload) {
      return {
        id: `job-${enqueuedJobs.length + 1}`,
        mediaSourceId: payload.mediaSourceId,
        moduleKey: "ppe.no-helmet",
        payload,
        status: "queued",
      };
    },
    enqueueAnalysisJob(job) {
      enqueuedJobs.push(job);
      return job;
    },
    ensureAnalysisDirectories() {},
    getModuleConfig() {
      return {
        modelPath: "/managed/models/no-helmet.pt",
        roiConfigPath: "/managed/configs/roi.json",
        roiId: "roi-a",
        confidenceThreshold: 0.5,
        iouThreshold: 0.4,
        topRatio: 0.35,
        helmetOverlapThreshold: 0.2,
        violationOnFrames: 3,
        cleanOffFrames: 2,
        frameStep: 5,
        imageSize: 640,
        personLabels: "person,worker",
        helmetLabels: "helmet",
        violationLabels: "no-helmet",
      };
    },
    getSafeErrorLogMetadata(error) {
      return { message: "[redacted]", code: error?.code || undefined };
    },
    logger: {
      error(event, fields) {
        errors.push({ event, fields });
      },
      info() {},
      warn() {},
      debug() {},
    },
    now,
    operationalMetrics: {
      recordJobFailed(metric) {
        failedMetrics.push(metric);
      },
    },
    readMediaRegistry() {
      return sources;
    },
    requireBinary: async () => {},
    runCommand: async (...args) => {
      commands.push(args);
      return runCommand(...args);
    },
    splitCommaSeparated(value) {
      return String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    },
    validateSourcePreviewInput,
  });

  return {
    commands,
    enqueuedJobs,
    errors,
    failedMetrics,
    runtime,
    sources,
  };
};

describe("live monitoring runtime", () => {
  it("enqueues scheduled monitoring analysis when interval is due", async () => {
    const { commands, enqueuedJobs, runtime } = createRuntime();

    runtime.refresh();
    await flushAsync();

    assert.equal(enqueuedJobs.length, 1);
    assert.equal(enqueuedJobs[0].mediaSourceId, "camera-1");
    assert.equal(enqueuedJobs[0].payload.personLabels.length, 2);
    assert.equal(commands.length, 1);
    assert.equal(commands[0][0], "ffmpeg");
    assert.equal(runtime.getRuntimeState("camera-1").status, "queued");
  });

  it("does not enqueue another job while a source already has pending work", async () => {
    const { commands, enqueuedJobs, runtime } = createRuntime({
      jobs: [{ id: "existing-job", mediaSourceId: "camera-1", status: "queued" }],
    });

    runtime.refresh();
    await flushAsync();

    assert.equal(enqueuedJobs.length, 0);
    assert.equal(commands.length, 0);
    assert.equal(runtime.getRuntimeState("camera-1"), null);
  });

  it("validates camera source through the source preview guard before ffmpeg", async () => {
    const validated = [];
    const { commands, runtime } = createRuntime({
      validateSourcePreviewInput: async (source) => {
        validated.push(source);
        return "rtsp://validated.example/live";
      },
    });

    runtime.refresh();
    await flushAsync();

    assert.equal(validated.length, 1);
    assert.equal(commands[0][1].includes("rtsp://validated.example/live"), true);
    assert.equal(commands[0][1].includes("rtsp://camera.example/live?token=secret"), false);
  });

  it("records sanitized failed state and safe log metadata on capture errors", async () => {
    const { errors, failedMetrics, runtime } = createRuntime({
      runCommand: async () => {
        const error = new Error("ffmpeg failed for /private/camera?token=secret");
        error.code = "FFMPEG_CAPTURE_FAILED";
        throw error;
      },
    });

    runtime.refresh();
    await flushAsync();
    await flushAsync();

    const state = runtime.getRuntimeState("camera-1");
    assert.equal(state.status, "failed");
    assert.equal(state.error, "Monitoring analysis failed (FFMPEG_CAPTURE_FAILED).");
    assert.doesNotMatch(JSON.stringify(state), /secret|\/private\/camera/);
    assert.equal(failedMetrics.length, 1);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].event, "live_monitoring_enqueue_failed");
    assert.doesNotMatch(JSON.stringify(errors[0]), /secret|\/private\/camera/);
  });
});
