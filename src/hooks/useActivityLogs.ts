import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
      let q = supabase
        .from("activity_logs")
        .select("*")
        .order("timestamp", { ascending: false });
      
      if (limit) {
        q = q.limit(limit);
      }
      
      const { data, error } = await q;
      
      if (error) throw error;
      return data as ActivityLog[];
    },
  });

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("activity-logs-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_logs",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["activity-logs"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}
