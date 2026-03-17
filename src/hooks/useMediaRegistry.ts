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
    mutationFn: ({ id, payload }: { id: string; payload: MediaSourcePayload }) =>
      updateMediaSource(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEDIA_REGISTRY_QUERY_KEY });
    },
  });
}

export function useUpdateMediaSourceStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: MediaStatus }) =>
      updateMediaSourceStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEDIA_REGISTRY_QUERY_KEY });
    },
  });
}

export function useDeleteMediaSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMediaSource(id),
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
    }: {
      id: string;
      monitoringStatus: MediaMonitoringStatus;
      executionMode?: MediaExecutionMode;
      monitoringIntervalSeconds?: number | null;
    }) =>
      updateMediaSourceMonitoring(id, {
        monitoringStatus,
        executionMode,
        monitoringIntervalSeconds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEDIA_REGISTRY_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
}
