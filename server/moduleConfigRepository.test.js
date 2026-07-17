const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const {
  ModuleConfigConflictError,
  createJsonModuleConfigRepository,
} = require("./repositories/moduleConfigRepository");

const createRepository = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "module-config-repository-test-"));
  const filePath = path.join(root, "module-configs.json");
  const repository = createJsonModuleConfigRepository({
    filePath,
    defaultConfigs: {
      "no-helmet": {
        modelPath: "default.pt",
        confidenceThreshold: "0.40",
      },
    },
    normalizeConfig: (moduleKey, config) => ({
      moduleKey,
      modelPath: config?.modelPath || "default.pt",
      confidenceThreshold: config?.confidenceThreshold || "0.40",
    }),
  });
  return { filePath, repository };
};

describe("moduleConfigRepository JSON adapter", () => {
  it("reads default config with version", () => {
    const { repository } = createRepository();

    const envelope = repository.get("no-helmet");

    assert.equal(envelope.version, 1);
    assert.equal(envelope.config.modelPath, "default.pt");
    assert.equal(envelope.config.confidenceThreshold, "0.40");
  });

  it("updates config with a valid expected version", () => {
    const { repository } = createRepository();
    const current = repository.get("no-helmet");

    const updated = repository.update(
      "no-helmet",
      { modelPath: "custom.pt", confidenceThreshold: "0.55" },
      { expectedVersion: current.version }
    );

    assert.equal(updated.version, current.version + 1);
    assert.equal(updated.config.modelPath, "custom.pt");
    assert.equal(repository.get("no-helmet").version, updated.version);
  });

  it("rejects stale updates with optimistic concurrency", () => {
    const { repository } = createRepository();
    const current = repository.get("no-helmet");
    repository.update("no-helmet", { modelPath: "first.pt" }, { expectedVersion: current.version });

    assert.throws(
      () => repository.update("no-helmet", { modelPath: "stale.pt" }, { expectedVersion: current.version }),
      ModuleConfigConflictError
    );
  });

  it("persists normalized envelopes atomically", () => {
    const { filePath, repository } = createRepository();
    const updated = repository.update(
      "no-helmet",
      { modelPath: "persisted.pt" },
      { expectedVersion: 1 }
    );

    const stored = JSON.parse(fs.readFileSync(filePath, "utf8"));
    assert.deepEqual(stored["no-helmet"], updated);
    assert.equal(stored["no-helmet"].config.confidenceThreshold, "0.40");
  });
});
