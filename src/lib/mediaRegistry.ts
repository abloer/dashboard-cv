import { analysisServerBaseUrl } from "@/lib/noHelmetAnalysis";

export type MediaType = "upload" | "camera";
export type MediaStatus = "active" | "inactive" | "maintenance";
export type MediaExecutionMode = "manual" | "scheduled" | "continuous";
export type MediaMonitoringStatus = "idle" | "running" | "paused";

export interface MediaSource {
  id: string;
  name: string;
  location: string;
  source: string;
  type: MediaType;
  status: MediaStatus;
  analytics: string[];
  executionMode: MediaExecutionMode;
  monitoringStatus: MediaMonitoringStatus;
  monitoringIntervalSeconds: number | null;
  lastSeen: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaSourcePayload {
  name: string;
  location: string;
  source: string;
  type: MediaType;
  status: MediaStatus;
  analytics: string[];
  executionMode: MediaExecutionMode;
  monitoringStatus?: MediaMonitoringStatus;
  monitoringIntervalSeconds?: number | null;
  note: string;
  lastSeen?: string;
}

interface MediaSourcesResponse {
  ok: boolean;
  items: MediaSource[];
}

interface MediaSourceResponse {
  ok: boolean;
  item: MediaSource;
}

interface MonitoringMediaSourceResponse {
  ok: boolean;
  item: MediaSource;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "Request failed.");
  }
  return payload as T;
}

export async function getMediaSources(): Promise<MediaSource[]> {
  const response = await fetch(`${analysisServerBaseUrl}/media-sources`);
  const payload = await parseResponse<MediaSourcesResponse>(response);
  return payload.items;
}

export async function createMediaSource(payload: MediaSourcePayload): Promise<MediaSource> {
  const response = await fetch(`${analysisServerBaseUrl}/media-sources`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const parsed = await parseResponse<MediaSourceResponse>(response);
  return parsed.item;
}

export async function updateMediaSource(id: string, payload: MediaSourcePayload): Promise<MediaSource> {
  const response = await fetch(`${analysisServerBaseUrl}/media-sources/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const parsed = await parseResponse<MediaSourceResponse>(response);
  return parsed.item;
}

export async function updateMediaSourceStatus(
  id: string,
  status: MediaStatus
): Promise<MediaSource> {
  const response = await fetch(
    `${analysisServerBaseUrl}/media-sources/${encodeURIComponent(id)}/status`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    }
  );
  const parsed = await parseResponse<MediaSourceResponse>(response);
  return parsed.item;
}

export async function deleteMediaSource(id: string): Promise<MediaSource> {
  const response = await fetch(`${analysisServerBaseUrl}/media-sources/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const parsed = await parseResponse<MediaSourceResponse>(response);
  return parsed.item;
}

export async function updateMediaSourceMonitoring(
  id: string,
  payload: {
    monitoringStatus: MediaMonitoringStatus;
    executionMode?: MediaExecutionMode;
    monitoringIntervalSeconds?: number | null;
  }
): Promise<MediaSource> {
  const response = await fetch(
    `${analysisServerBaseUrl}/media-sources/${encodeURIComponent(id)}/monitoring`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
  const parsed = await parseResponse<MonitoringMediaSourceResponse>(response);
  return parsed.item;
}
