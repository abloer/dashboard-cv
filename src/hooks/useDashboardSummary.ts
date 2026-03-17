import { useQuery } from "@tanstack/react-query";
import { getDashboardSummary, getSourceLatestAnalysisSummary } from "@/lib/dashboardSummary";

export function useDashboardSummary() {
  return useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary,
  });
}

export function useSourceLatestAnalysisSummary(mediaSourceId: string | null) {
  return useQuery({
    queryKey: ["dashboard-summary", "source-latest-analysis", mediaSourceId],
    queryFn: () => getSourceLatestAnalysisSummary(mediaSourceId as string),
    enabled: Boolean(mediaSourceId),
  });
}
