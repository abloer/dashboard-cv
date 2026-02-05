import { useQuery } from "@tanstack/react-query";
import { pb } from "@/integrations/pocketbase/client";

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

      try {
        const record = await pb.collection("daily_summary").getFirstListItem(`date ~ "${today}"`);
        return {
          id: record.id,
          date: record.date,
          total_excavators: record.total_excavators,
          active_excavators: record.active_excavators,
          total_dump_trucks: record.total_dump_trucks,
          active_dump_trucks: record.active_dump_trucks,
          avg_cycle_time: record.avg_cycle_time,
          overall_efficiency: record.overall_efficiency,
          total_loads: record.total_loads,
          total_volume_m3: record.total_volume_m3,
          created_at: record.created,
        } as DailySummary;
      } catch (err) {
        // Jika tidak ada data untuk hari ini
        return null;
      }
    },
  });
}
