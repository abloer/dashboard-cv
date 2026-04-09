import { analysisServerBaseUrl } from "@/lib/noHelmetAnalysis";
import type { AnalysisFinding } from "@/lib/analysisFindings";
import type {
  MediaExecutionMode,
  MediaMonitoringStatus,
  MediaStatus,
  MediaType,
} from "@/lib/mediaRegistry";

export interface DashboardSourceSummary {
  mediaSourceId: string;
  name: string;
  location: string;
  type: MediaType;
  status: MediaStatus;
  analytics: string[];
  executionMode: MediaExecutionMode;
  monitoringStatus: MediaMonitoringStatus;
  monitoringIntervalSeconds: number | null;
  runCount: number;
  totalEvents: number;
  totalViolators: number;
  latestRunAt: string | null;
  latestDetectionAt: string | null;
  latestEventCount: number;
  latestViolatorCount: number;
  latestOutputDir: string | null;
  latestSnapshotUrl: string | null;
  latestAnalysisType: "no_helmet" | "no_safety_vest" | "no_life_vest" | null;
  hasActiveAlert: boolean;
}

export interface DashboardRecentRun {
  id: string;
  analysisType: "no_helmet" | "no_safety_vest" | "no_life_vest";
  mediaSourceId: string | null;
  sourceName: string;
  location: string | null;
  videoPath: string;
  outputDir: string;
  eventCount: number;
  violatorCount: number;
  stableDetectedTrackCount: number;
  rawDetectedTrackCount: number;
  createdAt: string;
}

export interface DashboardLatestAnalysisSummary {
  id: string;
  analysisType: "no_helmet" | "no_safety_vest" | "no_life_vest";
  mediaSourceId: string | null;
  sourceName: string;
  location: string | null;
  createdAt: string;
  outputDir: string;
  eventCount: number;
  violatorCount: number;
  stableDetectedTrackCount: number;
  rawDetectedTrackCount: number;
  durationSeconds: number;
  analyzedFrameCount: number;
  fps: number;
  snapshotCount: number;
  firstEventSeconds: number | null;
  lastEventSeconds: number | null;
  totalViolationDurationSeconds: number;
  narrative: string;
  analysisFindings?: AnalysisFinding[];
  events: Array<{
    event_id: string;
    start_time_seconds: number;
    end_time_seconds: number;
    max_confidence: number;
    track_id: number;
    roi_id: string;
    snapshot_path: string;
    snapshotUrl?: string | null;
    status?: string;
    detection_mode?: string;
  }>;
}

export interface DashboardSummary {
  totalSources: number;
  activeSources: number;
  uploadSources: number;
  cameraSources: number;
  monitoringSources: number;
  analyzedSourceCount: number;
  totalNoHelmetRuns: number;
  totalNoHelmetEvents: number;
  totalViolatorTracks: number;
  latestRunAt: string | null;
  latestRunSourceName: string | null;
  latestAnalysisSummary: DashboardLatestAnalysisSummary | null;
  sourceSummaries: DashboardSourceSummary[];
  recentRuns: DashboardRecentRun[];
}

interface DashboardSummaryResponse {
  ok: boolean;
  summary: DashboardSummary;
}

interface DashboardSourceLatestSummaryResponse {
  ok: boolean;
  source: {
    id: string;
    name: string;
    location: string;
    type: MediaType;
    status: MediaStatus;
    analytics: string[];
    executionMode: MediaExecutionMode;
    monitoringStatus: MediaMonitoringStatus;
    monitoringIntervalSeconds: number | null;
  };
  latestAnalysisSummary: DashboardLatestAnalysisSummary | null;
  latestDetectionSummary: DashboardLatestAnalysisSummary | null;
  latestPpeByModule: {
    noHelmet: DashboardLatestAnalysisSummary | null;
    noSafetyVest: DashboardLatestAnalysisSummary | null;
    noLifeVest: DashboardLatestAnalysisSummary | null;
  };
  latestDetectionByModule: {
    noHelmet: DashboardLatestAnalysisSummary | null;
    noSafetyVest: DashboardLatestAnalysisSummary | null;
    noLifeVest: DashboardLatestAnalysisSummary | null;
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "Request failed.");
  }
  return payload as T;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const response = await fetch(`${analysisServerBaseUrl}/dashboard-summary`);
  const payload = await parseResponse<DashboardSummaryResponse>(response);
  return payload.summary;
}

export async function getSourceLatestAnalysisSummary(mediaSourceId: string): Promise<DashboardSourceLatestSummaryResponse> {
  const response = await fetch(
    `${analysisServerBaseUrl}/dashboard-summary/source/${encodeURIComponent(mediaSourceId)}/latest-analysis`
  );
  return parseResponse<DashboardSourceLatestSummaryResponse>(response);
}
