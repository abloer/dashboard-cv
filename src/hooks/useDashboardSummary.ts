import { useQuery } from "@tanstack/react-query";
import { getDashboardSummary, getSourceLatestAnalysisSummary } from "@/lib/dashboardSummary";

interface DashboardSummaryOptions {
  refetchInterval?: number | false;
}

export function useDashboardSummary(options: DashboardSummaryOptions = {}) {
  return useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary,
    refetchInterval: options.refetchInterval,
  });
}

export function useSourceLatestAnalysisSummary(
  mediaSourceId: string | null,
  options: DashboardSummaryOptions = {}
) {
  return useQuery({
    queryKey: ["dashboard-summary", "source-latest-analysis", mediaSourceId],
    queryFn: () => getSourceLatestAnalysisSummary(mediaSourceId as string),
    enabled: Boolean(mediaSourceId),
    refetchInterval: options.refetchInterval,
  });
}
