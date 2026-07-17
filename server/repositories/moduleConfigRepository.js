const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const clone = (value) => JSON.parse(JSON.stringify(value));

class ModuleConfigConflictError extends Error {
  constructor(message = "Module config version conflict.") {
    super(message);
    this.name = "ModuleConfigConflictError";
    this.code = "MODULE_CONFIG_VERSION_CONFLICT";
    this.statusCode = 409;
  }
}

const createJsonModuleConfigRepository = ({ filePath, defaultConfigs = {}, normalizeConfig = (_key, config) => config }) => {
  if (!filePath) {
    throw new Error("filePath is required.");
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const normalizeEnvelope = (moduleKey, value) => {
    const isEnvelope = value && typeof value === "object" && !Array.isArray(value) && "config" in value;
    const rawVersion = Number(isEnvelope ? value.version : 1);
    const config = normalizeConfig(moduleKey, isEnvelope ? value.config : value);
    return {
      version: Number.isInteger(rawVersion) && rawVersion > 0 ? rawVersion : 1,
      config,
    };
  };

  const readStore = () => {
    if (!fs.existsSync(filePath)) {
      return {};
    }

    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  };

  const readEnvelopes = () => {
    const store = readStore();
    const moduleKeys = Array.from(new Set([...Object.keys(defaultConfigs), ...Object.keys(store)]));
    return moduleKeys.reduce((items, moduleKey) => {
      const value = Object.prototype.hasOwnProperty.call(store, moduleKey)
        ? store[moduleKey]
        : defaultConfigs[moduleKey];
      items[moduleKey] = normalizeEnvelope(moduleKey, value);
      return items;
    }, {});
  };

  const atomicWrite = (items) => {
    const normalized = Object.entries(items || {}).reduce((next, [moduleKey, value]) => {
      next[moduleKey] = normalizeEnvelope(moduleKey, value);
      return next;
    }, {});
    const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tempPath, filePath);
    return clone(normalized);
  };

  const getExpectedVersion = (options = {}) => {
    const expectedVersion = Number(options.expectedVersion);
    return Number.isInteger(expectedVersion) && expectedVersion > 0 ? expectedVersion : null;
  };

  return {
    get(moduleKey) {
      const items = readEnvelopes();
      return items[moduleKey] ? clone(items[moduleKey]) : null;
    },

    list() {
      return clone(readEnvelopes());
    },

    update(moduleKey, config, options = {}) {
      const items = readEnvelopes();
      const current = items[moduleKey] || normalizeEnvelope(moduleKey, defaultConfigs[moduleKey] || {});
      const expectedVersion = getExpectedVersion(options);
      if (expectedVersion !== null && current.version !== expectedVersion) {
        throw new ModuleConfigConflictError();
      }

      const updated = normalizeEnvelope(moduleKey, {
        version: current.version + 1,
        config,
      });
      items[moduleKey] = updated;
      atomicWrite(items);
      return clone(updated);
    },

    replaceAll(items) {
      return atomicWrite(items);
    },
  };
};

module.exports = {
  ModuleConfigConflictError,
  createJsonModuleConfigRepository,
};
