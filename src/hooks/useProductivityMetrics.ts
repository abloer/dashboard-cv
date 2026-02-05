import { useQuery } from "@tanstack/react-query";
import { pb } from "@/integrations/pocketbase/client";

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

      let filter = `date ~ "${today}"`;
      if (unitId) {
        filter += ` && unit_id = "${unitId}"`;
      }

      const records = await pb.collection("productivity_metrics").getFullList({
        filter: filter,
        sort: "hour",
      });

      return records.map(record => ({
        id: record.id,
        unit_id: record.unit_id,
        date: record.date,
        hour: record.hour,
        productivity_percentage: record.productivity_percentage,
        cycle_time_dig: record.cycle_time_dig,
        cycle_time_swing: record.cycle_time_swing,
        cycle_time_dump: record.cycle_time_dump,
        loads_count: record.loads_count,
        volume_m3: record.volume_m3,
        created_at: record.created,
      })) as ProductivityMetric[];
    },
  });
}

export function useHourlyProductivity() {
  return useQuery({
    queryKey: ["hourly-productivity"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      const records = await pb.collection("productivity_metrics").getFullList({
        filter: `date ~ "${today}"`,
        fields: "hour,productivity_percentage",
        sort: "hour",
      });

      // Group by hour and calculate average
      const hourlyData: { [key: number]: number[] } = {};
      records.forEach((item) => {
        if (item.hour !== null && item.productivity_percentage !== null) {
          if (!hourlyData[item.hour]) hourlyData[item.hour] = [];
          hourlyData[item.hour].push(item.productivity_percentage);
        }
      });

      return Object.entries(hourlyData).map(([hour, values]) => {
        const h = parseInt(hour);
        return {
          time: `${h.toString().padStart(2, "0")}:00`,
          productivity: values.reduce((a, b) => a + b, 0) / values.length,
        };
      });
    },
  });
}
