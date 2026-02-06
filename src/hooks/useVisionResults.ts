import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VideoAnalytic {
  id: number;
  fileName: string | null;
  benchHeight: number | null;
  frontLoadingAreaLength: number | null;
  diggingTime: number | null;
  swingingTime: number | null;
  dumpingTime: number | null;
  loadingTime: number | null;
  analyticType: string | null;
  location: string | null;
  operator: string | null;
  avgCycleTime: number | null;
}

export function useVisionResults(limit = 200) {
  return useQuery({
    queryKey: ["video-analytic", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("VIDEO_ANALITYC")
        .select(
          "ID, FILE_NAME, BENCH_HEIGHT, FRONT_LOADING_AREA_LENGTH, DIGGING_TIME, SWINGING_TIME, DUMPING_TIME, LOADING_TIME, ANALITYC_TYPE, LOCATION, OPERATOR, AVG_CYCLETIME"
        )
        .order("ID", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (data || []).map((row) => ({
        id: row.ID,
        fileName: row.FILE_NAME,
        benchHeight: row.BENCH_HEIGHT,
        frontLoadingAreaLength: row.FRONT_LOADING_AREA_LENGTH,
        diggingTime: row.DIGGING_TIME,
        swingingTime: row.SWINGING_TIME,
        dumpingTime: row.DUMPING_TIME,
        loadingTime: row.LOADING_TIME,
        analyticType: row.ANALITYC_TYPE,
        location: row.LOCATION,
        operator: row.OPERATOR,
        avgCycleTime: row.AVG_CYCLETIME,
      })) as VideoAnalytic[];
    },
  });
}
