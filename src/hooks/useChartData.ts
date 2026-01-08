import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Hook for Productivity Chart - productivity per unit
export function useProductivityByUnit() {
  return useQuery({
    queryKey: ["productivity-by-unit"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      
      const { data, error } = await supabase
        .from("productivity_metrics")
        .select("unit_id, productivity_percentage")
        .eq("date", today);
      
      if (error) throw error;
      
      // Group by unit_id and calculate average productivity
      const unitMap: { [key: string]: number[] } = {};
      (data || []).forEach((item) => {
        if (item.unit_id && item.productivity_percentage !== null) {
          if (!unitMap[item.unit_id]) unitMap[item.unit_id] = [];
          unitMap[item.unit_id].push(item.productivity_percentage);
        }
      });
      
      return Object.entries(unitMap).map(([unitId, values]) => ({
        name: unitId,
        productivity: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
        target: 50, // Default target
      }));
    },
  });
}

// Hook for Cycle Time Chart - cycle times by hour
export function useCycleTimeByHour() {
  return useQuery({
    queryKey: ["cycle-time-by-hour"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      
      const { data, error } = await supabase
        .from("productivity_metrics")
        .select("hour, cycle_time_dig, cycle_time_swing, cycle_time_dump")
        .eq("date", today)
        .order("hour", { ascending: true });
      
      if (error) throw error;
      
      // Group by hour and calculate averages
      const hourMap: { [key: number]: { dig: number[]; swing: number[]; dump: number[] } } = {};
      (data || []).forEach((item) => {
        if (item.hour !== null) {
          if (!hourMap[item.hour]) {
            hourMap[item.hour] = { dig: [], swing: [], dump: [] };
          }
          if (item.cycle_time_dig !== null) hourMap[item.hour].dig.push(item.cycle_time_dig);
          if (item.cycle_time_swing !== null) hourMap[item.hour].swing.push(item.cycle_time_swing);
          if (item.cycle_time_dump !== null) hourMap[item.hour].dump.push(item.cycle_time_dump);
        }
      });
      
      return Object.entries(hourMap)
        .map(([hour, values]) => ({
          time: `${hour.padStart(2, "0")}:00`,
          digging: values.dig.length > 0 ? Math.round(values.dig.reduce((a, b) => a + b, 0) / values.dig.length) : 0,
          swinging: values.swing.length > 0 ? Math.round(values.swing.reduce((a, b) => a + b, 0) / values.swing.length) : 0,
          dumping: values.dump.length > 0 ? Math.round(values.dump.reduce((a, b) => a + b, 0) / values.dump.length) : 0,
        }))
        .sort((a, b) => a.time.localeCompare(b.time));
    },
  });
}

// Hook for Status Pie Chart - fleet status distribution
export function useFleetStatusDistribution() {
  return useQuery({
    queryKey: ["fleet-status-distribution"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fleet_units")
        .select("status");
      
      if (error) throw error;
      
      const total = data?.length || 0;
      const statusCount = {
        Active: 0,
        Idle: 0,
        Maintenance: 0,
      };
      
      (data || []).forEach((unit) => {
        if (unit.status in statusCount) {
          statusCount[unit.status as keyof typeof statusCount]++;
        }
      });
      
      return [
        { 
          name: "Active", 
          value: total > 0 ? Math.round((statusCount.Active / total) * 100) : 0, 
          color: "hsl(var(--success))" 
        },
        { 
          name: "Idle", 
          value: total > 0 ? Math.round((statusCount.Idle / total) * 100) : 0, 
          color: "hsl(var(--warning))" 
        },
        { 
          name: "Maintenance", 
          value: total > 0 ? Math.round((statusCount.Maintenance / total) * 100) : 0, 
          color: "hsl(var(--destructive))" 
        },
      ];
    },
  });
}

// Hook for Hourly Productivity Chart
export function useHourlyProductivityTrend() {
  return useQuery({
    queryKey: ["hourly-productivity-trend"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      
      const { data, error } = await supabase
        .from("productivity_metrics")
        .select("hour, productivity_percentage")
        .eq("date", today)
        .order("hour", { ascending: true });
      
      if (error) throw error;
      
      // Group by hour and calculate average
      const hourMap: { [key: number]: number[] } = {};
      (data || []).forEach((item) => {
        if (item.hour !== null && item.productivity_percentage !== null) {
          if (!hourMap[item.hour]) hourMap[item.hour] = [];
          hourMap[item.hour].push(item.productivity_percentage);
        }
      });
      
      return Object.entries(hourMap)
        .map(([hour, values]) => ({
          hour: hour.padStart(2, "0"),
          value: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
        }))
        .sort((a, b) => a.hour.localeCompare(b.hour));
    },
  });
}
