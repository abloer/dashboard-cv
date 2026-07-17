const crypto = require("node:crypto");

const { OperationalRepositoryConfigError } = require("./repositories/operationalRepositoryFactory");

const emptyCounts = () => ({
  create: 0,
  update: 0,
  skip: 0,
  conflict: 0,
});

const createSummary = () => ({
  mediaSources: emptyCounts(),
  analysisJobs: emptyCounts(),
  analysisHistory: emptyCounts(),
});

const normalizeVersion = (value) => {
  const version = Number(value);
  return Number.isInteger(version) && version > 0 ? version : 1;
};

const DEFAULT_COMPARISON_IGNORE_FIELDS = Object.freeze([
  "createdAt",
  "updatedAt",
  "created_at",
  "updated_at",
]);

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const normalizeIgnoreFields = (ignoreFields = DEFAULT_COMPARISON_IGNORE_FIELDS) =>
  new Set(Array.isArray(ignoreFields) ? ignoreFields : DEFAULT_COMPARISON_IGNORE_FIELDS);

const canonicalize = (value, ignoreFields = DEFAULT_COMPARISON_IGNORE_FIELDS) => {
  const ignored = normalizeIgnoreFields(ignoreFields);
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item, ignoreFields));
  }
  if (!isPlainObject(value)) {
    return value;
  }

  return Object.keys(value)
    .sort()
    .reduce((record, key) => {
      if (value[key] !== undefined && !ignored.has(key)) {
        record[key] = canonicalize(value[key], ignoreFields);
      }
      return record;
    }, {});
};

const createCanonicalChecksum = (item, options = {}) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize(item, options.ignoreFields)))
    .digest("hex");

const areCanonicalPayloadsEqual = (left, right, options = {}) =>
  createCanonicalChecksum(left, options) === createCanonicalChecksum(right, options);

const createConflictSamples = () => ({
  mediaSources: [],
  analysisJobs: [],
  analysisHistory: [],
});

const recordConflictSample = ({
  samples,
  entityKey,
  sourceItem,
  targetItem,
  reason,
  limit,
  comparisonIgnoreFields,
}) => {
  if (!samples || limit <= 0 || samples[entityKey].length >= limit) {
    return;
  }

  samples[entityKey].push({
    id: String(sourceItem?.id || ""),
    reason,
    sourceVersion: normalizeVersion(sourceItem?.version),
    targetVersion: targetItem ? normalizeVersion(targetItem.version) : null,
    sourceChecksum: createCanonicalChecksum(sourceItem, { ignoreFields: comparisonIgnoreFields }),
    targetChecksum: targetItem ? createCanonicalChecksum(targetItem, { ignoreFields: comparisonIgnoreFields }) : null,
  });
};

const listItems = async (repository) => Promise.resolve(repository.list());

const getTargetItem = async (repository, id, fallbackMap) => {
  if (typeof repository.get === "function") {
    return repository.get(id);
  }
  if (typeof repository.findById === "function") {
    return repository.findById(id);
  }
  return fallbackMap.get(id) || null;
};

const backfillMutableEntity = async ({
  sourceRepository,
  targetRepository,
  summary,
  samples,
  entityKey,
  apply,
  conflictSampleLimit,
  comparisonIgnoreFields,
}) => {
  const sourceItems = await listItems(sourceRepository);
  const targetItems = typeof targetRepository.list === "function" ? await listItems(targetRepository) : [];
  const targetById = new Map(targetItems.map((item) => [item.id, item]));

  for (const sourceItem of sourceItems) {
    const targetItem = await getTargetItem(targetRepository, sourceItem.id, targetById);
    if (!targetItem) {
      summary.create += 1;
      if (apply) {
        await targetRepository.create(sourceItem);
      }
      continue;
    }

    const sourceVersion = normalizeVersion(sourceItem.version);
    const targetVersion = normalizeVersion(targetItem.version);
    if (targetVersion === sourceVersion) {
      if (areCanonicalPayloadsEqual(sourceItem, targetItem, { ignoreFields: comparisonIgnoreFields })) {
        summary.skip += 1;
      } else {
        summary.conflict += 1;
        recordConflictSample({
          samples,
          entityKey,
          sourceItem,
          targetItem,
          reason: "payload_mismatch_same_version",
          limit: conflictSampleLimit,
          comparisonIgnoreFields,
        });
      }
      continue;
    }
    if (targetVersion > sourceVersion) {
      summary.conflict += 1;
      recordConflictSample({
        samples,
        entityKey,
        sourceItem,
        targetItem,
        reason: "target_newer",
        limit: conflictSampleLimit,
        comparisonIgnoreFields,
      });
      continue;
    }

    summary.update += 1;
    if (apply) {
      await targetRepository.update(sourceItem.id, sourceItem, { expectedVersion: targetVersion });
    }
  }
};

