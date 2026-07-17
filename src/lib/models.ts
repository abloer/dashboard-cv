import { analysisServerBaseUrl, apiFetch } from "@/lib/noHelmetAnalysis";
import type { components } from "@/lib/apiContract";

type ApiModelRegistryItem = components["schemas"]["ModelRegistryItem"];

export type ModelDatasetDomain = components["schemas"]["ModelDomain"];
export type ModelDatasetStatus = "draft" | "ready" | "archived";
export type ModelDatasetSourceType = "upload" | "camera" | "mixed";
export type ModelTrainingJobStatus = "queued" | "running" | "completed" | "failed";
export type ModelTargetModule = components["schemas"]["ModuleKey"];
export type ModelVersionStatus = components["schemas"]["ModelVersionUpdate"]["status"];
export type ModelEvaluationStatus = NonNullable<components["schemas"]["EvaluationCreate"]["status"]>;
export type ModelBenchmarkStatus = components["schemas"]["BenchmarkCreate"]["status"];
export type ModelBenchmarkRecommendation = components["schemas"]["BenchmarkCreate"]["recommendation"];

export interface ModelDataset extends ApiModelRegistryItem {
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

export interface ModelTrainingJob extends ApiModelRegistryItem {
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
  startedAt: string | null;
  endedAt: string | null;
}

export interface ModelVersion extends ApiModelRegistryItem {
  name: string;
  moduleKey: ModelTargetModule;
  domain: ModelDatasetDomain;
  labels: string[];
  modelPath: string;
  sourceJobId: string | null;
  evaluationSummary: string;
  status: ModelVersionStatus;
}

export interface ModelEvaluation extends ApiModelRegistryItem {
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
}

export interface ModelBenchmark extends ApiModelRegistryItem {
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
}

export type CreateModelDatasetPayload = components["schemas"]["ModelDatasetCreate"];

export type UpdateModelDatasetPayload = components["schemas"]["ModelDatasetUpdate"];

export type CreateModelTrainingJobPayload = components["schemas"]["TrainingJobCreate"];

export type UpdateModelTrainingJobPayload = components["schemas"]["TrainingJobUpdate"];

export type CreateModelEvaluationPayload = components["schemas"]["EvaluationCreate"];

export type UpdateModelEvaluationPayload = components["schemas"]["EvaluationUpdate"];

export type UpdateModelVersionPayload = components["schemas"]["ModelVersionUpdate"];

export type CreateModelBenchmarkPayload = components["schemas"]["BenchmarkCreate"];

export type UpdateModelBenchmarkPayload = components["schemas"]["BenchmarkUpdate"];

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
  const response = await apiFetch(`${analysisServerBaseUrl}/models/overview`);
  const payload = await parseResponse<ModelsOverviewResponse>(response);
  return payload.overview;
}

export async function getModelDatasets(): Promise<ModelDataset[]> {
  const response = await apiFetch(`${analysisServerBaseUrl}/models/datasets`);
  const payload = await parseResponse<ModelDatasetsResponse>(response);
  return payload.items;
}

export async function createModelDataset(payload: CreateModelDatasetPayload) {
  const response = await apiFetch(`${analysisServerBaseUrl}/models/datasets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<ModelDatasetMutationResponse>(response);
}

export async function updateModelDataset(id: string, payload: UpdateModelDatasetPayload) {
  const response = await apiFetch(`${analysisServerBaseUrl}/models/datasets/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<ModelDatasetMutationResponse>(response);
}

export async function getModelTrainingJobs(): Promise<ModelTrainingJob[]> {
  const response = await apiFetch(`${analysisServerBaseUrl}/models/training-jobs`);
  const payload = await parseResponse<ModelTrainingJobsResponse>(response);
  return payload.items;
}

export async function createModelTrainingJob(payload: CreateModelTrainingJobPayload) {
  const response = await apiFetch(`${analysisServerBaseUrl}/models/training-jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<ModelTrainingJobMutationResponse>(response);
}

export async function updateModelTrainingJob(id: string, payload: UpdateModelTrainingJobPayload) {
  const response = await apiFetch(`${analysisServerBaseUrl}/models/training-jobs/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<ModelTrainingJobMutationResponse>(response);
}

export async function getModelVersions(): Promise<ModelVersion[]> {
  const response = await apiFetch(`${analysisServerBaseUrl}/models/versions`);
  const payload = await parseResponse<ModelVersionsResponse>(response);
  return payload.items;
}

export async function updateModelVersion(id: string, payload: UpdateModelVersionPayload) {
  const response = await apiFetch(`${analysisServerBaseUrl}/models/versions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<ModelVersionMutationResponse>(response);
}

export async function getModelEvaluations(): Promise<ModelEvaluation[]> {
  const response = await apiFetch(`${analysisServerBaseUrl}/models/evaluations`);
  const payload = await parseResponse<ModelEvaluationsResponse>(response);
  return payload.items;
}

export async function createModelEvaluation(payload: CreateModelEvaluationPayload) {
  const response = await apiFetch(`${analysisServerBaseUrl}/models/evaluations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<ModelEvaluationMutationResponse>(response);
}

export async function updateModelEvaluation(id: string, payload: UpdateModelEvaluationPayload) {
  const response = await apiFetch(`${analysisServerBaseUrl}/models/evaluations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<ModelEvaluationMutationResponse>(response);
}

export async function getModelBenchmarks(): Promise<ModelBenchmark[]> {
  const response = await apiFetch(`${analysisServerBaseUrl}/models/benchmarks`);
  const payload = await parseResponse<ModelBenchmarksResponse>(response);
  return payload.items;
}

export async function createModelBenchmark(payload: CreateModelBenchmarkPayload) {
  const response = await apiFetch(`${analysisServerBaseUrl}/models/benchmarks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<ModelBenchmarkMutationResponse>(response);
}

export async function updateModelBenchmark(id: string, payload: UpdateModelBenchmarkPayload) {
  const response = await apiFetch(`${analysisServerBaseUrl}/models/benchmarks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<ModelBenchmarkMutationResponse>(response);
}
