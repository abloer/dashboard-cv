import { analysisServerBaseUrl, apiFetch } from "@/lib/noHelmetAnalysis";
import type { components } from "@/lib/apiContract";

type ApiMediaSource = components["schemas"]["MediaSource"];
type ApiMediaSourcePayload = components["schemas"]["MediaSourceMutation"];
type ApiMediaSourceStatusPayload = components["schemas"]["MediaSourceStatusMutation"];
type ApiMediaSourceMonitoringPayload = components["schemas"]["MediaSourceMonitoringMutation"];

export type MediaType = ApiMediaSourcePayload["type"];
export type MediaStatus = components["schemas"]["MediaStatus"];
export type MediaExecutionMode = components["schemas"]["ExecutionMode"];
export type MediaMonitoringStatus = components["schemas"]["MonitoringStatus"];

export interface MediaSource extends ApiMediaSource {
  executionMode: MediaExecutionMode;
  monitoringStatus: MediaMonitoringStatus;
  monitoringIntervalSeconds: number | null;
  lastSeen: string;
}

export interface MediaSourcePayload extends ApiMediaSourcePayload {
  analytics: string[];
  executionMode: MediaExecutionMode;
  note: string;
}

type MediaSourceStatusPayload = ApiMediaSourceStatusPayload;
type MediaSourceMonitoringPayload = ApiMediaSourceMonitoringPayload;

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
  const response = await apiFetch(`${analysisServerBaseUrl}/media-sources`);
  const payload = await parseResponse<MediaSourcesResponse>(response);
  return payload.items;
}

export async function createMediaSource(payload: MediaSourcePayload): Promise<MediaSource> {
  const response = await apiFetch(`${analysisServerBaseUrl}/media-sources`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const parsed = await parseResponse<MediaSourceResponse>(response);
  return parsed.item;
}

export async function updateMediaSource(
  id: string,
  expectedVersion: number,
  payload: MediaSourcePayload
): Promise<MediaSource> {
  const response = await apiFetch(`${analysisServerBaseUrl}/media-sources/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...payload, expectedVersion }),
  });
  const parsed = await parseResponse<MediaSourceResponse>(response);
  return parsed.item;
}

export async function updateMediaSourceStatus(
  id: string,
  status: MediaStatus,
  expectedVersion: number
): Promise<MediaSource> {
  const response = await apiFetch(
    `${analysisServerBaseUrl}/media-sources/${encodeURIComponent(id)}/status`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status, expectedVersion } satisfies MediaSourceStatusPayload),
    }
  );
  const parsed = await parseResponse<MediaSourceResponse>(response);
  return parsed.item;
}

export async function deleteMediaSource(id: string, expectedVersion: number): Promise<MediaSource> {
  const response = await apiFetch(`${analysisServerBaseUrl}/media-sources/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expectedVersion }),
  });
  const parsed = await parseResponse<MediaSourceResponse>(response);
  return parsed.item;
}

export async function updateMediaSourceMonitoring(
  id: string,
  payload: MediaSourceMonitoringPayload
): Promise<MediaSource> {
  const response = await apiFetch(
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
