import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createMediaSource,
  deleteMediaSource,
  getMediaSources,
  updateMediaSource,
  updateMediaSourceMonitoring,
  updateMediaSourceStatus,
  type MediaExecutionMode,
  type MediaMonitoringStatus,
  type MediaSourcePayload,
  type MediaStatus,
} from "@/lib/mediaRegistry";

const MEDIA_REGISTRY_QUERY_KEY = ["media-registry"] as const;

export function useMediaRegistry() {
  return useQuery({
    queryKey: MEDIA_REGISTRY_QUERY_KEY,
    queryFn: getMediaSources,
  });
}

export function useCreateMediaSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: MediaSourcePayload) => createMediaSource(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEDIA_REGISTRY_QUERY_KEY });
    },
  });
}

export function useUpdateMediaSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedVersion, payload }: { id: string; expectedVersion: number; payload: MediaSourcePayload }) =>
      updateMediaSource(id, expectedVersion, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEDIA_REGISTRY_QUERY_KEY });
    },
  });
}

export function useUpdateMediaSourceStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, expectedVersion }: { id: string; status: MediaStatus; expectedVersion: number }) =>
      updateMediaSourceStatus(id, status, expectedVersion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEDIA_REGISTRY_QUERY_KEY });
    },
  });
}

export function useDeleteMediaSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedVersion }: { id: string; expectedVersion: number }) =>
      deleteMediaSource(id, expectedVersion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEDIA_REGISTRY_QUERY_KEY });
    },
  });
}

export function useUpdateMediaSourceMonitoring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      monitoringStatus,
      executionMode,
      monitoringIntervalSeconds,
      expectedVersion,
    }: {
      id: string;
      monitoringStatus: MediaMonitoringStatus;
      executionMode?: MediaExecutionMode;
      monitoringIntervalSeconds?: number | null;
      expectedVersion: number;
    }) =>
      updateMediaSourceMonitoring(id, {
        monitoringStatus,
        executionMode,
        monitoringIntervalSeconds,
        expectedVersion,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEDIA_REGISTRY_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
}
