import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pb } from "@/integrations/pocketbase/client";
import { toast } from "sonner"; // Assuming sonner is installed/used

export interface VisionAnalysis {
  id: string;
  video_name: string;
  recorded_at: string;
  location: string;
  duration: string;
  status: "Analyzed" | "Processing" | "Pending";
  notes: string;
  created: string;
}

export interface CreateVisionDTO {
  video_name: string;
  recorded_at: string;
  location: string;
  duration?: string;
  status: "Analyzed" | "Processing" | "Pending";
  notes?: string;
}

export function useVisionResults() {
  return useQuery({
    queryKey: ["vision_analysis"],
    queryFn: async () => {
      const records = await pb.collection("vision_analysis").getFullList({
        sort: "-recorded_at",
      });
      return records as unknown as VisionAnalysis[];
    },
  });
}

export function useCreateVisionResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateVisionDTO) => {
      return await pb.collection("vision_analysis").create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vision_analysis"] });
      toast.success("Data video berhasil ditambahkan");
    },
    onError: (error) => {
      toast.error("Gagal menambahkan data: " + error.message);
    },
  });
}

export function useUpdateVisionResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateVisionDTO> }) => {
      return await pb.collection("vision_analysis").update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vision_analysis"] });
      toast.success("Data video berhasil diperbarui");
    },
    onError: (error) => {
      toast.error("Gagal memperbarui data: " + error.message);
    },
  });
}

export function useDeleteVisionResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return await pb.collection("vision_analysis").delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vision_analysis"] });
      toast.success("Data video berhasil dihapus");
    },
    onError: (error) => {
      toast.error("Gagal menghapus data: " + error.message);
    },
  });
}
