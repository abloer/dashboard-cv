import type { AnalysisFinding } from "@/lib/analysisFindings";
import type { components } from "@/lib/apiContract";
import { analysisServerBaseUrl, apiFetch } from "@/lib/noHelmetAnalysis";

type ApiAnalysisRunRequest = components["schemas"]["AnalysisRunRequest"];
type ApiAnalysisJobAccepted = components["schemas"]["AnalysisJobAccepted"];
type ApiAnalysisJob = components["schemas"]["AnalysisJob"];

export interface RedLightViolationAnalysisEvent {
  event_id: string;
  video_path: string;
  event_type: "red_light_violation";
  start_time_seconds: number;
  end_time_seconds: number;
  max_confidence: number;
  track_id: number;
  snapshot_path: string;
  snapshotUrl?: string | null;
  roi_id: string;
  status?: "violation" | "uncertain";
}

export interface RedLightViolationGlobalSummary {
  detected_track_count: number;
  detected_tracks_in_roi_count: number;
  stable_detected_track_count: number;
  stable_detected_tracks_in_roi_count: number;
  violator_count: number;
  event_count: number;
  snapshot_count: number;
  first_event_seconds: number | null;
  last_event_seconds: number | null;
  total_violation_duration_seconds: number;
  narrative: string;
}

export interface RedLightViolationAnalysisSummary {
  video_path: string;
  duration_seconds: number;
  fps: number;
  frame_width: number;
  frame_height: number;
  analyzed_frame_count: number;
  event_count: number;
  global_summary?: RedLightViolationGlobalSummary;
  events: RedLightViolationAnalysisEvent[];
  analysisFindings?: AnalysisFinding[];
  createdAt?: string;
}

export interface RunRedLightViolationAnalysisPayload extends ApiAnalysisRunRequest {
  modelVersionId?: string;
  videoPath?: string;
  vehicleModelPath?: string;
  trafficLightModelPath?: string;
  stopLineConfigPath?: string;
  intersectionId?: string;
  stopLineNormalized?: boolean;
  stopLinePolygon?: Array<[number, number]>;
  confidenceThreshold?: number;
  iouThreshold?: number;
  frameStep?: number;
  imageSize?: number;
  vehicleLabels?: string[];
  redLightLabels?: string[];
  greenLightLabels?: string[];
  crossingWindowSeconds?: number;
}

export type RedLightViolationAnalysisJobStatus = ApiAnalysisJob["status"];

export interface RedLightViolationAnalysisJob {
  id: string;
  status: RedLightViolationAnalysisJobStatus;
  message: string;
  runId: string;
  outputDir: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  mediaSourceId: string | null;
  videoPath: string;
  stdout: string;
  stderr: string;
  summary: RedLightViolationAnalysisSummary | null;
  queuePosition: number;
}

export interface StartRedLightViolationAnalysisResponse extends ApiAnalysisJobAccepted {
  message: string;
  outputDir: string;
}

export interface RedLightViolationAnalysisJobResponse {
  ok: boolean;
  job: RedLightViolationAnalysisJob;
}

export interface RedLightViolationDefaultsResponse {
  ok: boolean;
  defaultVehicleModelPath: string;
  defaultTrafficLightModelPath: string;
  defaultStopLineConfigPath: string;
  analysisOutputRoot: string;
  serverPort: number;
  uploadRoot: string;
  activeModel: {
    id: string;
    name: string;
    moduleKey: string;
    domain: "Operations";
    labels: string[];
    modelPath: string;
    updatedAt: string;
  } | null;
  modelSource: "deployment-gate" | "manual";
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "Request failed.");
  }
  return payload as T;
}

export async function getRedLightViolationDefaults(): Promise<RedLightViolationDefaultsResponse> {
  const response = await apiFetch(`${analysisServerBaseUrl}/analysis/red-light-violation/defaults`);
  return parseResponse<RedLightViolationDefaultsResponse>(response);
}

export async function startRedLightViolationAnalysis(
  payload: RunRedLightViolationAnalysisPayload
): Promise<StartRedLightViolationAnalysisResponse> {
  const response = await apiFetch(`${analysisServerBaseUrl}/analysis/red-light-violation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<StartRedLightViolationAnalysisResponse>(response);
}

export async function getRedLightViolationAnalysisJob(
  jobId: string
): Promise<RedLightViolationAnalysisJobResponse> {
  const response = await apiFetch(`${analysisServerBaseUrl}/analysis/red-light-violation/jobs/${jobId}`);
  return parseResponse<RedLightViolationAnalysisJobResponse>(response);
}