const backfillAppendOnlyEntity = async ({
  sourceRepository,
  targetRepository,
  summary,
  samples,
  entityKey,
  apply,
  conflictSampleLimit,
  comparisonIgnoreFields,
}) => {
  const sourceItems = await listItems(sourceRepository);
  const targetItems = await listItems(targetRepository);
  const targetById = new Map(targetItems.map((item) => [item.id, item]));

  for (const sourceItem of sourceItems) {
    const targetItem = targetById.get(sourceItem.id);
    if (!targetItem) {
      summary.create += 1;
      if (apply) {
        await targetRepository.append(sourceItem);
      }
      continue;
    }
    if (
      normalizeVersion(targetItem.version) === normalizeVersion(sourceItem.version) &&
      areCanonicalPayloadsEqual(sourceItem, targetItem, { ignoreFields: comparisonIgnoreFields })
    ) {
      summary.skip += 1;
      continue;
    }
    summary.conflict += 1;
    recordConflictSample({
      samples,
      entityKey,
      sourceItem,
      targetItem,
      reason: "append_duplicate_mismatch",
      limit: conflictSampleLimit,
      comparisonIgnoreFields,
    });
  }
};

const countSummaryConflicts = (summary = {}) =>
  Object.values(summary).reduce((total, counts) => total + Number(counts?.conflict || 0), 0);

const buildOperationalBackfillReport = (result, { includeConflictSamples = false } = {}) => {
  const report = {
    ok: Boolean(result?.ok),
    mode: result?.mode || "dry-run",
    summary: result?.summary || createSummary(),
  };

  if (includeConflictSamples && result?.conflictSamples) {
    report.conflictSamples = result.conflictSamples;
  }

  return report;
};

const getOperationalBackfillExitCode = (report, { strictConflicts = false } = {}) =>
  strictConflicts && countSummaryConflicts(report?.summary) > 0 ? 1 : 0;

const runOperationalBackfill = async ({
  sourceRepositories,
  targetRepositories,
  apply = false,
  applyConfirmation = "",
  conflictSampleLimit = 0,
  comparisonIgnoreFields = DEFAULT_COMPARISON_IGNORE_FIELDS,
} = {}) => {
  if (!sourceRepositories || !targetRepositories) {
    throw new OperationalRepositoryConfigError("Source and target repositories are required for operational backfill.");
  }
  if (apply && applyConfirmation !== "apply") {
    throw new OperationalRepositoryConfigError("Backfill apply requires applyConfirmation=apply.");
  }

  const summary = createSummary();
  const conflictSamples = createConflictSamples();
  await backfillMutableEntity({
    sourceRepository: sourceRepositories.mediaSourceRepository,
    targetRepository: targetRepositories.mediaSourceRepository,
    summary: summary.mediaSources,
    samples: conflictSamples,
    entityKey: "mediaSources",
    apply,
    conflictSampleLimit,
    comparisonIgnoreFields,
  });
  await backfillMutableEntity({
    sourceRepository: sourceRepositories.analysisJobRepository,
    targetRepository: targetRepositories.analysisJobRepository,
    summary: summary.analysisJobs,
    samples: conflictSamples,
    entityKey: "analysisJobs",
    apply,
    conflictSampleLimit,
    comparisonIgnoreFields,
  });
  await backfillAppendOnlyEntity({
    sourceRepository: sourceRepositories.analysisHistoryRepository,
    targetRepository: targetRepositories.analysisHistoryRepository,
    summary: summary.analysisHistory,
    samples: conflictSamples,
    entityKey: "analysisHistory",
    apply,
    conflictSampleLimit,
    comparisonIgnoreFields,
  });

  return {
    ok: true,
    mode: apply ? "apply" : "dry-run",
    summary,
    conflictSamples,
  };
};

module.exports = {
  DEFAULT_COMPARISON_IGNORE_FIELDS,
  buildOperationalBackfillReport,
  createCanonicalChecksum,
  getOperationalBackfillExitCode,
  runOperationalBackfill,
};
