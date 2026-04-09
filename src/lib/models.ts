import { analysisServerBaseUrl } from "@/lib/noHelmetAnalysis";

export type ModelDatasetDomain = "PPE" | "HSE" | "Operations";
export type ModelDatasetStatus = "draft" | "ready" | "archived";
export type ModelDatasetSourceType = "upload" | "camera" | "mixed";
export type ModelTrainingJobStatus = "queued" | "running" | "completed" | "failed";
export type ModelTargetModule =
  | "ppe.no-helmet"
  | "ppe.no-safety-vest"
  | "ppe.no-life-vest"
  | "hse.safety-rules"
  | "hse.working-at-height"
  | "operations.red-light-violation"
  | "operations.dump-truck-bed-open";
export type ModelVersionStatus = "candidate" | "approved" | "active" | "rejected";
export type ModelEvaluationStatus = "draft" | "reviewed" | "approved" | "rejected";
export type ModelBenchmarkStatus = "draft" | "reviewed" | "approved";
export type ModelBenchmarkRecommendation = "keep-current" | "replace-model" | "fine-tune";

export interface ModelDataset {
  id: string;
  name: string;
  domain: ModelDatasetDomain;
  labels: string[];
  sourceType: ModelDatasetSourceType;
  imageCount: number;
  annotationCount: number;
  status: ModelDatasetStatus;
  description: string;
  storagePath: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelsOverview {
  totals: {
    datasets: number;
    readyDatasets: number;
    draftDatasets: number;
    trainingJobs: number;
    runningTrainingJobs: number;
    modelVersions: number;
    activeModels: number;
  };
  domainSplit: {
    PPE: number;
    HSE: number;
    Operations: number;
  };
  activeModelsByModule: Array<{
    id: string;
    name: string;
    moduleKey: string;
    domain: ModelDatasetDomain;
    labels: string[];
    modelPath: string;
    updatedAt: string;
  }>;
  latestDatasetAt: string | null;
}

export interface ModelTrainingJob {
  id: string;
  datasetId: string;
  datasetName: string;
  domain: ModelDatasetDomain;
  targetModule: ModelTargetModule;
  baseModelPath: string;
  outputModelPath: string | null;
  labels: string[];
  status: ModelTrainingJobStatus;
  epochs: number;
  imageSize: number;
  notes: string;
  metrics: Record<string, number>;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  updatedAt: string;
}

export interface ModelVersion {
  id: string;
  name: string;
  moduleKey: ModelTargetModule;
  domain: ModelDatasetDomain;
  labels: string[];
  modelPath: string;
  sourceJobId: string | null;
  evaluationSummary: string;
  status: ModelVersionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ModelEvaluation {
  id: string;
  modelVersionId: string;
  modelName: string;
  moduleKey: ModelTargetModule;
  domain: ModelDatasetDomain;
  status: ModelEvaluationStatus;
  precision: number | null;
  recall: number | null;
  map50: number | null;
  falsePositiveNotes: string;
  falseNegativeNotes: string;
  benchmarkNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelBenchmark {
  id: string;
  datasetId: string;
  datasetName: string;
  modelVersionId: string;
  modelName: string;
  moduleKey: ModelTargetModule;
  domain: ModelDatasetDomain;
  baselineModelPath: string;
  recommendation: ModelBenchmarkRecommendation;
  status: ModelBenchmarkStatus;
  precisionDelta: number | null;
  recallDelta: number | null;
  falsePositiveDelta: number | null;
  falseNegativeDelta: number | null;
  benchmarkNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateModelDatasetPayload {
  name: string;
  domain: ModelDatasetDomain;
  labels: string[];
  sourceType: ModelDatasetSourceType;
  imageCount: number;
  annotationCount: number;
  status: ModelDatasetStatus;
  description: string;
  storagePath: string;
}

export interface UpdateModelDatasetPayload {
  name?: string;
  domain?: ModelDatasetDomain;
  labels?: string[];
  sourceType?: ModelDatasetSourceType;
  imageCount?: number;
  annotationCount?: number;
  status?: ModelDatasetStatus;
  description?: string;
  storagePath?: string;
}

export interface CreateModelTrainingJobPayload {
  datasetId: string;
  targetModule: ModelTargetModule;
  baseModelPath: string;
  epochs: number;
  imageSize: number;
  notes: string;
}

export interface UpdateModelTrainingJobPayload {
  status?: ModelTrainingJobStatus;
  outputModelPath?: string | null;
  notes?: string;
  metrics?: Record<string, number>;
}

export interface CreateModelEvaluationPayload {
  modelVersionId: string;
  status: ModelEvaluationStatus;
  precision: number | null;
  recall: number | null;
  map50: number | null;
  falsePositiveNotes: string;
  falseNegativeNotes: string;
  benchmarkNotes: string;
}

export interface UpdateModelEvaluationPayload {
  status?: ModelEvaluationStatus;
  precision?: number | null;
  recall?: number | null;
  map50?: number | null;
  falsePositiveNotes?: string;
  falseNegativeNotes?: string;
  benchmarkNotes?: string;
}

export interface UpdateModelVersionPayload {
  status: ModelVersionStatus;
}

export interface CreateModelBenchmarkPayload {
  datasetId: string;
  modelVersionId: string;
  baselineModelPath: string;
  recommendation: ModelBenchmarkRecommendation;
  status: ModelBenchmarkStatus;
  precisionDelta: number | null;
  recallDelta: number | null;
  falsePositiveDelta: number | null;
  falseNegativeDelta: number | null;
  benchmarkNotes: string;
}

export interface UpdateModelBenchmarkPayload {
  baselineModelPath?: string;
  recommendation?: ModelBenchmarkRecommendation;
  status?: ModelBenchmarkStatus;
  precisionDelta?: number | null;
  recallDelta?: number | null;
  falsePositiveDelta?: number | null;
  falseNegativeDelta?: number | null;
  benchmarkNotes?: string;
}

interface ModelsOverviewResponse {
  ok: boolean;
  overview: ModelsOverview;
}

interface ModelDatasetsResponse {
  ok: boolean;
  items: ModelDataset[];
}

interface ModelDatasetMutationResponse {
  ok: boolean;
  item: ModelDataset;
  overview: ModelsOverview;
}

interface ModelTrainingJobsResponse {
  ok: boolean;
  items: ModelTrainingJob[];
}

interface ModelTrainingJobMutationResponse {
  ok: boolean;
  item: ModelTrainingJob;
  overview: ModelsOverview;
}

interface ModelVersionsResponse {
  ok: boolean;
  items: ModelVersion[];
}

interface ModelEvaluationsResponse {
  ok: boolean;
  items: ModelEvaluation[];
}

interface ModelEvaluationMutationResponse {
  ok: boolean;
  item: ModelEvaluation;
  overview: ModelsOverview;
}

interface ModelBenchmarksResponse {
  ok: boolean;
  items: ModelBenchmark[];
}

interface ModelBenchmarkMutationResponse {
  ok: boolean;
  item: ModelBenchmark;
  overview: ModelsOverview;
}

interface ModelVersionMutationResponse {
  ok: boolean;
  item: ModelVersion;
  overview: ModelsOverview;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "Request failed.");
  }
  return payload as T;
}

export async function getModelsOverview(): Promise<ModelsOverview> {
  const response = await fetch(`${analysisServerBaseUrl}/models/overview`);
  const payload = await parseResponse<ModelsOverviewResponse>(response);
  return payload.overview;
}

export async function getModelDatasets(): Promise<ModelDataset[]> {
  const response = await fetch(`${analysisServerBaseUrl}/models/datasets`);
  const payload = await parseResponse<ModelDatasetsResponse>(response);
  return payload.items;
}

export async function createModelDataset(payload: CreateModelDatasetPayload) {
  const response = await fetch(`${analysisServerBaseUrl}/models/datasets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<ModelDatasetMutationResponse>(response);
}

export async function updateModelDataset(id: string, payload: UpdateModelDatasetPayload) {
  const response = await fetch(`${analysisServerBaseUrl}/models/datasets/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<ModelDatasetMutationResponse>(response);
}

export async function getModelTrainingJobs(): Promise<ModelTrainingJob[]> {
  const response = await fetch(`${analysisServerBaseUrl}/models/training-jobs`);
  const payload = await parseResponse<ModelTrainingJobsResponse>(response);
  return payload.items;
}

export async function createModelTrainingJob(payload: CreateModelTrainingJobPayload) {
  const response = await fetch(`${analysisServerBaseUrl}/models/training-jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<ModelTrainingJobMutationResponse>(response);
}

export async function updateModelTrainingJob(id: string, payload: UpdateModelTrainingJobPayload) {
  const response = await fetch(`${analysisServerBaseUrl}/models/training-jobs/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<ModelTrainingJobMutationResponse>(response);
}

export async function getModelVersions(): Promise<ModelVersion[]> {
  const response = await fetch(`${analysisServerBaseUrl}/models/versions`);
  const payload = await parseResponse<ModelVersionsResponse>(response);
  return payload.items;
}

export async function updateModelVersion(id: string, payload: UpdateModelVersionPayload) {
  const response = await fetch(`${analysisServerBaseUrl}/models/versions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<ModelVersionMutationResponse>(response);
}

export async function getModelEvaluations(): Promise<ModelEvaluation[]> {
  const response = await fetch(`${analysisServerBaseUrl}/models/evaluations`);
  const payload = await parseResponse<ModelEvaluationsResponse>(response);
  return payload.items;
}

export async function createModelEvaluation(payload: CreateModelEvaluationPayload) {
  const response = await fetch(`${analysisServerBaseUrl}/models/evaluations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<ModelEvaluationMutationResponse>(response);
}

export async function updateModelEvaluation(id: string, payload: UpdateModelEvaluationPayload) {
  const response = await fetch(`${analysisServerBaseUrl}/models/evaluations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<ModelEvaluationMutationResponse>(response);
}

export async function getModelBenchmarks(): Promise<ModelBenchmark[]> {
  const response = await fetch(`${analysisServerBaseUrl}/models/benchmarks`);
  const payload = await parseResponse<ModelBenchmarksResponse>(response);
  return payload.items;
}

export async function createModelBenchmark(payload: CreateModelBenchmarkPayload) {
  const response = await fetch(`${analysisServerBaseUrl}/models/benchmarks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<ModelBenchmarkMutationResponse>(response);
}

export async function updateModelBenchmark(id: string, payload: UpdateModelBenchmarkPayload) {
  const response = await fetch(`${analysisServerBaseUrl}/models/benchmarks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<ModelBenchmarkMutationResponse>(response);
}
