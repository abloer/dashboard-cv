export interface NoHelmetAnalysisEvent {
  event_id: string;
  video_path: string;
  event_type: "no_helmet";
  start_time_seconds: number;
  end_time_seconds: number;
  max_confidence: number;
  track_id: number;
  snapshot_path: string;
  snapshotUrl?: string | null;
  roi_id: string;
}

export interface NoHelmetViolatorSummary {
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

export interface NoHelmetDetectedTrackSummary {
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

export interface NoHelmetGlobalSummary {
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
  detected_tracks: NoHelmetDetectedTrackSummary[];
  stable_detected_tracks: NoHelmetDetectedTrackSummary[];
  violators: NoHelmetViolatorSummary[];
}

export interface NoHelmetAnalysisSummary {
  video_path: string;
  duration_seconds: number;
  fps: number;
  frame_width: number;
  frame_height: number;
  analyzed_frame_count: number;
  event_count: number;
  global_summary?: NoHelmetGlobalSummary;
  events: NoHelmetAnalysisEvent[];
}

export interface RunNoHelmetAnalysisPayload {
  mediaSourceId?: string;
  videoPath: string;
  modelPath: string;
  roiConfigPath?: string;
  roiId?: string;
  roiNormalized?: boolean;
  roiPolygon?: Array<[number, number]>;
  confidenceThreshold?: number;
  iouThreshold?: number;
  topRatio?: number;
  helmetOverlapThreshold?: number;
  violationOnFrames?: number;
  cleanOffFrames?: number;
  frameStep?: number;
  imageSize?: number;
  personLabels?: string[];
  helmetLabels?: string[];
  violationLabels?: string[];
}

export interface RunNoHelmetAnalysisResponse {
  ok: boolean;
  runId: string;
  outputDir: string;
  summary: NoHelmetAnalysisSummary;
  stdout: string;
  stderr: string;
}

export type NoHelmetAnalysisJobStatus = "queued" | "running" | "completed" | "failed";

export interface NoHelmetAnalysisJob {
  id: string;
  status: NoHelmetAnalysisJobStatus;
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
  summary: NoHelmetAnalysisSummary | null;
  queuePosition: number;
}

export interface StartNoHelmetAnalysisResponse {
  ok: boolean;
  jobId: string;
  status: NoHelmetAnalysisJobStatus;
  message: string;
  runId: string;
  outputDir: string;
  createdAt: string;
}

export interface NoHelmetAnalysisJobResponse {
  ok: boolean;
  job: NoHelmetAnalysisJob;
}

export interface NoHelmetDefaultsResponse {
  ok: boolean;
  defaultModelPath: string;
  defaultRoiConfigPath: string;
  analysisOutputRoot: string;
  serverPort: number;
  uploadRoot: string;
}

export interface VideoMetadata {
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
}

export interface UploadVideoResponse {
  ok: boolean;
  fileName: string;
  videoPath: string;
  sizeBytes: number;
  metadata: VideoMetadata | null;
  warning?: string | null;
}

export interface VideoPreviewResponse {
  ok: boolean;
  videoPath: string;
  previewPath: string;
  previewUrl: string | null;
  timestampSeconds: number;
  metadata: VideoMetadata;
}

export interface SourcePreviewResponse {
  ok: boolean;
  source: string;
  previewPath: string;
  previewUrl: string | null;
  capturedAt: string;
}

const DEFAULT_ANALYSIS_SERVER_URL = "http://127.0.0.1:8081";

export const analysisServerBaseUrl =
  (import.meta.env.VITE_ANALYSIS_SERVER_URL as string | undefined)?.replace(/\/$/, "") ||
  DEFAULT_ANALYSIS_SERVER_URL;

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "Request failed.");
  }
  return payload as T;
}

export async function getNoHelmetDefaults(): Promise<NoHelmetDefaultsResponse> {
  const response = await fetch(`${analysisServerBaseUrl}/analysis/no-helmet/defaults`);
  return parseResponse<NoHelmetDefaultsResponse>(response);
}

export async function startNoHelmetAnalysis(
  payload: RunNoHelmetAnalysisPayload
): Promise<StartNoHelmetAnalysisResponse> {
  const response = await fetch(`${analysisServerBaseUrl}/analysis/no-helmet`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<StartNoHelmetAnalysisResponse>(response);
}

export async function getNoHelmetAnalysisJob(
  jobId: string
): Promise<NoHelmetAnalysisJobResponse> {
  const response = await fetch(`${analysisServerBaseUrl}/analysis/no-helmet/jobs/${jobId}`);
  return parseResponse<NoHelmetAnalysisJobResponse>(response);
}

export async function uploadVideoFile(file: File): Promise<UploadVideoResponse> {
  const encodedFileName = encodeURIComponent(file.name);
  const response = await fetch(
    `${analysisServerBaseUrl}/analysis/upload-video?filename=${encodedFileName}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "x-file-name": file.name,
      },
      body: file,
    }
  );
  return parseResponse<UploadVideoResponse>(response);
}

export async function deleteUploadedVideo(videoPath: string): Promise<void> {
  const encodedVideoPath = encodeURIComponent(videoPath);
  const response = await fetch(
    `${analysisServerBaseUrl}/analysis/upload-video?videoPath=${encodedVideoPath}`,
    {
      method: "DELETE",
    }
  );
  await parseResponse<{ ok: boolean; videoPath: string }>(response);
}

export async function getVideoPreview(
  videoPath: string,
  timestampSeconds?: number
): Promise<VideoPreviewResponse> {
  const response = await fetch(`${analysisServerBaseUrl}/analysis/video-preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      videoPath,
      ...(typeof timestampSeconds === "number" ? { timestampSeconds } : {}),
    }),
  });
  return parseResponse<VideoPreviewResponse>(response);
}

export async function getSourcePreview(source: string): Promise<SourcePreviewResponse> {
  const response = await fetch(`${analysisServerBaseUrl}/analysis/source-preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ source }),
  });
  return parseResponse<SourcePreviewResponse>(response);
}
