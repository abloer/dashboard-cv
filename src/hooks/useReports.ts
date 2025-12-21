import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Report {
  id: string;
  name: string;
  report_type: string;
  date_generated: string;
  date_range_start: string | null;
  date_range_end: string | null;
  file_size: string | null;
  file_path: string | null;
  created_at: string;
}

export function useReports() {
  return useQuery({
    queryKey: ["reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .order("date_generated", { ascending: false });
      
      if (error) throw error;
      return data as Report[];
    },
  });
}
