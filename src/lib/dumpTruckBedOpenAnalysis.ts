import type { AnalysisFinding } from "@/lib/analysisFindings";
import { analysisServerBaseUrl } from "@/lib/noHelmetAnalysis";

export interface DumpTruckBedOpenAnalysisEvent {
  event_id: string;
  video_path: string;
  event_type: "dump_truck_bed_open";
  start_time_seconds: number;
  end_time_seconds: number;
  max_confidence: number;
  track_id: number;
  snapshot_path: string;
  snapshotUrl?: string | null;
  roi_id: string;
  status?: "violation" | "uncertain";
}

export interface DumpTruckBedOpenGlobalSummary {
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

export interface DumpTruckBedOpenAnalysisSummary {
  video_path: string;
  duration_seconds: number;
  fps: number;
  frame_width: number;
  frame_height: number;
  analyzed_frame_count: number;
  event_count: number;
  global_summary?: DumpTruckBedOpenGlobalSummary;
  events: DumpTruckBedOpenAnalysisEvent[];
  analysisFindings?: AnalysisFinding[];
  createdAt?: string;
}

export interface RunDumpTruckBedOpenAnalysisPayload {
  mediaSourceId?: string;
  videoPath: string;
  modelPath: string;
  roiConfigPath?: string;
  roiId?: string;
  roiNormalized?: boolean;
  roiPolygon?: Array<[number, number]>;
  confidenceThreshold?: number;
  iouThreshold?: number;
  frameStep?: number;
  imageSize?: number;
  truckLabels?: string[];
  bedOpenLabels?: string[];
  bedClosedLabels?: string[];
  movementThreshold?: number;
  minimumMovingSeconds?: number;
}

export type DumpTruckBedOpenAnalysisJobStatus = "queued" | "running" | "completed" | "failed";

export interface DumpTruckBedOpenAnalysisJob {
  id: string;
  status: DumpTruckBedOpenAnalysisJobStatus;
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
  summary: DumpTruckBedOpenAnalysisSummary | null;
  queuePosition: number;
}

export interface StartDumpTruckBedOpenAnalysisResponse {
  ok: boolean;
  jobId: string;
  status: DumpTruckBedOpenAnalysisJobStatus;
  message: string;
  runId: string;
  outputDir: string;
  createdAt: string;
}

export interface DumpTruckBedOpenAnalysisJobResponse {
  ok: boolean;
  job: DumpTruckBedOpenAnalysisJob;
}

export interface DumpTruckBedOpenDefaultsResponse {
  ok: boolean;
  defaultModelPath: string;
  defaultRoiConfigPath: string;
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

export async function getDumpTruckBedOpenDefaults(): Promise<DumpTruckBedOpenDefaultsResponse> {
  const response = await fetch(`${analysisServerBaseUrl}/analysis/dump-truck-bed-open/defaults`);
  return parseResponse<DumpTruckBedOpenDefaultsResponse>(response);
}

export async function startDumpTruckBedOpenAnalysis(
  payload: RunDumpTruckBedOpenAnalysisPayload
): Promise<StartDumpTruckBedOpenAnalysisResponse> {
  const response = await fetch(`${analysisServerBaseUrl}/analysis/dump-truck-bed-open`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<StartDumpTruckBedOpenAnalysisResponse>(response);
}

export async function getDumpTruckBedOpenAnalysisJob(
  jobId: string
): Promise<DumpTruckBedOpenAnalysisJobResponse> {
  const response = await fetch(`${analysisServerBaseUrl}/analysis/dump-truck-bed-open/jobs/${jobId}`);
  return parseResponse<DumpTruckBedOpenAnalysisJobResponse>(response);
}
