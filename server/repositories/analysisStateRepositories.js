const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const clone = (value) => JSON.parse(JSON.stringify(value));

class AnalysisJobConflictError extends Error {
  constructor(message = "Analysis job version conflict.") {
    super(message);
    this.name = "AnalysisJobConflictError";
    this.code = "ANALYSIS_JOB_VERSION_CONFLICT";
    this.statusCode = 409;
  }
}

const ensureDirectory = (filePath) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
};

const atomicWriteJson = (filePath, value) => {
  ensureDirectory(filePath);
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
  return clone(value);
};

const normalizeVersion = (value) => {
  const version = Number(value);
  return Number.isInteger(version) && version > 0 ? version : 1;
};

const getExpectedVersion = (options = {}) => {
  const expectedVersion = Number(options.expectedVersion);
  return Number.isInteger(expectedVersion) && expectedVersion > 0 ? expectedVersion : null;
};

const createJsonAnalysisHistoryRepository = ({ filePath, normalizeEntry = (entry) => entry }) => {
  if (!filePath) {
    throw new Error("filePath is required.");
  }
  ensureDirectory(filePath);

  const readItems = () => {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeEntry) : [];
  };

  const replaceAll = (items) => atomicWriteJson(filePath, (Array.isArray(items) ? items : []).map(normalizeEntry));

  return {
    list() {
      return readItems().map(clone);
    },

    append(entry) {
      const items = readItems();
      const committed = normalizeEntry(entry);
      const nextItems = [committed, ...items];
      replaceAll(nextItems);
      return clone(committed);
    },

    replaceAll,
  };
};

const createJsonAnalysisJobRepository = ({ filePath, normalizeJob = (job) => job }) => {
  if (!filePath) {
    throw new Error("filePath is required.");
  }
  ensureDirectory(filePath);

  const normalizeWithVersion = (job) =>
    normalizeJob({
      ...job,
      version: normalizeVersion(job?.version),
    });

  const readItems = () => {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeWithVersion) : [];
  };

  const writeItems = (items) => atomicWriteJson(filePath, items.map(normalizeWithVersion));
  const findIndex = (items, id) => items.findIndex((item) => item.id === id);

  return {
    list() {
      return readItems().map(clone);
    },

    get(id) {
      const job = readItems().find((item) => item.id === id);
      return job ? clone(job) : null;
    },

    create(job) {
      const items = readItems();
      const committed = normalizeWithVersion({
        ...job,
        version: normalizeVersion(job?.version),
      });
      writeItems([committed, ...items.filter((item) => item.id !== committed.id)]);
      return clone(committed);
    },

    update(id, updateFn, options = {}) {
      const items = readItems();
      const index = findIndex(items, id);
      if (index === -1) {
        return null;
      }

      const current = items[index];
      const expectedVersion = getExpectedVersion(options);
      if (expectedVersion !== null && current.version !== expectedVersion) {
        throw new AnalysisJobConflictError();
      }

      const nextDraft = typeof updateFn === "function" ? updateFn(clone(current)) : updateFn;
      const updated = normalizeWithVersion({
        ...current,
        ...nextDraft,
        id: current.id,
        version: current.version + 1,
      });
      items[index] = updated;
      writeItems(items);
      return clone(updated);
    },

    delete(id) {
      const items = readItems();
      const index = findIndex(items, id);
      if (index === -1) {
        return null;
      }
      const [removed] = items.splice(index, 1);
      writeItems(items);
      return clone(removed);
    },

    replaceAll(items) {
      return writeItems(Array.isArray(items) ? items : []);
    },
  };
};

module.exports = {
  AnalysisJobConflictError,
  createJsonAnalysisHistoryRepository,
  createJsonAnalysisJobRepository,
};
