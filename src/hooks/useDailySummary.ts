import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AnalyticsSummary {
  totalVideos: number;
  cycleTimeCount: number;
  benchHeightCount: number;
  frontLoadingCount: number;
  avgCycleTime: number | null;
  avgBenchHeight: number | null;
  avgFrontLoading: number | null;
  avgQueueTime: number | null;
  avgEstimatedLoad: number | null;
}

export function useDailySummary() {
  return useQuery({
    queryKey: ["analytics-summary"],
    queryFn: async () => {
      const [{ data: videoData, error: videoError }, { data: dumpData, error: dumpError }] =
        await Promise.all([
          supabase
            .from("VIDEO_ANALITYC")
            .select("ANALITYC_TYPE, AVG_CYCLETIME, BENCH_HEIGHT, FRONT_LOADING_AREA_LENGTH"),
          supabase
            .from("DUMP_TRUCK_DATA")
            .select("QUEUE_TIME, ESTIMATED_LOAD"),
        ]);

      if (videoError) throw videoError;
      if (dumpError) throw dumpError;

      const summary: AnalyticsSummary = {
        totalVideos: 0,
        cycleTimeCount: 0,
        benchHeightCount: 0,
        frontLoadingCount: 0,
        avgCycleTime: null,
        avgBenchHeight: null,
        avgFrontLoading: null,
        avgQueueTime: null,
        avgEstimatedLoad: null,
      };

      let cycleTimeTotal = 0;
      let cycleTimeCount = 0;
      let benchTotal = 0;
      let benchCount = 0;
      let frontTotal = 0;
      let frontCount = 0;

      (videoData || []).forEach((row) => {
        summary.totalVideos++;
        if (row.ANALITYC_TYPE === "CYCLE_TIME_ANALITYC") summary.cycleTimeCount++;
        if (row.ANALITYC_TYPE === "BENCH_HEIGHT_MESUREMENT") summary.benchHeightCount++;
        if (row.ANALITYC_TYPE === "FRONT_LOADING_MESUREMENT") summary.frontLoadingCount++;

        if (row.AVG_CYCLETIME !== null) {
          cycleTimeTotal += Number(row.AVG_CYCLETIME);
          cycleTimeCount++;
        }
        if (row.BENCH_HEIGHT !== null) {
          benchTotal += Number(row.BENCH_HEIGHT);
          benchCount++;
        }
        if (row.FRONT_LOADING_AREA_LENGTH !== null) {
          frontTotal += Number(row.FRONT_LOADING_AREA_LENGTH);
          frontCount++;
        }
      });

      const queueValues = (dumpData || []).map((row) => row.QUEUE_TIME).filter((v) => v !== null);
      const loadValues = (dumpData || []).map((row) => row.ESTIMATED_LOAD).filter((v) => v !== null);

      summary.avgCycleTime = cycleTimeCount > 0 ? Number((cycleTimeTotal / cycleTimeCount).toFixed(2)) : null;
      summary.avgBenchHeight = benchCount > 0 ? Number((benchTotal / benchCount).toFixed(2)) : null;
      summary.avgFrontLoading = frontCount > 0 ? Number((frontTotal / frontCount).toFixed(2)) : null;
      summary.avgQueueTime =
        queueValues.length > 0
          ? Number((queueValues.reduce((a, b) => a + Number(b), 0) / queueValues.length).toFixed(2))
          : null;
      summary.avgEstimatedLoad =
        loadValues.length > 0
          ? Number((loadValues.reduce((a, b) => a + Number(b), 0) / loadValues.length).toFixed(2))
          : null;

      return summary;
    },
  });
}
