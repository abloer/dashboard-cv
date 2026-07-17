const { randomUUID } = require("crypto");
const express = require("express");
const { z } = require("zod");
const {
  ModelRegistryConflictError,
  ModelVersionConflictError,
} = require("./repositories/modelRegistryRepository");

const modelModuleKeySchema = z.enum([
  "ppe.no-helmet",
  "ppe.no-safety-vest",
  "ppe.no-life-vest",
  "hse.safety-rules",
  "hse.working-at-height",
  "operations.red-light-violation",
  "operations.dump-truck-bed-open",
]);
const modelDomainSchema = z.enum(["PPE", "HSE", "Operations"]);

const modelDatasetSchema = z.object({
  id: z.string().trim().min(1),
  version: z.number().int().positive().default(1),
  name: z.string().trim().min(1),
  domain: modelDomainSchema,
  labels: z.array(z.string().trim().min(1)),
  sourceType: z.enum(["upload", "camera", "mixed"]),
  imageCount: z.number().int().min(0),
  annotationCount: z.number().int().min(0),
  status: z.enum(["draft", "ready", "archived"]),
  description: z.string(),
  storagePath: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

const createModelDatasetPayloadSchema = z.object({
  name: z.string().trim().min(1),
  domain: modelDomainSchema,
  labels: z.array(z.string().trim().min(1)).min(1),
  sourceType: z.enum(["upload", "camera", "mixed"]),
  imageCount: z.number().int().min(0).default(0),
  annotationCount: z.number().int().min(0).default(0),
  status: z.enum(["draft", "ready", "archived"]).default("draft"),
  description: z.string().default(""),
  storagePath: z.string().trim().min(1),
});

const updateModelDatasetPayloadSchema = z.object({
  expectedVersion: z.number().int().positive(),
  name: z.string().trim().min(1).optional(),
  domain: modelDomainSchema.optional(),
  labels: z.array(z.string().trim().min(1)).min(1).optional(),
  sourceType: z.enum(["upload", "camera", "mixed"]).optional(),
  imageCount: z.number().int().min(0).optional(),
  annotationCount: z.number().int().min(0).optional(),
  status: z.enum(["draft", "ready", "archived"]).optional(),
  description: z.string().optional(),
  storagePath: z.string().trim().min(1).optional(),
});

const modelTrainingJobSchema = z.object({
  id: z.string().trim().min(1),
  version: z.number().int().positive().default(1),
  datasetId: z.string().trim().min(1),
  datasetName: z.string().trim().min(1),
  domain: modelDomainSchema,
  targetModule: modelModuleKeySchema,
  baseModelPath: z.string().trim().min(1),
  outputModelPath: z.string().trim().min(1).nullable(),
  labels: z.array(z.string().trim().min(1)),
  status: z.enum(["queued", "running", "completed", "failed"]),
  epochs: z.number().int().min(1),
  imageSize: z.number().int().min(1),
  notes: z.string(),
  metrics: z.record(z.number()),
  createdAt: z.string().trim().min(1),
  startedAt: z.string().trim().min(1).nullable(),
  endedAt: z.string().trim().min(1).nullable(),
  updatedAt: z.string().trim().min(1),
});

const createModelTrainingJobPayloadSchema = z.object({
  datasetId: z.string().trim().min(1),
  targetModule: modelModuleKeySchema,
  baseModelPath: z.string().trim().min(1),
  epochs: z.number().int().min(1).default(50),
  imageSize: z.number().int().min(1).default(1280),
  notes: z.string().default(""),
});

const updateModelTrainingJobPayloadSchema = z.object({
  expectedVersion: z.number().int().positive(),
  status: z.enum(["queued", "running", "completed", "failed"]).optional(),
  outputModelPath: z.string().trim().min(1).nullable().optional(),
  notes: z.string().optional(),
  metrics: z.record(z.number()).optional(),
});

const modelVersionSchema = z.object({
  id: z.string().trim().min(1),
  version: z.number().int().positive().default(1),
  name: z.string().trim().min(1),
  moduleKey: modelModuleKeySchema,
  domain: modelDomainSchema,
  labels: z.array(z.string().trim().min(1)),
  modelPath: z.string().trim().min(1),
  sourceJobId: z.string().trim().min(1).nullable(),
  evaluationSummary: z.string(),
  status: z.enum(["candidate", "approved", "active", "rejected"]),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

const modelEvaluationSchema = z.object({
  id: z.string().trim().min(1),
  version: z.number().int().positive().default(1),
  modelVersionId: z.string().trim().min(1),
  modelName: z.string().trim().min(1),
  moduleKey: modelModuleKeySchema,
  domain: modelDomainSchema,
  status: z.enum(["draft", "reviewed", "approved", "rejected"]),
  precision: z.number().min(0).max(1).nullable(),
  recall: z.number().min(0).max(1).nullable(),
  map50: z.number().min(0).max(1).nullable(),
  falsePositiveNotes: z.string(),
  falseNegativeNotes: z.string(),
  benchmarkNotes: z.string(),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

const modelBenchmarkSchema = z.object({
  id: z.string().trim().min(1),
  version: z.number().int().positive().default(1),
  datasetId: z.string().trim().min(1),
  datasetName: z.string().trim().min(1),
  modelVersionId: z.string().trim().min(1),
  modelName: z.string().trim().min(1),
  moduleKey: modelModuleKeySchema,
  domain: modelDomainSchema,
  baselineModelPath: z.string().trim().min(1),
  recommendation: z.enum(["keep-current", "replace-model", "fine-tune"]),
  status: z.enum(["draft", "reviewed", "approved"]),
  precisionDelta: z.number().nullable(),
  recallDelta: z.number().nullable(),
  falsePositiveDelta: z.number().nullable(),
  falseNegativeDelta: z.number().nullable(),
  benchmarkNotes: z.string(),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

const createModelEvaluationPayloadSchema = z.object({
  modelVersionId: z.string().trim().min(1),
  status: z.enum(["draft", "reviewed", "approved", "rejected"]).default("draft"),
  precision: z.number().min(0).max(1).nullable().default(null),
  recall: z.number().min(0).max(1).nullable().default(null),
  map50: z.number().min(0).max(1).nullable().default(null),
  falsePositiveNotes: z.string().default(""),
  falseNegativeNotes: z.string().default(""),
  benchmarkNotes: z.string().default(""),
});

const updateModelEvaluationPayloadSchema = z.object({
  expectedVersion: z.number().int().positive(),
  status: z.enum(["draft", "reviewed", "approved", "rejected"]).optional(),
  precision: z.number().min(0).max(1).nullable().optional(),
  recall: z.number().min(0).max(1).nullable().optional(),
  map50: z.number().min(0).max(1).nullable().optional(),
  falsePositiveNotes: z.string().optional(),
  falseNegativeNotes: z.string().optional(),
  benchmarkNotes: z.string().optional(),
});

const createModelBenchmarkPayloadSchema = z.object({
  datasetId: z.string().trim().min(1),
  modelVersionId: z.string().trim().min(1),
  baselineModelPath: z.string().trim().min(1),
  recommendation: z.enum(["keep-current", "replace-model", "fine-tune"]).default("keep-current"),
  status: z.enum(["draft", "reviewed", "approved"]).default("draft"),
  precisionDelta: z.number().nullable().default(null),
  recallDelta: z.number().nullable().default(null),
  falsePositiveDelta: z.number().nullable().default(null),
  falseNegativeDelta: z.number().nullable().default(null),
  benchmarkNotes: z.string().default(""),
});

const updateModelBenchmarkPayloadSchema = z.object({
  expectedVersion: z.number().int().positive(),
  baselineModelPath: z.string().trim().min(1).optional(),
  recommendation: z.enum(["keep-current", "replace-model", "fine-tune"]).optional(),
  status: z.enum(["draft", "reviewed", "approved"]).optional(),
  precisionDelta: z.number().nullable().optional(),
  recallDelta: z.number().nullable().optional(),
  falsePositiveDelta: z.number().nullable().optional(),
  falseNegativeDelta: z.number().nullable().optional(),
  benchmarkNotes: z.string().optional(),
});

const updateModelVersionPayloadSchema = z.object({
  status: z.enum(["candidate", "approved", "active", "rejected"]),
  expectedVersion: z.number().int().positive(),
});

const normalizeModelRegistryItem = (schema, defaults = {}) => (item) => {
  const parsed = schema.safeParse(item);
  if (parsed.success) {
    return parsed.data;
  }
  const now = new Date().toISOString();
  return {
    ...defaults,
    ...item,
    labels: Array.isArray(item?.labels) ? item.labels : defaults.labels || [],
    createdAt: item?.createdAt || now,
    updatedAt: item?.updatedAt || now,
  };
};

const createDefaultModelVersionSeeds = ({
  defaultModelPath,
  lifeVestBaselineModelPath,
  operationsGeneralModelPath,
}) => [
  {
    id: "model-version-ppe-no-helmet-default",
    name: "Construction Safety Baseline",
    moduleKey: "ppe.no-helmet",
    domain: "PPE",
    labels: ["person", "hardhat", "no-hardhat"],
    modelPath: defaultModelPath,
    sourceJobId: null,
    evaluationSummary:
      "Baseline model komunitas yang saat ini dipakai untuk inference PPE helmet pada area konstruksi.",
    status: "active",
  },
  {
    id: "model-version-ppe-no-safety-vest-default",
    name: "Safety Vest Baseline",
    moduleKey: "ppe.no-safety-vest",
    domain: "PPE",
    labels: ["person", "safety-vest"],
    modelPath: defaultModelPath,
    sourceJobId: null,
    evaluationSummary:
      "Baseline awal untuk modul rompi keselamatan. Disarankan diganti dengan model vest khusus melalui Training Jobs dan Deployment Gate.",
    status: "active",
  },
  {
    id: "model-version-ppe-no-life-vest-default",
    name: "Life Vest Baseline",
    moduleKey: "ppe.no-life-vest",
    domain: "PPE",
    labels: ["person", "life-vest"],
    modelPath: lifeVestBaselineModelPath,
    sourceJobId: null,
    evaluationSummary:
      "Baseline awal terpisah untuk modul pelampung/life vest. Path model ini disiapkan khusus agar dapat diganti dengan model life vest domain perairan melalui Training Jobs dan Deployment Gate.",
    status: "active",
  },
  {
    id: "model-version-hse-safety-rules-default",
    name: "Safety Rules Baseline",
    moduleKey: "hse.safety-rules",
    domain: "HSE",
    labels: ["person", "vehicle", "hardhat", "safety-vest"],
    modelPath: defaultModelPath,
    sourceJobId: null,
    evaluationSummary:
      "Baseline policy HSE yang memakai evidence PPE/HSE default sebelum kandidat model khusus diaktifkan.",
    status: "active",
  },
  {
    id: "model-version-hse-working-at-height-default",
    name: "Working at Height Baseline",
    moduleKey: "hse.working-at-height",
    domain: "HSE",
    labels: ["person"],
    modelPath: defaultModelPath,
    sourceJobId: null,
    evaluationSummary:
      "Baseline awal untuk modul working at height berbasis detector person dan zone area ketinggian.",
    status: "active",
  },
  {
    id: "model-version-operations-red-light-default",
    name: "Operations General Baseline",
    moduleKey: "operations.red-light-violation",
    domain: "Operations",
    labels: ["vehicle", "red-light", "green-light"],
    modelPath: operationsGeneralModelPath,
    sourceJobId: null,
    evaluationSummary:
      "Baseline umum Operations berbasis detector kendaraan dan traffic light resmi Ultralytics. Dipakai sebagai starting point untuk red light violation sebelum model domain tambang yang lebih spesifik tersedia.",
    status: "active",
  },
  {
    id: "model-version-operations-dump-truck-default",
    name: "Dump Truck Operations Baseline",
    moduleKey: "operations.dump-truck-bed-open",
    domain: "Operations",
    labels: ["dump-truck", "bed-open", "bed-closed"],
    modelPath: operationsGeneralModelPath,
    sourceJobId: null,
    evaluationSummary:
      "Baseline umum Operations berbasis detector kendaraan resmi Ultralytics. Dipakai sebagai starting point modul dump truck sebelum model state bak terbuka/tertutup khusus tersedia.",
    status: "active",
  },
];

const sortUpdatedDesc = (items) =>
  items.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

const buildCandidateModelVersionFromTrainingJob = (job) => {
  if (!job.outputModelPath || job.status !== "completed") {
    return null;
  }

  const now = new Date().toISOString();
  return {
    id: `model-version-${job.id}`,
    name: `${job.datasetName} Candidate`,
    moduleKey: job.targetModule,
    domain: job.domain,
    labels: job.labels,
    modelPath: job.outputModelPath,
    sourceJobId: job.id,
    evaluationSummary:
      "Kandidat model hasil training job. Menunggu evaluasi lapangan dan approval sebelum bisa dijadikan active.",
    status: "candidate",
    createdAt: now,
    updatedAt: now,
  };
};

const buildEvaluationSummary = (evaluation) => {
  const metricParts = [
    typeof evaluation.precision === "number" ? `P ${evaluation.precision.toFixed(2)}` : null,
    typeof evaluation.recall === "number" ? `R ${evaluation.recall.toFixed(2)}` : null,
    typeof evaluation.map50 === "number" ? `mAP50 ${evaluation.map50.toFixed(2)}` : null,
  ].filter(Boolean);

  return metricParts.length > 0
    ? `Evaluation ${evaluation.status}: ${metricParts.join(" • ")}`
    : `Evaluation ${evaluation.status} tanpa metrik numerik.`;
};

const sendModelVersionMutationError = (res, error, fallbackMessage) => {
  if (error instanceof ModelVersionConflictError || error?.code === "MODEL_VERSION_CONFLICT") {
    return res.status(409).json({
      ok: false,
      code: "MODEL_VERSION_CONFLICT",
      message: "Model version was modified by another request. Refresh and retry.",
    });
  }

  return res.status(error?.statusCode || 500).json({
    ok: false,
    code: error?.code || undefined,
    message: error?.statusCode ? error.message : fallbackMessage,
  });
};

const sendModelRegistryMutationError = (res, error, fallbackMessage) => {
  if (error instanceof ModelRegistryConflictError || error?.statusCode === 409) {
    return res.status(409).json({
      ok: false,
      code: error.code || "MODEL_REGISTRY_CONFLICT",
      message: error.message || "Model registry item was modified by another request. Refresh and retry.",
    });
  }

  return res.status(error?.statusCode || 500).json({
    ok: false,
    code: error?.code || undefined,
    message: error?.statusCode ? error.message : fallbackMessage,
  });
};

const createModelRegistryBoundary = ({
  datasetRepository,
  trainingJobRepository,
  versionRepository,
  evaluationRepository,
  benchmarkRepository,
}) => {
  const readModelDatasets = () => datasetRepository.list();
  const writeModelDatasets = (items) => datasetRepository.replaceAll(items);
  const readModelTrainingJobs = () => trainingJobRepository.list();
  const writeModelTrainingJobs = (items) => trainingJobRepository.replaceAll(items);
  const readModelVersions = () => versionRepository.list();
  const writeModelVersions = (items) => versionRepository.replaceAll(items);
  const readModelEvaluations = () => evaluationRepository.list();
  const writeModelEvaluations = (items) => evaluationRepository.replaceAll(items);
  const readModelBenchmarks = () => benchmarkRepository.list();
  const writeModelBenchmarks = (items) => benchmarkRepository.replaceAll(items);

  const getActiveModelVersion = (moduleKey) => {
    if (!moduleKey) return null;
    return (
      readModelVersions()
        .filter((item) => item.moduleKey === moduleKey)
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
        .find((item) => item.status === "active") || null
    );
  };

  const buildModelsOverview = () => {
    const datasets = readModelDatasets();
    const trainingJobs = readModelTrainingJobs();
    const modelVersions = readModelVersions();

    return {
      totals: {
        datasets: datasets.length,
        readyDatasets: datasets.filter((item) => item.status === "ready").length,
        draftDatasets: datasets.filter((item) => item.status === "draft").length,
        trainingJobs: trainingJobs.length,
        runningTrainingJobs: trainingJobs.filter((item) => item.status === "running").length,
        modelVersions: modelVersions.length,
        activeModels: modelVersions.filter((item) => item.status === "active").length,
      },
      domainSplit: {
        PPE: datasets.filter((item) => item.domain === "PPE").length,
        HSE: datasets.filter((item) => item.domain === "HSE").length,
        Operations: datasets.filter((item) => item.domain === "Operations").length,
      },
      activeModelsByModule: modelVersions
        .filter((item) => item.status === "active")
        .map((item) => ({
          id: item.id,
          name: item.name,
          moduleKey: item.moduleKey,
          domain: item.domain,
          labels: item.labels,
          modelPath: item.modelPath,
          updatedAt: item.updatedAt,
        })),
      latestDatasetAt:
        datasets.length > 0
          ? datasets
              .map((item) => item.updatedAt)
              .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0]
          : null,
    };
  };

  const isTrainingJobCompatibleWithDataset = (job, dataset) => {
    if (dataset.domain === "PPE") {
      return ["ppe.no-helmet", "ppe.no-safety-vest", "ppe.no-life-vest"].includes(job.targetModule);
    }
    if (dataset.domain === "HSE") {
      return ["hse.safety-rules", "hse.working-at-height"].includes(job.targetModule);
    }
    if (dataset.domain === "Operations") {
      return ["operations.red-light-violation", "operations.dump-truck-bed-open"].includes(job.targetModule);
    }
    return false;
  };

  const syncModelVersionForTrainingJob = (job) => {
    const existing = readModelVersions().find((item) => item.sourceJobId === job.id);
    const candidate = buildCandidateModelVersionFromTrainingJob(job);
    if (!candidate) {
      if (existing?.status === "candidate") {
        versionRepository.deleteIf(existing.id, (item) => item.status === "candidate");
      }
      return;
    }
    versionRepository.upsert({
      ...(existing || {}),
      ...candidate,
      id: existing?.id || candidate.id,
      createdAt: existing?.createdAt || candidate.createdAt,
      updatedAt: new Date().toISOString(),
    });
  };

  const syncModelVersionForEvaluation = (evaluation) => {
    const current = versionRepository.get(evaluation.modelVersionId);
    if (!current) return;
    const nextStatus =
      evaluation.status === "approved"
        ? current.status === "active"
          ? "active"
          : "approved"
        : evaluation.status === "rejected"
          ? current.status === "active"
            ? "active"
            : "rejected"
          : current.status;
    versionRepository.update(current.id, {
      status: nextStatus,
      evaluationSummary: buildEvaluationSummary(evaluation),
      updatedAt: new Date().toISOString(),
    });
  };

  const router = express.Router();

  router.get("/models/overview", (_req, res) => res.json({ ok: true, overview: buildModelsOverview() }));
  router.get("/models/datasets", (_req, res) => res.json({ ok: true, items: sortUpdatedDesc(readModelDatasets()) }));
  router.get("/models/training-jobs", (_req, res) => res.json({ ok: true, items: sortUpdatedDesc(readModelTrainingJobs()) }));
  router.get("/models/versions", (_req, res) => res.json({ ok: true, items: sortUpdatedDesc(readModelVersions()) }));
  router.get("/models/evaluations", (_req, res) => res.json({ ok: true, items: sortUpdatedDesc(readModelEvaluations()) }));
  router.get("/models/benchmarks", (_req, res) => res.json({ ok: true, items: sortUpdatedDesc(readModelBenchmarks()) }));

  router.post("/models/datasets", (req, res) => {
    const parsed = createModelDatasetPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Invalid model dataset payload.", errors: parsed.error.flatten() });
    }
    const now = new Date().toISOString();
    const committed = datasetRepository.create({
      id: `dataset-${Date.now()}-${randomUUID().slice(0, 8)}`,
      ...parsed.data,
      createdAt: now,
      updatedAt: now,
    });
    return res.status(201).json({ ok: true, item: committed, overview: buildModelsOverview() });
  });

  router.patch("/models/datasets/:id", (req, res) => {
    const parsed = updateModelDatasetPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Invalid model dataset update payload.", errors: parsed.error.flatten() });
    }
    const { expectedVersion, ...patch } = parsed.data;
    try {
      const updated = datasetRepository.update(req.params.id, { ...patch, updatedAt: new Date().toISOString() }, { expectedVersion });
      if (!updated) return res.status(404).json({ ok: false, message: "Model dataset not found." });
      return res.json({ ok: true, item: updated, overview: buildModelsOverview() });
    } catch (error) {
      return sendModelRegistryMutationError(res, error, "Model dataset update failed.");
    }
  });

  router.patch("/models/versions/:id", (req, res) => {
    const parsed = updateModelVersionPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Invalid model version update payload.", errors: parsed.error.flatten() });
    }
    try {
      const updated = versionRepository.updateStatus(req.params.id, parsed.data.status, { expectedVersion: parsed.data.expectedVersion });
      if (!updated) return res.status(404).json({ ok: false, message: "Model version not found." });
      return res.json({ ok: true, item: updated, overview: buildModelsOverview() });
    } catch (error) {
      return sendModelVersionMutationError(res, error, "Model version update failed.");
    }
  });

  router.post("/models/training-jobs", (req, res) => {
    const parsed = createModelTrainingJobPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Invalid training job payload.", errors: parsed.error.flatten() });
    }
    const dataset = readModelDatasets().find((item) => item.id === parsed.data.datasetId);
    if (!dataset) return res.status(404).json({ ok: false, message: "Model dataset not found." });
    if (dataset.status !== "ready") {
      return res.status(400).json({ ok: false, message: "Only datasets with status 'ready' can start training jobs." });
    }
    if (!isTrainingJobCompatibleWithDataset({ targetModule: parsed.data.targetModule, domain: dataset.domain }, dataset)) {
      return res.status(400).json({ ok: false, message: "Dataset domain and target module are not compatible." });
    }
    const now = new Date().toISOString();
    const committed = trainingJobRepository.create({
      id: `train-${Date.now()}-${randomUUID().slice(0, 8)}`,
      datasetId: dataset.id,
      datasetName: dataset.name,
      domain: dataset.domain,
      targetModule: parsed.data.targetModule,
      baseModelPath: parsed.data.baseModelPath,
      outputModelPath: null,
      labels: dataset.labels,
      status: "queued",
      epochs: parsed.data.epochs,
      imageSize: parsed.data.imageSize,
      notes: parsed.data.notes,
      metrics: {},
      createdAt: now,
      startedAt: null,
      endedAt: null,
      updatedAt: now,
    });
    return res.status(201).json({ ok: true, item: committed, overview: buildModelsOverview() });
  });

  router.patch("/models/training-jobs/:id", (req, res) => {
    const parsed = updateModelTrainingJobPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Invalid training job update payload.", errors: parsed.error.flatten() });
    }
    const { expectedVersion, ...patch } = parsed.data;
    try {
      const updated = trainingJobRepository.update(req.params.id, (current) => {
        const nextStatus = patch.status || current.status;
        const now = new Date().toISOString();
        return {
          ...patch,
          status: nextStatus,
          startedAt: nextStatus === "running" ? current.startedAt || now : nextStatus === "queued" ? null : current.startedAt,
          endedAt: nextStatus === "completed" || nextStatus === "failed" ? now : nextStatus === "running" || nextStatus === "queued" ? null : current.endedAt,
          updatedAt: now,
        };
      }, { expectedVersion });
      if (!updated) return res.status(404).json({ ok: false, message: "Training job not found." });
      syncModelVersionForTrainingJob(updated);
      return res.json({ ok: true, item: updated, overview: buildModelsOverview() });
    } catch (error) {
      return sendModelRegistryMutationError(res, error, "Training job update failed.");
    }
  });

  router.post("/models/evaluations", (req, res) => {
    const parsed = createModelEvaluationPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Invalid model evaluation payload.", errors: parsed.error.flatten() });
    }
    const modelVersion = readModelVersions().find((item) => item.id === parsed.data.modelVersionId);
    if (!modelVersion) return res.status(404).json({ ok: false, message: "Model version not found." });
    const now = new Date().toISOString();
    const committed = evaluationRepository.create({
      id: `evaluation-${Date.now()}-${randomUUID().slice(0, 8)}`,
      modelVersionId: modelVersion.id,
      modelName: modelVersion.name,
      moduleKey: modelVersion.moduleKey,
      domain: modelVersion.domain,
      ...parsed.data,
      createdAt: now,
      updatedAt: now,
    });
    syncModelVersionForEvaluation(committed);
    return res.status(201).json({ ok: true, item: committed, overview: buildModelsOverview() });
  });

  router.patch("/models/evaluations/:id", (req, res) => {
    const parsed = updateModelEvaluationPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Invalid model evaluation update payload.", errors: parsed.error.flatten() });
    }
    const { expectedVersion, ...patch } = parsed.data;
    try {
      const updated = evaluationRepository.update(req.params.id, { ...patch, updatedAt: new Date().toISOString() }, { expectedVersion });
      if (!updated) return res.status(404).json({ ok: false, message: "Model evaluation not found." });
      syncModelVersionForEvaluation(updated);
      return res.json({ ok: true, item: updated, overview: buildModelsOverview() });
    } catch (error) {
      return sendModelRegistryMutationError(res, error, "Model evaluation update failed.");
    }
  });

  router.post("/models/benchmarks", (req, res) => {
    const parsed = createModelBenchmarkPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Invalid model benchmark payload.", errors: parsed.error.flatten() });
    }
    const dataset = readModelDatasets().find((item) => item.id === parsed.data.datasetId);
    if (!dataset) return res.status(404).json({ ok: false, message: "Dataset not found." });
    const modelVersion = readModelVersions().find((item) => item.id === parsed.data.modelVersionId);
    if (!modelVersion) return res.status(404).json({ ok: false, message: "Model version not found." });
    const now = new Date().toISOString();
    const committed = benchmarkRepository.create({
      id: `benchmark-${Date.now()}-${randomUUID().slice(0, 8)}`,
      datasetId: dataset.id,
      datasetName: dataset.name,
      modelVersionId: modelVersion.id,
      modelName: modelVersion.name,
      moduleKey: modelVersion.moduleKey,
      domain: modelVersion.domain,
      ...parsed.data,
      createdAt: now,
      updatedAt: now,
    });
    return res.status(201).json({ ok: true, item: committed, overview: buildModelsOverview() });
  });

  router.patch("/models/benchmarks/:id", (req, res) => {
    const parsed = updateModelBenchmarkPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Invalid model benchmark update payload.", errors: parsed.error.flatten() });
    }
    const { expectedVersion, ...patch } = parsed.data;
    try {
      const updated = benchmarkRepository.update(req.params.id, { ...patch, updatedAt: new Date().toISOString() }, { expectedVersion });
      if (!updated) return res.status(404).json({ ok: false, message: "Model benchmark not found." });
      return res.json({ ok: true, item: updated, overview: buildModelsOverview() });
    } catch (error) {
      return sendModelRegistryMutationError(res, error, "Model benchmark update failed.");
    }
  });

  return {
    buildModelsOverview,
    getActiveModelVersion,
    readModelBenchmarks,
    readModelDatasets,
    readModelEvaluations,
    readModelTrainingJobs,
    readModelVersions,
    router,
    writeModelBenchmarks,
    writeModelDatasets,
    writeModelEvaluations,
    writeModelTrainingJobs,
    writeModelVersions,
  };
};

module.exports = {
  buildCandidateModelVersionFromTrainingJob,
  createDefaultModelVersionSeeds,
  createModelRegistryBoundary,
  modelBenchmarkSchema,
  modelDatasetSchema,
  modelEvaluationSchema,
  modelTrainingJobSchema,
  modelVersionSchema,
  normalizeModelRegistryItem,
};
