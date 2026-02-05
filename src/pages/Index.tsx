import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, Loader2 } from "lucide-react";
import { useVisionResults, useCreateVisionResult, useUpdateVisionResult, useDeleteVisionResult, CreateVisionDTO, VisionAnalysis } from "@/hooks/useVisionResults";
import { format } from "date-fns";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";

export default function Index() {
  const { data: visionResults, isLoading } = useVisionResults();
  const createMutation = useCreateVisionResult();
  const updateMutation = useUpdateVisionResult();
  const deleteMutation = useDeleteVisionResult();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Form State
  const [formData, setFormData] = useState<CreateVisionDTO>({
    video_name: "",
    recorded_at: "",
    location: "",
    duration: "",
    status: "Pending",
    notes: "",
  });

  const resetForm = () => {
    setFormData({
      video_name: "",
      recorded_at: "",
      location: "",
      duration: "",
      status: "Pending",
      notes: "",
    });
    setEditingId(null);
  };

  const handleEdit = (item: VisionAnalysis) => {
    setEditingId(item.id);
    setFormData({
      video_name: item.video_name,
      recorded_at: item.recorded_at.slice(0, 16), // Format for datetime-local
      location: item.location,
      duration: item.duration,
      status: item.status,
      notes: item.notes,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    // In a real app, use a confirmation dialog here
    if (window.confirm("Apakah Anda yakin ingin menghapus data ini?")) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, data: formData });
      } else {
        await createMutation.mutateAsync(formData);
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error(error);
    }
  };

  const filteredResults = visionResults?.filter(item =>
    item.video_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.location.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <DashboardLayout>
      <Header
        title="Data Computer Vision"
        subtitle="Kelola data hasil analisis video CCTV dan Drone"
      />

      <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Cari video atau lokasi..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="w-full md:w-auto gap-2">
              <Plus className="w-4 h-4" />
              Tambah Data Video
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Data Video" : "Tambah Data Video Baru"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="video_name">Nama Video</Label>
                <Input
                  id="video_name"
                  value={formData.video_name}
                  onChange={(e) => setFormData({ ...formData, video_name: e.target.value })}
                  required
                  placeholder="Contoh: CCTV Pit A - Pagi"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="recorded_at">Waktu Rekam</Label>
                  <Input
                    id="recorded_at"
                    type="datetime-local"
                    value={formData.recorded_at}
                    onChange={(e) => setFormData({ ...formData, recorded_at: e.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="duration">Durasi</Label>
                  <Input
                    id="duration"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    placeholder="05:30"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="location">Lokasi</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  required
                  placeholder="Contoh: Loading Point 3"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="status">Status Analisis</Label>
                <Select
                  value={formData.status}
                  onValueChange={(val: any) => setFormData({ ...formData, status: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Processing">Processing</SelectItem>
                    <SelectItem value="Analyzed">Analyzed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="notes">Catatan Tambahan</Label>
                <Input
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Keterangan hasil analisis singkat..."
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Simpan Data
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama Video</TableHead>
                <TableHead>Waktu Rekam</TableHead>
                <TableHead>Lokasi</TableHead>
                <TableHead>Durasi</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Catatan</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <div className="flex justify-center items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      <span>Memuat data...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredResults.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Belum ada data video yang tersimpan.
                  </TableCell>
                </TableRow>
              ) : (
                filteredResults.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.video_name}</TableCell>
                    <TableCell>
                      {item.recorded_at ? format(new Date(item.recorded_at), "dd MMM yyyy, HH:mm") : "-"}
                    </TableCell>
                    <TableCell>{item.location}</TableCell>
                    <TableCell>{item.duration || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={
                        item.status === "Analyzed" ? "default" :
                          item.status === "Processing" ? "secondary" : "outline"
                      }>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={item.notes}>{item.notes || "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                          <Pencil className="w-4 h-4 text-primary" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
