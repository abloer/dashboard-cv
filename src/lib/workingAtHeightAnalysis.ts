import type { AnalysisFinding } from "@/lib/analysisFindings";
import { analysisServerBaseUrl } from "@/lib/noHelmetAnalysis";

export interface WorkingAtHeightAnalysisEvent {
  event_id: string;
  video_path: string;
  event_type: "working_at_height";
  start_time_seconds: number;
  end_time_seconds: number;
  max_confidence: number;
  track_id: number;
  snapshot_path: string;
  snapshotUrl?: string | null;
  roi_id: string;
}

export interface WorkingAtHeightGlobalSummary {
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

export interface WorkingAtHeightAnalysisSummary {
  video_path: string;
  duration_seconds: number;
  fps: number;
  frame_width: number;
  frame_height: number;
  analyzed_frame_count: number;
  event_count: number;
  global_summary?: WorkingAtHeightGlobalSummary;
  events: WorkingAtHeightAnalysisEvent[];
  analysisFindings?: AnalysisFinding[];
  createdAt?: string;
}

export interface RunWorkingAtHeightAnalysisPayload {
  mediaSourceId?: string;
  videoPath: string;
  modelPath: string;
  zoneConfigPath?: string;
  zoneId?: string;
  zoneNormalized?: boolean;
  zonePolygon?: Array<[number, number]>;
  confidenceThreshold?: number;
  iouThreshold?: number;
  frameStep?: number;
  imageSize?: number;
  personLabels?: string[];
  minimumPresenceSeconds?: number;
}

export type WorkingAtHeightAnalysisJobStatus = "queued" | "running" | "completed" | "failed";

export interface WorkingAtHeightAnalysisJob {
  id: string;
  status: WorkingAtHeightAnalysisJobStatus;
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
  summary: WorkingAtHeightAnalysisSummary | null;
  queuePosition: number;
}

export interface StartWorkingAtHeightAnalysisResponse {
  ok: boolean;
  jobId: string;
  status: WorkingAtHeightAnalysisJobStatus;
  message: string;
  runId: string;
  outputDir: string;
  createdAt: string;
}

export interface WorkingAtHeightAnalysisJobResponse {
  ok: boolean;
  job: WorkingAtHeightAnalysisJob;
}

export interface WorkingAtHeightDefaultsResponse {
  ok: boolean;
  defaultModelPath: string;
  defaultZoneConfigPath: string;
  analysisOutputRoot: string;
  serverPort: number;
  uploadRoot: string;
  activeModel: {
    id: string;
    name: string;
    moduleKey: string;
    domain: "PPE" | "HSE";
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

export async function getWorkingAtHeightDefaults(): Promise<WorkingAtHeightDefaultsResponse> {
  const response = await fetch(`${analysisServerBaseUrl}/analysis/working-at-height/defaults`);
  return parseResponse<WorkingAtHeightDefaultsResponse>(response);
}

export async function startWorkingAtHeightAnalysis(
  payload: RunWorkingAtHeightAnalysisPayload
): Promise<StartWorkingAtHeightAnalysisResponse> {
  const response = await fetch(`${analysisServerBaseUrl}/analysis/working-at-height`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<StartWorkingAtHeightAnalysisResponse>(response);
}

export async function getWorkingAtHeightAnalysisJob(
  jobId: string
): Promise<WorkingAtHeightAnalysisJobResponse> {
  const response = await fetch(`${analysisServerBaseUrl}/analysis/working-at-height/jobs/${jobId}`);
  return parseResponse<WorkingAtHeightAnalysisJobResponse>(response);
}
