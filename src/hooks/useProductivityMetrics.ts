import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProductivityMetric {
  id: string;
  unit_id: string | null;
  date: string;
  hour: number | null;
  productivity_percentage: number | null;
  cycle_time_dig: number | null;
  cycle_time_swing: number | null;
  cycle_time_dump: number | null;
  loads_count: number;
  volume_m3: number | null;
  created_at: string;
}

export function useProductivityMetrics(unitId?: string) {
  return useQuery({
    queryKey: ["productivity-metrics", unitId],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      
      let q = supabase
        .from("productivity_metrics")
        .select("*")
        .eq("date", today)
        .order("hour", { ascending: true });
      
      if (unitId) {
        q = q.eq("unit_id", unitId);
      }
      
      const { data, error } = await q;
      
      if (error) throw error;
      return data as ProductivityMetric[];
    },
  });
}

export function useHourlyProductivity() {
  return useQuery({
    queryKey: ["hourly-productivity"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      
      const { data, error } = await supabase
        .from("productivity_metrics")
        .select("hour, productivity_percentage")
        .eq("date", today)
        .order("hour", { ascending: true });
      
      if (error) throw error;
      
      // Group by hour and calculate average
      const hourlyData: { [key: number]: number[] } = {};
      (data || []).forEach((item: { hour: number | null; productivity_percentage: number | null }) => {
        if (item.hour !== null && item.productivity_percentage !== null) {
          if (!hourlyData[item.hour]) hourlyData[item.hour] = [];
          hourlyData[item.hour].push(item.productivity_percentage);
        }
      });
      
      return Object.entries(hourlyData).map(([hour, values]) => ({
        time: `${hour.padStart(2, "0")}:00`,
        productivity: values.reduce((a, b) => a + b, 0) / values.length,
      }));
    },
  });
}
