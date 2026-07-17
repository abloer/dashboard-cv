const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const clone = (value) => JSON.parse(JSON.stringify(value));

class MediaSourceConflictError extends Error {
  constructor(message = "Media source version conflict.") {
    super(message);
    this.name = "MediaSourceConflictError";
    this.code = "MEDIA_SOURCE_VERSION_CONFLICT";
    this.statusCode = 409;
  }
}

const createJsonMediaSourceRepository = ({ filePath, defaultItems = [], normalizeItem = (item) => item }) => {
  if (!filePath) {
    throw new Error("filePath is required.");
  }

  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });

  const normalizeWithVersion = (item) => {
    const currentVersion = Number(item?.version);
    return normalizeItem({
      ...item,
      version: Number.isInteger(currentVersion) && currentVersion > 0 ? currentVersion : 1,
    });
  };

  const readItems = () => {
    if (!fs.existsSync(filePath)) {
      return defaultItems.map(normalizeWithVersion);
    }

    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeWithVersion) : defaultItems.map(normalizeWithVersion);
  };

  const atomicWriteItems = (items) => {
    const normalizedItems = items.map(normalizeWithVersion);
    const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(normalizedItems, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tempPath, filePath);
    return normalizedItems.map(clone);
  };

  const findIndex = (items, id) => items.findIndex((item) => item.id === id);

  const getExpectedVersion = (options = {}) => {
    const expectedVersion = Number(options.expectedVersion);
    return Number.isInteger(expectedVersion) && expectedVersion > 0 ? expectedVersion : null;
  };

  return {
    list() {
      return readItems().map(clone);
    },

    findById(id) {
      const item = readItems().find((candidate) => candidate.id === id);
      return item ? clone(item) : null;
    },

    create(item) {
      const items = readItems();
      const nowVersion = Number(item?.version);
      const committed = normalizeWithVersion({
        ...item,
        version: Number.isInteger(nowVersion) && nowVersion > 0 ? nowVersion : 1,
      });
      const nextItems = [committed, ...items];
      atomicWriteItems(nextItems);
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
        throw new MediaSourceConflictError();
      }

      const nextDraft = typeof updateFn === "function" ? updateFn(clone(current)) : updateFn;
      const updated = normalizeWithVersion({
        ...current,
        ...nextDraft,
        id: current.id,
        version: current.version + 1,
      });
      items[index] = updated;
      atomicWriteItems(items);
      return clone(updated);
    },

    delete(id, options = {}) {
      const items = readItems();
      const index = findIndex(items, id);
      if (index === -1) {
        return null;
      }

      const current = items[index];
      const expectedVersion = getExpectedVersion(options);
      if (expectedVersion !== null && current.version !== expectedVersion) {
        throw new MediaSourceConflictError();
      }

      const [removed] = items.splice(index, 1);
      atomicWriteItems(items);
      return clone(removed);
    },

    replaceAll(items) {
      return atomicWriteItems(Array.isArray(items) ? items : []);
    },
  };
};

module.exports = {
  MediaSourceConflictError,
  createJsonMediaSourceRepository,
};
