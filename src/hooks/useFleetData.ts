import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pb } from "@/integrations/pocketbase/client";
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
      const records = await pb.collection("fleet_units").getList(1, limit || 50, {
        sort: "-last_update",
      });

      return records.items.map(record => ({
        id: record.id,
        unit_id: record.unit_id,
        type: record.type,
        location: record.location,
        status: record.status,
        operator: record.operator,
        productivity: record.productivity,
        last_update: record.last_update,
        created_at: record.created,
      })) as FleetUnit[];
    },
  });

  // Subscribe to realtime updates
  useEffect(() => {
    pb.collection("fleet_units").subscribe("*", () => {
      queryClient.invalidateQueries({ queryKey: ["fleet-units"] });
      queryClient.invalidateQueries({ queryKey: ["fleet-summary"] });
    });

    return () => {
      pb.collection("fleet_units").unsubscribe("*");
    };
  }, [queryClient]);

  return query;
}

export function useFleetSummary() {
  return useQuery({
    queryKey: ["fleet-summary"],
    queryFn: async () => {
      const records = await pb.collection("fleet_units").getFullList({
        fields: "type,status",
      });

      const summary = {
        totalExcavators: 0,
        activeExcavators: 0,
        totalDumpTrucks: 0,
        activeDumpTrucks: 0,
        totalActive: 0,
        totalIdle: 0,
        totalMaintenance: 0,
      };

      records.forEach((unit) => {
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
