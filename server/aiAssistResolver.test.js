const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const {
  DEFAULT_AI_ASSIST_CONFIG,
  createAiAssistBoundary,
} = require("./aiAssist");

const createMockResponse = (payload, ok = true) => ({
  ok,
  json: async () => payload,
});

const findRouteHandler = (router, method, routePath) => {
  const layer = router.stack.find(
    (item) => item.route?.path === routePath && item.route?.methods?.[method.toLowerCase()]
  );
  assert.ok(layer, `Route ${method} ${routePath} not found.`);
  const routeLayer = layer.route.stack.find((item) => item.method === method.toLowerCase());
  assert.ok(routeLayer, `Handler ${method} ${routePath} not found.`);
  return routeLayer.handle;
};

const invokeRoute = async (router, method, routePath, { body = {} } = {}) => {
  const handler = findRouteHandler(router, method, routePath);
  const req = { body };
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

const createAiAssistTestBoundary = ({ root, fetchCalls }) => {
  const configPath = path.join(root, "ai-assist-config.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        ...DEFAULT_AI_ASSIST_CONFIG,
        enabled: true,
        mode: "remote-openai",
        baseUrl: "http://ai-provider.test/v1",
        gemmaModel: "gemma-test",
      },
      null,
      2
    )
  );

  return createAiAssistBoundary({
    aiAssistConfigPath: configPath,
    analysisOutputRoot: root,
    fetchImpl: async (_url, options) => {
      fetchCalls.push(JSON.parse(options.body));
      return createMockResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                verdict: "needs_review",
                confidence: "medium",
                rationale: "mocked",
                recommendedAction: "review",
              }),
            },
          },
        ],
      });
    },
  });
};

const invokeNeedsReview = (router, snapshotUrl) =>
  invokeRoute(router, "POST", "/ai-assist/needs-review-verdict", {
    body: {
      finding: {
        title: "Needs review",
        detail: "Snapshot should be checked.",
        recommendation: "Review manually.",
        sourceName: "Gate Camera",
        sourceLocation: "North Gate",
        snapshotUrl,
      },
    },
  });

const getImageUrlFromProviderBody = (body) =>
  body?.messages?.[1]?.content?.find?.((item) => item?.type === "image_url")?.image_url?.url || null;

describe("AI assist snapshot path resolver", () => {
  it("rejects absolute local paths outside the analysis output root", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-assist-root-"));
    const outsideFile = path.join(os.tmpdir(), `ai-assist-outside-${Date.now()}.jpg`);
    fs.writeFileSync(outsideFile, "not-an-artifact");
    const fetchCalls = [];
    const boundary = createAiAssistTestBoundary({ root, fetchCalls });

    const response = await invokeNeedsReview(boundary.router, outsideFile);

    assert.equal(response.statusCode, 200);
    assert.equal(fetchCalls.length, 1);
    assert.equal(getImageUrlFromProviderBody(fetchCalls[0]), null);
  });

  it("rejects traversal paths that resolve outside the analysis output root", async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "ai-assist-parent-"));
    const root = path.join(parent, "analysis-output");
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(parent, "outside.jpg"), "outside");
    const fetchCalls = [];
    const boundary = createAiAssistTestBoundary({ root, fetchCalls });

    const response = await invokeNeedsReview(boundary.router, "/analysis-output/../outside.jpg");

    assert.equal(response.statusCode, 200);
    assert.equal(fetchCalls.length, 1);
    assert.equal(getImageUrlFromProviderBody(fetchCalls[0]), null);
  });

  it("rejects symlinks that point outside the analysis output root", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-assist-root-"));
    const outsideFile = path.join(os.tmpdir(), `ai-assist-symlink-target-${Date.now()}.jpg`);
    fs.writeFileSync(outsideFile, "outside");
    const linkPath = path.join(root, "linked-outside.jpg");
    try {
      fs.symlinkSync(outsideFile, linkPath);
    } catch (error) {
      if (error?.code === "EPERM" || error?.code === "EACCES") {
        return;
      }
      throw error;
    }
    const fetchCalls = [];
    const boundary = createAiAssistTestBoundary({ root, fetchCalls });

    const response = await invokeNeedsReview(boundary.router, "/analysis-output/linked-outside.jpg");

    assert.equal(response.statusCode, 200);
    assert.equal(fetchCalls.length, 1);
    assert.equal(getImageUrlFromProviderBody(fetchCalls[0]), null);
  });

  it("accepts valid /analysis-output artifacts under the analysis output root", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-assist-root-"));
    fs.mkdirSync(path.join(root, "snapshots"));
    fs.writeFileSync(path.join(root, "snapshots", "valid.jpg"), "valid-artifact");
    const fetchCalls = [];
    const boundary = createAiAssistTestBoundary({ root, fetchCalls });

    const response = await invokeNeedsReview(boundary.router, "/analysis-output/snapshots/valid.jpg");

    assert.equal(response.statusCode, 200);
    assert.equal(fetchCalls.length, 1);
    assert.match(getImageUrlFromProviderBody(fetchCalls[0]), /^data:image\/jpeg;base64,/);
  });

  it("does not call external AI provider when AI assist is disabled", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-assist-root-"));
    const configPath = path.join(root, "ai-assist-config.json");
    fs.writeFileSync(configPath, JSON.stringify({ ...DEFAULT_AI_ASSIST_CONFIG, enabled: false }, null, 2));
    const fetchCalls = [];
    const boundary = createAiAssistBoundary({
      aiAssistConfigPath: configPath,
      analysisOutputRoot: root,
      fetchImpl: async () => {
        fetchCalls.push({});
        return createMockResponse({});
      },
    });

    const response = await invokeNeedsReview(boundary.router, "/analysis-output/snapshots/valid.jpg");

    assert.equal(response.statusCode, 400);
    assert.equal(fetchCalls.length, 0);
    assert.match(response.payload.message, /AI assist belum diaktifkan/);
  });
});
