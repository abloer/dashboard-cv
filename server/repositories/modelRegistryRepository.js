const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const clone = (value) => JSON.parse(JSON.stringify(value));

class ModelVersionConflictError extends Error {
  constructor(message = "Model version conflict.") {
    super(message);
    this.name = "ModelVersionConflictError";
    this.code = "MODEL_VERSION_CONFLICT";
    this.statusCode = 409;
  }
}

class ModelRegistryConflictError extends Error {
  constructor(message = "Model registry item conflict.", code = "MODEL_REGISTRY_CONFLICT") {
    super(message);
    this.name = "ModelRegistryConflictError";
    this.code = code;
    this.statusCode = 409;
  }
}

const normalizeVersion = (value) => {
  const version = Number(value);
  return Number.isInteger(version) && version > 0 ? version : 1;
};

const getExpectedVersion = (options = {}) => {
  const expectedVersion = Number(options.expectedVersion);
  return Number.isInteger(expectedVersion) && expectedVersion > 0 ? expectedVersion : null;
};

const atomicWriteJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
  return clone(value);
};

const createJsonModelVersionRepository = ({
  filePath,
  defaultItems = [],
  normalizeItem = (item) => item,
}) => {
  if (!filePath) {
    throw new Error("filePath is required.");
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const normalizeWithVersion = (item) =>
    normalizeItem({
      ...item,
      version: normalizeVersion(item?.version),
    });

  const readStoredItems = () => {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeWithVersion) : [];
  };

  const withDefaultItems = (items) => {
    const now = new Date().toISOString();
    let didChange = false;
    const nextItems = [...items];

    for (const seed of defaultItems) {
      const existingActive = nextItems.find((item) => item.moduleKey === seed.moduleKey && item.status === "active");
      const existingSeed = nextItems.find((item) => item.id === seed.id);
      if (existingActive || existingSeed) {
        continue;
      }
      nextItems.unshift(
        normalizeWithVersion({
          ...seed,
          createdAt: seed.createdAt || now,
          updatedAt: seed.updatedAt || now,
        })
      );
      didChange = true;
    }

    if (didChange) {
      writeItems(nextItems);
    }
    return nextItems;
  };

  const readItems = () => withDefaultItems(readStoredItems());
  const writeItems = (items) => atomicWriteJson(filePath, items.map(normalizeWithVersion));
  const findIndex = (items, id) => items.findIndex((item) => item.id === id);

  return {
    list() {
      return readItems().map(clone);
    },

    get(id) {
      const item = readItems().find((candidate) => candidate.id === id);
      return item ? clone(item) : null;
    },

    replaceAll(items) {
      return writeItems(Array.isArray(items) ? items : []);
    },

    upsert(item, options = {}) {
      const items = readItems();
      const index = findIndex(items, item.id);
      const now = new Date().toISOString();
      if (index === -1) {
        const committed = normalizeWithVersion({
          ...item,
          createdAt: item.createdAt || now,
          updatedAt: item.updatedAt || now,
        });
        writeItems([committed, ...items]);
        return clone(committed);
      }

      const current = items[index];
      const expectedVersion = getExpectedVersion(options);
      if (expectedVersion !== null && current.version !== expectedVersion) {
        throw new ModelVersionConflictError();
      }

      const updated = normalizeWithVersion({
        ...current,
        ...item,
        id: current.id,
        createdAt: current.createdAt,
        version: current.version + 1,
        updatedAt: item.updatedAt || now,
      });
      items[index] = updated;
      writeItems(items);
      return clone(updated);
    },

    deleteIf(id, predicate) {
      const items = readItems();
      const index = findIndex(items, id);
      if (index === -1 || (predicate && !predicate(items[index]))) {
        return null;
      }
      const [removed] = items.splice(index, 1);
      writeItems(items);
      return clone(removed);
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
        throw new ModelVersionConflictError();
      }

      const nextDraft = typeof updateFn === "function" ? updateFn(clone(current), clone(items)) : updateFn;
      const updated = normalizeWithVersion({
        ...current,
        ...nextDraft,
        id: current.id,
        version: current.version + 1,
        updatedAt: nextDraft.updatedAt || new Date().toISOString(),
      });
      items[index] = updated;
      writeItems(items);
      return clone(updated);
    },

    updateStatus(id, status, options = {}) {
      const items = readItems();
      const index = findIndex(items, id);
      if (index === -1) {
        return null;
      }

      const target = items[index];
      const expectedVersion = getExpectedVersion(options);
      if (expectedVersion !== null && target.version !== expectedVersion) {
        throw new ModelVersionConflictError();
      }

      const now = new Date().toISOString();
      const nextItems = items.map((item) => {
        if (status === "active" && item.moduleKey === target.moduleKey && item.status === "active" && item.id !== target.id) {
          return normalizeWithVersion({
            ...item,
            status: "approved",
            version: item.version + 1,
            updatedAt: now,
          });
        }
        if (item.id === target.id) {
          return normalizeWithVersion({
            ...item,
            status,
            version: item.version + 1,
            updatedAt: now,
          });
        }
        return item;
      });

      writeItems(nextItems);
      return clone(nextItems.find((item) => item.id === id));
    },
  };
};

const createJsonModelRegistryCollectionRepository = ({
  filePath,
  normalizeItem = (item) => item,
  conflictCode = "MODEL_REGISTRY_CONFLICT",
  conflictMessage = "Model registry item was modified by another request.",
}) => {
  if (!filePath) {
    throw new Error("filePath is required.");
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const normalizeWithVersion = (item) =>
    normalizeItem({
      ...item,
      version: normalizeVersion(item?.version),
    });

  const readItems = () => {
    if (!fs.existsSync(filePath)) {
      atomicWriteJson(filePath, []);
      return [];
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeWithVersion) : [];
  };

  const writeItems = (items) => atomicWriteJson(filePath, (Array.isArray(items) ? items : []).map(normalizeWithVersion));
  const findIndex = (items, id) => items.findIndex((item) => item.id === id);
  const assertExpectedVersion = (current, options = {}) => {
    const expectedVersion = getExpectedVersion(options);
    if (expectedVersion !== null && current.version !== expectedVersion) {
      throw new ModelRegistryConflictError(conflictMessage, conflictCode);
    }
  };

  return {
    list() {
      return readItems().map(clone);
    },

    get(id) {
      const item = readItems().find((candidate) => candidate.id === id);
      return item ? clone(item) : null;
    },

    replaceAll(items) {
      return writeItems(items);
    },

    create(item) {
      const items = readItems();
      const now = new Date().toISOString();
      const committed = normalizeWithVersion({
        ...item,
        createdAt: item.createdAt || now,
        updatedAt: item.updatedAt || now,
        version: 1,
      });
      writeItems([committed, ...items]);
      return clone(committed);
    },

    update(id, updateFn, options = {}) {
      const items = readItems();
      const index = findIndex(items, id);
      if (index === -1) {
        return null;
      }

      const current = items[index];
      assertExpectedVersion(current, options);

      const nextDraft = typeof updateFn === "function" ? updateFn(clone(current), clone(items)) : updateFn;
      const updated = normalizeWithVersion({
        ...current,
        ...nextDraft,
        id: current.id,
        createdAt: current.createdAt,
        version: current.version + 1,
        updatedAt: nextDraft.updatedAt || new Date().toISOString(),
      });
      items[index] = updated;
      writeItems(items);
      return clone(updated);
    },
  };
};

module.exports = {
  ModelRegistryConflictError,
  ModelVersionConflictError,
  createJsonModelRegistryCollectionRepository,
  createJsonModelVersionRepository,
};
