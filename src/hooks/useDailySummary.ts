import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DailySummary {
  id: string;
  date: string;
  total_excavators: number;
  active_excavators: number;
  total_dump_trucks: number;
  active_dump_trucks: number;
  avg_cycle_time: number | null;
  overall_efficiency: number | null;
  total_loads: number;
  total_volume_m3: number | null;
  created_at: string;
}

export function useDailySummary() {
  return useQuery({
    queryKey: ["daily-summary"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      
      const { data, error } = await supabase
        .from("daily_summary")
        .select("*")
        .eq("date", today)
        .maybeSingle();
      
      if (error) throw error;
      return data as DailySummary | null;
    },
  });
}
