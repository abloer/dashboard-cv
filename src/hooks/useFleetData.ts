import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VideoAnalyticRow {
  id: number;
  fileName: string | null;
  analyticType: string | null;
  location: string | null;
  operator: string | null;
  avgCycleTime: number | null;
  benchHeight: number | null;
  frontLoadingAreaLength: number | null;
}

export interface VideoAnalyticSummary {
  totalVideos: number;
  cycleTimeCount: number;
  benchHeightCount: number;
  frontLoadingCount: number;
}

export function useFleetUnits(limit = 50) {
  return useQuery({
    queryKey: ["video-analytic-table", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("VIDEO_ANALITYC")
        .select("ID, FILE_NAME, ANALITYC_TYPE, LOCATION, OPERATOR, AVG_CYCLETIME, BENCH_HEIGHT, FRONT_LOADING_AREA_LENGTH")
        .order("ID", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (data || []).map((row) => ({
        id: row.ID,
        fileName: row.FILE_NAME,
        analyticType: row.ANALITYC_TYPE,
        location: row.LOCATION,
        operator: row.OPERATOR,
        avgCycleTime: row.AVG_CYCLETIME,
        benchHeight: row.BENCH_HEIGHT,
        frontLoadingAreaLength: row.FRONT_LOADING_AREA_LENGTH,
      })) as VideoAnalyticRow[];
    },
  });
}

export function useFleetSummary() {
  return useQuery({
    queryKey: ["video-analytic-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("VIDEO_ANALITYC")
        .select("ANALITYC_TYPE");

      if (error) throw error;

      const summary: VideoAnalyticSummary = {
        totalVideos: 0,
        cycleTimeCount: 0,
        benchHeightCount: 0,
        frontLoadingCount: 0,
      };

      (data || []).forEach((row) => {
        summary.totalVideos++;
        if (row.ANALITYC_TYPE === "CYCLE_TIME_ANALITYC") summary.cycleTimeCount++;
        if (row.ANALITYC_TYPE === "BENCH_HEIGHT_MESUREMENT") summary.benchHeightCount++;
        if (row.ANALITYC_TYPE === "FRONT_LOADING_MESUREMENT") summary.frontLoadingCount++;
      });

      return summary;
    },
  });
}
