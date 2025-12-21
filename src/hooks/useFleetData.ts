import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface FleetUnit {
  id: string;
  unit_id: string;
  type: "Excavator" | "Dump Truck" | "Loader" | "Dozer";
  location: string;
  status: "Active" | "Idle" | "Maintenance";
  operator: string | null;
  productivity: number | null;
  last_update: string;
  created_at: string;
}

export function useFleetUnits(limit?: number) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["fleet-units", limit],
    queryFn: async () => {
      let q = supabase
        .from("fleet_units")
        .select("*")
        .order("last_update", { ascending: false });
      
      if (limit) {
        q = q.limit(limit);
      }
      
      const { data, error } = await q;
      
      if (error) throw error;
      return data as FleetUnit[];
    },
  });

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("fleet-units-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "fleet_units",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["fleet-units"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export function useFleetSummary() {
  return useQuery({
    queryKey: ["fleet-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fleet_units")
        .select("type, status");
      
      if (error) throw error;
      
      const summary = {
        totalExcavators: 0,
        activeExcavators: 0,
        totalDumpTrucks: 0,
        activeDumpTrucks: 0,
        totalActive: 0,
        totalIdle: 0,
        totalMaintenance: 0,
      };
      
      (data || []).forEach((unit: { type: string; status: string }) => {
        if (unit.type === "Excavator") {
          summary.totalExcavators++;
          if (unit.status === "Active") summary.activeExcavators++;
        }
        if (unit.type === "Dump Truck") {
          summary.totalDumpTrucks++;
          if (unit.status === "Active") summary.activeDumpTrucks++;
        }
        if (unit.status === "Active") summary.totalActive++;
        if (unit.status === "Idle") summary.totalIdle++;
        if (unit.status === "Maintenance") summary.totalMaintenance++;
      });
      
      return summary;
    },
  });
}
