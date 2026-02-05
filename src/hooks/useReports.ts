import { useQuery } from "@tanstack/react-query";
import { pb } from "@/integrations/pocketbase/client";

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
      const records = await pb.collection("reports").getFullList({
        sort: "-date_generated",
      });

      return records.map(record => ({
        id: record.id,
        name: record.name,
        report_type: record.report_type,
        date_generated: record.date_generated,
        date_range_start: record.date_range_start,
        date_range_end: record.date_range_end,
        file_size: record.file_size,
        file_path: record.file_path,
        created_at: record.created,
      })) as Report[];
    },
  });
}
