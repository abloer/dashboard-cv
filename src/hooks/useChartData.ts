import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Hook for Avg Cycle Time per Operator
export function useProductivityByUnit() {
  return useQuery({
    queryKey: ["productivity-by-unit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("VIDEO_ANALITYC")
        .select("ANALITYC_TYPE, OPERATOR, AVG_CYCLETIME");

      if (error) throw error;

      const operatorMap: { [key: string]: number[] } = {};
      (data || []).forEach((item) => {
        if (item.ANALITYC_TYPE !== "CYCLE_TIME_ANALITYC") return;
        if (item.AVG_CYCLETIME === null) return;
        const key = item.OPERATOR || "Unknown";
        if (!operatorMap[key]) operatorMap[key] = [];
        operatorMap[key].push(Number(item.AVG_CYCLETIME));
      });

      return Object.entries(operatorMap).map(([operator, values]) => ({
        name: operator,
        avgCycleTime: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
        target: 300,
      }));
    },
  });
}

// Hook for Cycle Time Chart - component times by video
export function useCycleTimeByHour() {
  return useQuery({
    queryKey: ["cycle-time-by-hour"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("VIDEO_ANALITYC")
        .select("ID, FILE_NAME, ANALITYC_TYPE, DIGGING_TIME, SWINGING_TIME, DUMPING_TIME, LOADING_TIME")
        .order("ID", { ascending: false })
        .limit(10);

      if (error) throw error;

      return (data || [])
        .filter((row) => row.ANALITYC_TYPE === "CYCLE_TIME_ANALITYC")
        .map((row) => ({
          label: row.FILE_NAME || `Video ${row.ID}`,
          digging: row.DIGGING_TIME ? Number(row.DIGGING_TIME) : 0,
          swinging: row.SWINGING_TIME ? Number(row.SWINGING_TIME) : 0,
          dumping: row.DUMPING_TIME ? Number(row.DUMPING_TIME) : 0,
          loading: row.LOADING_TIME ? Number(row.LOADING_TIME) : 0,
        }))
        .reverse();
    },
  });
}

// Hook for Analytic Type Distribution
export function useFleetStatusDistribution() {
  return useQuery({
    queryKey: ["fleet-status-distribution"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("VIDEO_ANALITYC")
        .select("ANALITYC_TYPE");

      if (error) throw error;

      const total = data?.length || 0;
      const typeCount = {
        CYCLE_TIME_ANALITYC: 0,
        BENCH_HEIGHT_MESUREMENT: 0,
        FRONT_LOADING_MESUREMENT: 0,
        OTHER: 0,
      };

      (data || []).forEach((row) => {
        if (row.ANALITYC_TYPE === "CYCLE_TIME_ANALITYC") typeCount.CYCLE_TIME_ANALITYC++;
        else if (row.ANALITYC_TYPE === "BENCH_HEIGHT_MESUREMENT") typeCount.BENCH_HEIGHT_MESUREMENT++;
        else if (row.ANALITYC_TYPE === "FRONT_LOADING_MESUREMENT") typeCount.FRONT_LOADING_MESUREMENT++;
        else typeCount.OTHER++;
      });

      return [
        {
          name: "Cycle Time",
          value: total > 0 ? Math.round((typeCount.CYCLE_TIME_ANALITYC / total) * 100) : 0,
          color: "hsl(var(--primary))",
        },
        {
          name: "Bench Height",
          value: total > 0 ? Math.round((typeCount.BENCH_HEIGHT_MESUREMENT / total) * 100) : 0,
          color: "hsl(var(--success))",
        },
        {
          name: "Front Loading",
          value: total > 0 ? Math.round((typeCount.FRONT_LOADING_MESUREMENT / total) * 100) : 0,
          color: "hsl(var(--warning))",
        },
        {
          name: "Other",
          value: total > 0 ? Math.round((typeCount.OTHER / total) * 100) : 0,
          color: "hsl(var(--muted-foreground))",
        },
      ];
    },
  });
}

// Hook for Dump Truck Estimated Load by Type
export function useHourlyProductivityTrend() {
  return useQuery({
    queryKey: ["hourly-productivity-trend"],
    queryFn: async () => {
      const [{ data: dumpData, error: dumpError }, { data: typeData, error: typeError }] =
        await Promise.all([
          supabase.from("DUMP_TRUCK_DATA").select("DUMP_TRUCK_TYPE_FK, ESTIMATED_LOAD"),
          supabase.from("DUMP_TRUCK_TYPE").select("ID, TYPE"),
        ]);

      if (dumpError) throw dumpError;
      if (typeError) throw typeError;

      const typeMap: Record<number, string> = {};
      (typeData || []).forEach((row) => {
        typeMap[row.ID] = row.TYPE;
      });

      const loadMap: Record<number, number[]> = {};
      (dumpData || []).forEach((row) => {
        if (!row.DUMP_TRUCK_TYPE_FK || row.ESTIMATED_LOAD === null) return;
        if (!loadMap[row.DUMP_TRUCK_TYPE_FK]) loadMap[row.DUMP_TRUCK_TYPE_FK] = [];
        loadMap[row.DUMP_TRUCK_TYPE_FK].push(Number(row.ESTIMATED_LOAD));
      });

      return Object.entries(loadMap).map(([typeId, values]) => ({
        hour: typeMap[Number(typeId)] || `Type ${typeId}`,
        value: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      }));
    },
  });
}
