const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const {
  createSourcePreviewUploadBoundary,
} = require("./sourcePreviewUploads");

const createClientInputError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const findRouteHandler = (router, method, routePath) => {
  const layer = router.stack.find(
    (item) => item.route?.path === routePath && item.route?.methods?.[method.toLowerCase()]
  );
  assert.ok(layer, `Route ${method} ${routePath} not found.`);
  const routeLayer = layer.route.stack[layer.route.stack.length - 1];
  assert.ok(routeLayer, `Handler ${method} ${routePath} not found.`);
  return routeLayer.handle;
};

const invokeRoute = async (router, method, routePath, { body, query = {}, headers = {} } = {}) => {
  const handler = findRouteHandler(router, method, routePath);
  const req = {
    body,
    query,
    protocol: "http",
    get(name) {
      return headers[name.toLowerCase()] || "localhost:5173";
    },
    header(name) {
      return headers[name.toLowerCase()];
    },
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

const createBoundary = ({ allowPrivateSourcePreviewIps = false } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "source-preview-boundary-"));
  const uploadRoot = path.join(root, "uploads");
  const previewRoot = path.join(root, "previews");
  fs.mkdirSync(uploadRoot, { recursive: true });
  fs.mkdirSync(previewRoot, { recursive: true });

  const commands = [];
  let uploadedBytes = 0;
  const resolveManagedVideoPath = (candidate) => {
    if (!candidate || !path.isAbsolute(candidate) || !fs.existsSync(candidate)) {
      throw createClientInputError("Video path is not inside an allowed server-managed directory.");
    }
    const realUploadRoot = fs.realpathSync.native(uploadRoot);
    const realCandidate = fs.realpathSync.native(candidate);
    const relativePath = path.relative(realUploadRoot, realCandidate);
    if (relativePath === "" || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      throw createClientInputError("Video path is not inside an allowed server-managed directory.");
    }
    return realCandidate;
  };
  const boundary = createSourcePreviewUploadBoundary({
    allowedSourcePreviewSchemes: new Set(["rtsp"]),
    allowPrivateSourcePreviewIps,
    ensureAnalysisDirectories() {
      fs.mkdirSync(uploadRoot, { recursive: true });
      fs.mkdirSync(previewRoot, { recursive: true });
    },
    operationalMetrics: {
      recordUpload(sizeBytes) {
        uploadedBytes += sizeBytes;
      },
    },
    previewRoot,
    publicSnapshotUrl: (_req, snapshotPath) => `/analysis-output/${path.basename(snapshotPath)}`,
    resolveManagedVideoPath,
    runCommand: async (binary, args) => {
      commands.push({ binary, args });
      if (binary === "ffprobe") {
        return {
          stdout: JSON.stringify({
            streams: [{ width: 1920, height: 1080, avg_frame_rate: "30/1" }],
            format: { duration: "10" },
          }),
        };
      }
      if (binary === "ffmpeg") {
        const outputPath = args[args.length - 1];
        fs.writeFileSync(outputPath, "preview");
      }
      return { stdout: "" };
    },
    uploadRoot,
  });

  return {
    boundary,
    commands,
    getUploadedBytes: () => uploadedBytes,
    root,
    uploadRoot,
  };
};

describe("source preview/upload boundary", () => {
  it("uploads video into the managed upload root and records upload metrics", async () => {
    const { boundary, getUploadedBytes, uploadRoot } = createBoundary();

    const response = await invokeRoute(boundary.router, "POST", "/analysis/upload-video", {
      body: Buffer.from("video-bytes"),
      query: { filename: "../unsafe name.mp4" },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.ok, true);
    assert.equal(response.payload.fileName.includes("/"), false);
    assert.equal(response.payload.fileName.includes("\\"), false);
    assert.match(response.payload.fileName, /unsafe-name\.mp4$/);
    assert.equal(response.payload.sizeBytes, "video-bytes".length);
    assert.equal(getUploadedBytes(), "video-bytes".length);
    assert.equal(path.dirname(response.payload.videoPath), uploadRoot);
    assert.ok(fs.existsSync(response.payload.videoPath));
  });

  it("deletes only videos inside the managed upload root", async () => {
    const { boundary, uploadRoot } = createBoundary();
    const managedVideoPath = path.join(uploadRoot, "managed.mp4");
    const outsideVideoPath = path.join(os.tmpdir(), `outside-${Date.now()}.mp4`);
    fs.writeFileSync(managedVideoPath, "managed");
    fs.writeFileSync(outsideVideoPath, "outside");

    const rejected = await invokeRoute(boundary.router, "DELETE", "/analysis/upload-video", {
      query: { videoPath: outsideVideoPath },
    });
    assert.equal(rejected.statusCode, 400);
    assert.equal(fs.existsSync(outsideVideoPath), true);
    assert.doesNotMatch(JSON.stringify(rejected.payload), new RegExp(outsideVideoPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const deleted = await invokeRoute(boundary.router, "DELETE", "/analysis/upload-video", {
      query: { videoPath: managedVideoPath },
    });
    assert.equal(deleted.statusCode, 200);
    assert.equal(fs.existsSync(managedVideoPath), false);
  });

  it("rejects video preview for unmanaged paths without leaking the raw path", async () => {
    const { boundary } = createBoundary();
    const outsideVideoPath = path.join(os.tmpdir(), `unmanaged-${Date.now()}.mp4`);
    fs.writeFileSync(outsideVideoPath, "outside");

    const response = await invokeRoute(boundary.router, "POST", "/analysis/video-preview", {
      body: { videoPath: outsideVideoPath },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.payload.stdout, "");
    assert.equal(response.payload.stderr, "");
    assert.doesNotMatch(JSON.stringify(response.payload), new RegExp(outsideVideoPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("rejects disallowed source preview schemes and private IPs before ffmpeg", async () => {
    const { boundary, commands } = createBoundary();

    const disallowedScheme = await invokeRoute(boundary.router, "POST", "/analysis/source-preview", {
      body: { source: "file:///etc/passwd?token=secret" },
    });
    assert.equal(disallowedScheme.statusCode, 400);
    assert.equal(disallowedScheme.payload.stdout, "");
    assert.equal(disallowedScheme.payload.stderr, "");
    assert.doesNotMatch(JSON.stringify(disallowedScheme.payload), /secret|\/etc\/passwd/);

    const privateIp = await invokeRoute(boundary.router, "POST", "/analysis/source-preview", {
      body: { source: "rtsp://192.168.1.10/live?token=secret" },
    });
    assert.equal(privateIp.statusCode, 400);
    assert.equal(privateIp.payload.stdout, "");
    assert.equal(privateIp.payload.stderr, "");
    assert.doesNotMatch(JSON.stringify(privateIp.payload), /secret|192\.168\.1\.10/);
    assert.equal(commands.some((item) => item.binary === "ffmpeg"), false);
  });
});
