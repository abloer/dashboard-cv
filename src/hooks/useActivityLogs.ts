import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AnalyticLog {
  id: number;
  fileName: string | null;
  analyticType: string | null;
  location: string | null;
  operator: string | null;
  avgCycleTime: number | null;
  benchHeight: number | null;
  frontLoadingAreaLength: number | null;
}

export function useActivityLogs(limit = 50) {
  return useQuery({
    queryKey: ["analytic-logs", limit],
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
      })) as AnalyticLog[];
    },
  });
}
