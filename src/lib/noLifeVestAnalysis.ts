import type { AnalysisFinding } from "@/lib/analysisFindings";
import { analysisServerBaseUrl } from "@/lib/noHelmetAnalysis";

export interface NoLifeVestAnalysisEvent {
  event_id: string;
  video_path: string;
  event_type: "no_life_vest";
  start_time_seconds: number;
  end_time_seconds: number;
  max_confidence: number;
  track_id: number;
  snapshot_path: string;
  snapshotUrl?: string | null;
  roi_id: string;
}

export interface NoLifeVestGlobalSummary {
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
  uncertain_event_count?: number;
  uncertain_track_count?: number;
  narrative: string;
}

export interface NoLifeVestAnalysisSummary {
  video_path: string;
  duration_seconds: number;
  fps: number;
  frame_width: number;
  frame_height: number;
  analyzed_frame_count: number;
  event_count: number;
  global_summary?: NoLifeVestGlobalSummary;
  events: NoLifeVestAnalysisEvent[];
  analysisFindings?: AnalysisFinding[];
  createdAt?: string;
}

export interface RunNoLifeVestAnalysisPayload {
  mediaSourceId?: string;
  videoPath: string;
  modelPath: string;
  roiConfigPath?: string;
  roiId?: string;
  roiNormalized?: boolean;
  roiPolygon?: Array<[number, number]>;
  confidenceThreshold?: number;
  iouThreshold?: number;
  violationOnFrames?: number;
  cleanOffFrames?: number;
  frameStep?: number;
  imageSize?: number;
  personLabels?: string[];
  vestLabels?: string[];
  violationLabels?: string[];
}

export type NoLifeVestAnalysisJobStatus = "queued" | "running" | "completed" | "failed";

export interface NoLifeVestAnalysisJob {
  id: string;
  status: NoLifeVestAnalysisJobStatus;
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
  summary: NoLifeVestAnalysisSummary | null;
  queuePosition: number;
}

export interface StartNoLifeVestAnalysisResponse {
  ok: boolean;
  jobId: string;
  status: NoLifeVestAnalysisJobStatus;
  message: string;
  runId: string;
  outputDir: string;
  createdAt: string;
}

export interface NoLifeVestAnalysisJobResponse {
  ok: boolean;
  job: NoLifeVestAnalysisJob;
}

export interface NoLifeVestDefaultsResponse {
  ok: boolean;
  defaultModelPath: string;
  defaultRoiConfigPath: string;
  analysisOutputRoot: string;
  serverPort: number;
  uploadRoot: string;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "Request failed.");
  }
  return payload as T;
}

export async function getNoLifeVestDefaults(): Promise<NoLifeVestDefaultsResponse> {
  const response = await fetch(`${analysisServerBaseUrl}/analysis/no-life-vest/defaults`);
  return parseResponse<NoLifeVestDefaultsResponse>(response);
}

export async function startNoLifeVestAnalysis(
  payload: RunNoLifeVestAnalysisPayload
): Promise<StartNoLifeVestAnalysisResponse> {
  const response = await fetch(`${analysisServerBaseUrl}/analysis/no-life-vest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<StartNoLifeVestAnalysisResponse>(response);
}

export async function getNoLifeVestAnalysisJob(
  jobId: string
): Promise<NoLifeVestAnalysisJobResponse> {
  const response = await fetch(`${analysisServerBaseUrl}/analysis/no-life-vest/jobs/${jobId}`);
  return parseResponse<NoLifeVestAnalysisJobResponse>(response);
}
