import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pb } from "@/integrations/pocketbase/client";
import { useEffect } from "react";

export interface ActivityLog {
  id: string;
  unit_id: string | null;
  timestamp: string;
  activity: string;
  result: string;
  result_type: "success" | "warning" | "info" | "error";
  created_at: string;
}

export function useActivityLogs(limit?: number) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["activity-logs", limit],
    queryFn: async () => {
      const records = await pb.collection("activity_logs").getList(1, limit || 50, {
        sort: "-timestamp",
      });

      return records.items.map(record => ({
        id: record.id,
        unit_id: record.unit_id,
        timestamp: record.timestamp,
        activity: record.activity,
        result: record.result,
        result_type: record.result_type,
        created_at: record.created,
      })) as ActivityLog[];
    },
  });

  // Subscribe to realtime updates
  useEffect(() => {
    pb.collection("activity_logs").subscribe("*", (e) => {
      if (e.action === "create") {
        queryClient.invalidateQueries({ queryKey: ["activity-logs"] });
      }
    });

    return () => {
      pb.collection("activity_logs").unsubscribe("*");
    };
  }, [queryClient]);

  return query;
}
