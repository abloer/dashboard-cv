import type { AnalysisFinding } from "@/lib/analysisFindings";
import { analysisServerBaseUrl } from "@/lib/noHelmetAnalysis";

export interface NoSafetyVestAnalysisEvent {
  event_id: string;
  video_path: string;
  event_type: "no_safety_vest";
  start_time_seconds: number;
  end_time_seconds: number;
  max_confidence: number;
  track_id: number;
  snapshot_path: string;
  snapshotUrl?: string | null;
  roi_id: string;
}

export interface NoSafetyVestViolatorSummary {
  track_id: number;
  event_count: number;
  snapshot_count: number;
  first_event_seconds: number;
  last_event_seconds: number;
  max_confidence: number;
  total_violation_duration_seconds: number;
  roi_ids: string[];
  event_ids: string[];
}

export interface NoSafetyVestDetectedTrackSummary {
  track_id: number;
  in_roi: boolean;
  observed_frame_count: number;
  first_seen_seconds: number;
  last_seen_seconds: number;
  event_count: number;
  snapshot_count: number;
  max_violation_confidence: number;
  total_violation_duration_seconds: number;
  roi_ids: string[];
  event_ids: string[];
}

export interface NoSafetyVestGlobalSummary {
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
  detected_tracks: NoSafetyVestDetectedTrackSummary[];
  stable_detected_tracks: NoSafetyVestDetectedTrackSummary[];
  violators: NoSafetyVestViolatorSummary[];
}

export interface NoSafetyVestAnalysisSummary {
  video_path: string;
  duration_seconds: number;
  fps: number;
  frame_width: number;
  frame_height: number;
  analyzed_frame_count: number;
  event_count: number;
  global_summary?: NoSafetyVestGlobalSummary;
  events: NoSafetyVestAnalysisEvent[];
  analysisFindings?: AnalysisFinding[];
}

export interface RunNoSafetyVestAnalysisPayload {
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

export type NoSafetyVestAnalysisJobStatus = "queued" | "running" | "completed" | "failed";

export interface NoSafetyVestAnalysisJob {
  id: string;
  status: NoSafetyVestAnalysisJobStatus;
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
  summary: NoSafetyVestAnalysisSummary | null;
  queuePosition: number;
}

export interface StartNoSafetyVestAnalysisResponse {
  ok: boolean;
  jobId: string;
  status: NoSafetyVestAnalysisJobStatus;
  message: string;
  runId: string;
  outputDir: string;
  createdAt: string;
}

export interface NoSafetyVestAnalysisJobResponse {
  ok: boolean;
  job: NoSafetyVestAnalysisJob;
}

export interface NoSafetyVestDefaultsResponse {
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

export async function getNoSafetyVestDefaults(): Promise<NoSafetyVestDefaultsResponse> {
  const response = await fetch(`${analysisServerBaseUrl}/analysis/no-safety-vest/defaults`);
  return parseResponse<NoSafetyVestDefaultsResponse>(response);
}

export async function startNoSafetyVestAnalysis(
  payload: RunNoSafetyVestAnalysisPayload
): Promise<StartNoSafetyVestAnalysisResponse> {
  const response = await fetch(`${analysisServerBaseUrl}/analysis/no-safety-vest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<StartNoSafetyVestAnalysisResponse>(response);
}

export async function getNoSafetyVestAnalysisJob(
  jobId: string
): Promise<NoSafetyVestAnalysisJobResponse> {
  const response = await fetch(`${analysisServerBaseUrl}/analysis/no-safety-vest/jobs/${jobId}`);
  return parseResponse<NoSafetyVestAnalysisJobResponse>(response);
}
