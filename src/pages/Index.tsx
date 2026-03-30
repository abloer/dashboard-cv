import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Camera,
  FileUp,
  HardDriveUpload,
  Loader2,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
  Video,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateMediaSource,
  useDeleteMediaSource,
  useMediaRegistry,
  useUpdateMediaSourceMonitoring,
  useUpdateMediaSource,
  useUpdateMediaSourceStatus,
} from "@/hooks/useMediaRegistry";
import type {
  MediaExecutionMode,
  MediaMonitoringStatus,
  MediaSource,
  MediaStatus,
  MediaType,
} from "@/lib/mediaRegistry";
import { deleteUploadedVideo, uploadVideoFile } from "@/lib/noHelmetAnalysis";

interface MediaFormState {
  name: string;
  location: string;
  source: string;
  type: MediaType;
  status: MediaStatus;
  analytics: string[];
  executionMode: MediaExecutionMode;
  monitoringIntervalSeconds: string;
  note: string;
}

const ANALYSIS_CATEGORY_OPTIONS = [
  {
    value: "HSE",
    label: "HSE",
    description: "Output utama untuk keselamatan kerja dan compliance umum.",
  },
  {
    value: "PPE",
    label: "PPE",
    description: "Output utama untuk alat pelindung diri dan inspeksi kepatuhan APD.",
  },
  {
    value: "Operations",
    label: "Operations",
    description: "Output utama untuk visibilitas operasional area dan aktivitas personel.",
  },
  {
    value: "Fleet & KPI",
    label: "Fleet & KPI",
    description: "Output utama untuk KPI armada, pergerakan alat, dan performa produksi.",
  },
] as const;

const EMPTY_FORM: MediaFormState = {
  name: "",
  location: "",
  source: "",
  type: "upload",
  status: "active",
  analytics: ["PPE"],
  executionMode: "manual",
  monitoringIntervalSeconds: "",
  note: "",
};

const statusBadgeVariant: Record<MediaStatus, "default" | "secondary" | "destructive"> = {
  active: "default",
  inactive: "secondary",
  maintenance: "destructive",
};

const typeBadgeVariant: Record<MediaType, "default" | "secondary"> = {
  upload: "secondary",
  camera: "default",
};
const monitoringBadgeVariant: Record<MediaMonitoringStatus, "default" | "secondary" | "outline"> = {
  idle: "secondary",
  running: "default",
  paused: "outline",
};

const formatMediaType = (value: MediaType) => (value === "upload" ? "Upload" : "Camera");
const formatMediaStatus = (value: MediaStatus) =>
  value === "active" ? "Active" : value === "inactive" ? "Inactive" : "Maintenance";
const formatExecutionMode = (value: MediaExecutionMode) =>
  value === "manual" ? "Manual" : value === "scheduled" ? "Scheduled" : "Continuous";
const formatMonitoringStatus = (value: MediaMonitoringStatus) =>
  value === "running" ? "Running" : value === "paused" ? "Paused" : "Idle";

const asPayload = (formState: MediaFormState) => ({
  name: formState.name.trim(),
  location: formState.location.trim(),
  source: formState.source.trim(),
  type: formState.type,
  status: formState.status,
  analytics: formState.analytics,
  executionMode: formState.type === "upload" ? "manual" : formState.executionMode,
  monitoringStatus:
    formState.type === "upload"
      ? ("idle" satisfies MediaMonitoringStatus)
      : (formState.executionMode === "manual" ? "idle" : "paused"),
  monitoringIntervalSeconds:
    formState.type === "camera" && formState.executionMode === "scheduled"
      ? Number(formState.monitoringIntervalSeconds || "15")
      : null,
  note: formState.note.trim(),
});

const humanizeRequestError = (error: unknown) => {
  const fallback = "Permintaan gagal diproses.";
  if (!(error instanceof Error)) return fallback;
  if (error.message === "Failed to fetch" || error.message === "Load failed") {
    return "Tidak bisa menjangkau service backend dari browser. Periksa container backend dan proxy /api.";
  }
  return error.message || fallback;
};

export default function Index() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { data: mediaItems = [], isLoading, isError, error } = useMediaRegistry();
  const createMutation = useCreateMediaSource();
  const updateMutation = useUpdateMediaSource();
  const updateStatusMutation = useUpdateMediaSourceStatus();
  const updateMonitoringMutation = useUpdateMediaSourceMonitoring();
  const deleteMutation = useDeleteMediaSource();

  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | MediaType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | MediaStatus>("all");
  const [isAccelerationEnabled, setIsAccelerationEnabled] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<MediaFormState>(EMPTY_FORM);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const filteredMedia = useMemo(() => {
    return mediaItems.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.source.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === "all" || item.type === typeFilter;
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [mediaItems, searchTerm, typeFilter, statusFilter]);

  const stats = useMemo(() => {
    const cameraCount = mediaItems.filter((item) => item.type === "camera").length;
    const uploadCount = mediaItems.filter((item) => item.type === "upload").length;
    const monitoringCount = mediaItems.filter((item) => item.monitoringStatus === "running").length;
    return { cameraCount, uploadCount, monitoringCount };
  }, [mediaItems]);

  const isSubmitting =
    createMutation.isPending ||
    updateMutation.isPending ||
    updateStatusMutation.isPending ||
    updateMonitoringMutation.isPending ||
    deleteMutation.isPending ||
    isUploadingFile;

  const resetForm = () => {
    setEditingId(null);
    setFormState(EMPTY_FORM);
    setSelectedUploadFile(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (item: MediaSource) => {
    setEditingId(item.id);
    setFormState({
      name: item.name,
      location: item.location,
      source: item.source,
      type: item.type,
      status: item.status,
      analytics: item.analytics,
      executionMode: item.executionMode,
      monitoringIntervalSeconds:
        typeof item.monitoringIntervalSeconds === "number"
          ? String(item.monitoringIntervalSeconds)
          : "",
      note: item.note,
    });
    setDialogOpen(true);
  };

  const saveMediaItem = async () => {
    let payload = asPayload(formState);
    let uploadedVideoPath: string | null = null;

    if (!payload.name || !payload.location) {
      toast({
        title: "Form belum lengkap",
        description: "Nama source dan lokasi wajib diisi.",
        variant: "destructive",
      });
      return;
    }

    if (payload.type === "camera" && !payload.source) {
      toast({
        title: "URL camera belum diisi",
        description: "Masukkan RTSP/URL source untuk camera stream.",
        variant: "destructive",
      });
      return;
    }

    if (payload.type === "camera" && payload.executionMode === "scheduled") {
      const interval = Number(formState.monitoringIntervalSeconds || "0");
      if (!Number.isFinite(interval) || interval <= 0) {
        toast({
          title: "Interval monitoring belum valid",
          description: "Isi interval sampling dalam detik untuk mode scheduled.",
          variant: "destructive",
        });
        return;
      }
    }

    if (payload.type === "upload" && !selectedUploadFile && !editingId) {
      toast({
        title: "File video belum dipilih",
        description: "Pilih file video yang akan diupload untuk source baru.",
        variant: "destructive",
      });
      return;
    }

    if (payload.type === "upload" && selectedUploadFile) {
      try {
        setIsUploadingFile(true);
        const uploaded = await uploadVideoFile(selectedUploadFile);
        uploadedVideoPath = uploaded.videoPath;
        payload = {
          ...payload,
          source: uploaded.videoPath,
          lastSeen: uploaded.warning
            ? `${selectedUploadFile.name} uploaded, metadata terbatas`
            : `${selectedUploadFile.name} uploaded`,
        };
      } catch (uploadError) {
        toast({
          title: "Upload video gagal",
          description:
            uploadError instanceof Error ? uploadError.message : "Terjadi kesalahan saat upload video.",
          variant: "destructive",
        });
        setIsUploadingFile(false);
        return;
      }
    }

    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, payload });
        toast({
          title: "Source diperbarui",
          description: "Perubahan konfigurasi source berhasil disimpan.",
        });
      } else {
        await createMutation.mutateAsync(payload);
        toast({
          title: "Source ditambahkan",
          description: "Source baru masuk ke daftar Media Sources.",
        });
      }
      setDialogOpen(false);
      resetForm();
    } catch (mutationError) {
      if (!editingId && uploadedVideoPath) {
        try {
          await deleteUploadedVideo(uploadedVideoPath);
        } catch (_rollbackError) {
          // The file can be recovered manually from the upload directory if cleanup fails.
        }
      }
      toast({
        title: "Gagal menyimpan source",
        description: humanizeRequestError(mutationError),
        variant: "destructive",
      });
    } finally {
      setIsUploadingFile(false);
    }
  };

  const deleteMediaItem = async (item: MediaSource) => {
    try {
      await deleteMutation.mutateAsync(item.id);
      toast({
        title: "Source dihapus",
        description: `${item.name} dikeluarkan dari daftar Media Sources.`,
      });
    } catch (mutationError) {
      toast({
        title: "Gagal menghapus source",
        description:
          mutationError instanceof Error ? mutationError.message : "Terjadi kesalahan saat menghapus source.",
        variant: "destructive",
      });
    }
  };

  const toggleStatus = async (item: MediaSource) => {
    const nextStatus: MediaStatus = item.status === "active" ? "inactive" : "active";
    try {
      await updateStatusMutation.mutateAsync({ id: item.id, status: nextStatus });
      toast({
        title: "Status media diperbarui",
        description: `${item.name} sekarang ${formatMediaStatus(nextStatus)}.`,
      });
    } catch (mutationError) {
      toast({
        title: "Gagal memperbarui status",
        description:
          mutationError instanceof Error ? mutationError.message : "Terjadi kesalahan saat memperbarui status.",
        variant: "destructive",
      });
    }
  };

  const openAnalysisSetup = (item: MediaSource) => {
    navigate(`/analysis-setup?sourceId=${encodeURIComponent(item.id)}`);
    toast({
      title: "Source dikirim ke Setup Analysis",
      description: `${item.name} siap dipakai di Analysis Setup tanpa isi ulang source secara manual.`,
    });
  };

  const openRunAnalysis = (item: MediaSource) => {
    navigate(`/run-analysis?sourceId=${encodeURIComponent(item.id)}`);
    toast({
      title: "Run Analysis dibuka",
      description: `${item.name} siap menjalankan modul analysis sesuai kategori output yang aktif pada source ini.`,
    });
  };

  const openLiveMonitoring = (item: MediaSource) => {
    navigate(`/live-monitoring?sourceId=${encodeURIComponent(item.id)}`);
    toast({
      title: "Live Monitoring dibuka",
      description: `Status monitoring otomatis untuk ${item.name} siap ditinjau.`,
    });
  };

  const openSourceResult = (item: MediaSource) => {
    navigate(`/output-data?sourceId=${encodeURIComponent(item.id)}`);
    toast({
      title: "View Result dibuka",
      description: `Dashboard akan menampilkan summary terakhir untuk ${item.name}.`,
    });
  };

  const toggleAnalyticFeature = (feature: string, checked: boolean) => {
    setFormState((current) => {
      const nextAnalytics = checked
        ? Array.from(new Set([...current.analytics, feature]))
        : current.analytics.filter((item) => item !== feature);

      return {
        ...current,
        analytics: nextAnalytics,
      };
    });
  };

  const toggleMonitoring = async (item: MediaSource) => {
    const nextMonitoringStatus: MediaMonitoringStatus =
      item.monitoringStatus === "running" ? "paused" : "running";

    try {
      await updateMonitoringMutation.mutateAsync({
        id: item.id,
        executionMode:
          item.type === "camera" && item.executionMode === "manual"
            ? "continuous"
            : item.executionMode,
        monitoringStatus: nextMonitoringStatus,
        monitoringIntervalSeconds: item.monitoringIntervalSeconds,
      });
      toast({
        title:
          nextMonitoringStatus === "running"
            ? "Monitoring otomatis aktif"
            : "Monitoring otomatis dijeda",
        description:
          nextMonitoringStatus === "running"
            ? `${item.name} sekarang dipantau secara ${formatExecutionMode(
                item.type === "camera" && item.executionMode === "manual"
                  ? "continuous"
                  : item.executionMode
              ).toLowerCase()}.`
            : `${item.name} dihentikan sementara dari monitoring otomatis.`,
      });
    } catch (mutationError) {
      toast({
        title: "Gagal memperbarui monitoring",
        description:
          mutationError instanceof Error
            ? mutationError.message
            : "Terjadi kesalahan saat mengubah status monitoring.",
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardLayout>
      <Header
        title="Media Sources"
        subtitle="Kelola video upload dan camera stream yang tersambung ke sistem analitik dalam satu daftar operasional."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-6">
        <Card className="border-cyan-500/20 bg-cyan-500/5">
          <CardContent className="p-5 space-y-1">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total Media</p>
            <p className="text-3xl font-semibold">{mediaItems.length}</p>
            <p className="text-sm text-muted-foreground">Semua source yang terdaftar</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-5 space-y-1">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Camera Live</p>
            <p className="text-3xl font-semibold">{stats.cameraCount}</p>
            <p className="text-sm text-muted-foreground">Sumber RTSP / IP camera</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-5 space-y-1">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Upload Library</p>
            <p className="text-3xl font-semibold">{stats.uploadCount}</p>
            <p className="text-sm text-muted-foreground">Video batch untuk simulasi</p>
          </CardContent>
        </Card>
        <Card className="border-indigo-500/20 bg-indigo-500/5">
          <CardContent className="p-5 space-y-1">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Monitoring Aktif</p>
            <p className="text-3xl font-semibold">{stats.monitoringCount}</p>
            <p className="text-sm text-muted-foreground">Source camera yang sedang dipantau otomatis</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="text-2xl">List Data Source</CardTitle>
            <CardDescription>
              Manajemen video upload dan kamera live yang dipakai sistem untuk analisis.
            </CardDescription>
          </div>
          <Button onClick={openCreateDialog} className="gap-2 h-11 px-5">
            <Plus className="w-4 h-4" />
            Add Source
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-[1.2fr,200px,200px]">
            <div className="space-y-2">
              <Label htmlFor="media-search">Search sources</Label>
              <Input
                id="media-search"
                placeholder="Cari nama lokasi, nama video, atau alamat camera..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Filter tipe</Label>
              <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as "all" | MediaType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua tipe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua tipe</SelectItem>
                  <SelectItem value="upload">Upload</SelectItem>
                  <SelectItem value="camera">Camera</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Filter status</Label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | MediaStatus)}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/70 bg-secondary/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Lokasi</TableHead>
                  <TableHead>Sumber</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Execution</TableHead>
                  <TableHead>Monitoring</TableHead>
                  <TableHead>Kategori Output</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-28 text-center">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Memuat daftar source...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : isError ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-28 text-center text-destructive">
                      {error instanceof Error ? error.message : "Gagal memuat daftar source."}
                    </TableCell>
                  </TableRow>
                ) : filteredMedia.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-28 text-center text-muted-foreground">
                      Belum ada source yang cocok dengan filter saat ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMedia.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="min-w-[240px]">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-secondary">
                            {item.type === "camera" ? (
                              <Camera className="h-5 w-5 text-primary" />
                            ) : (
                              <HardDriveUpload className="h-5 w-5 text-primary" />
                            )}
                          </div>
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">{item.name}</p>
                            <p className="text-xs text-muted-foreground">{item.note || "Tidak ada catatan"}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{item.location}</TableCell>
                      <TableCell className="max-w-[240px] truncate text-muted-foreground">{item.source}</TableCell>
                      <TableCell>
                        <Badge variant={typeBadgeVariant[item.type]}>{formatMediaType(item.type)}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge variant="outline">{formatExecutionMode(item.executionMode)}</Badge>
                          {item.executionMode === "scheduled" && item.monitoringIntervalSeconds ? (
                            <p className="text-xs text-muted-foreground">
                              {item.monitoringIntervalSeconds}s interval
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={monitoringBadgeVariant[item.monitoringStatus]}>
                          {formatMonitoringStatus(item.monitoringStatus)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {item.analytics.map((analytic) => (
                            <Badge key={`${item.id}-${analytic}`} variant="outline" className="border-primary/20">
                              {analytic}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant[item.status]}>{formatMediaStatus(item.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.lastSeen}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={isSubmitting}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => openAnalysisSetup(item)}>
                              <ArrowUpRight className="mr-2 h-4 w-4" />
                              Setup Analysis
                            </DropdownMenuItem>
                            {item.type === "camera" ? (
                              <>
                                {item.executionMode === "manual" ? (
                                  <DropdownMenuItem onClick={() => openRunAnalysis(item)}>
                                    <Play className="mr-2 h-4 w-4" />
                                    Run Analysis
                                  </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuItem onClick={() => toggleMonitoring(item)}>
                                  <ShieldCheck className="mr-2 h-4 w-4" />
                                  {item.monitoringStatus === "running"
                                    ? "Stop Monitoring"
                                    : item.executionMode === "manual"
                                      ? "Start Monitoring"
                                      : "Start Monitoring"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openLiveMonitoring(item)}>
                                  <Camera className="mr-2 h-4 w-4" />
                                  Open Monitoring
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <DropdownMenuItem onClick={() => openRunAnalysis(item)}>
                                <Play className="mr-2 h-4 w-4" />
                                Run Analysis
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => openSourceResult(item)}>
                              <BarChart3 className="mr-2 h-4 w-4" />
                              View Result
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditDialog(item)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit source
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleStatus(item)}>
                              <ShieldCheck className="mr-2 h-4 w-4" />
                              {item.status === "active" ? "Set inactive" : "Set active"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => deleteMediaItem(item)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <Card className="border-border/60 bg-secondary/10">
            <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
                  <Video className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Hardware Acceleration</h3>
                  <p className="text-sm text-muted-foreground">
                    Aktifkan akselerasi jika GPU tersedia agar proses inferensi lebih stabil untuk source live dan batch.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 self-end md:self-auto">
                <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {isAccelerationEnabled ? "GPU Preferred" : "CPU Only"}
                </span>
                <Switch checked={isAccelerationEnabled} onCheckedChange={setIsAccelerationEnabled} />
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Source" : "Add New Source"}</DialogTitle>
            <DialogDescription>
              Simpan video upload atau camera stream sebagai source yang siap dipakai modul analitik.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[calc(90vh-11rem)] overflow-y-auto pr-1">
            <div className="grid gap-4 py-2 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="media-name">Nama source</Label>
                <Input
                  id="media-name"
                  value={formState.name}
                  onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Contoh: Area Produksi Timur"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="media-location">Lokasi</Label>
                <Input
                  id="media-location"
                  value={formState.location}
                  onChange={(event) => setFormState((current) => ({ ...current, location: event.target.value }))}
                  placeholder="Contoh: Workshop Main Plant"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipe source</Label>
                <Select
                  value={formState.type}
                  onValueChange={(value) =>
                    setFormState((current) => ({
                      ...current,
                      type: value as MediaType,
                      executionMode:
                        value === "camera"
                          ? current.executionMode === "manual"
                            ? "continuous"
                            : current.executionMode
                          : "manual",
                      monitoringIntervalSeconds:
                        value === "camera"
                          ? current.monitoringIntervalSeconds || "15"
                          : "",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upload">Upload Video</SelectItem>
                    <SelectItem value="camera">Camera Stream</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formState.status}
                  onValueChange={(value) =>
                    setFormState((current) => ({ ...current, status: value as MediaStatus }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Execution Mode</Label>
                <Select
                  value={formState.type === "upload" ? "manual" : formState.executionMode}
                  onValueChange={(value) =>
                    setFormState((current) => ({
                      ...current,
                      executionMode: value as MediaExecutionMode,
                      monitoringIntervalSeconds:
                        value === "scheduled"
                          ? current.monitoringIntervalSeconds || "15"
                          : value === "manual"
                            ? ""
                            : current.monitoringIntervalSeconds,
                    }))
                  }
                  disabled={formState.type === "upload"}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    {formState.type === "camera" ? (
                      <>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="continuous">Continuous</SelectItem>
                      </>
                    ) : null}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {formState.type === "upload"
                    ? "Video upload selalu dieksekusi manual sebagai batch analysis."
                    : formState.executionMode === "manual"
                      ? "Operator men-trigger analisis saat diperlukan."
                      : formState.executionMode === "scheduled"
                        ? "Sistem menjalankan analisis berkala dengan interval sampling."
                        : "Sistem memantau stream camera secara kontinu saat monitoring aktif."}
                </p>
              </div>
              {formState.type === "camera" && formState.executionMode === "scheduled" ? (
                <div className="space-y-2">
                  <Label htmlFor="monitoring-interval">Interval Monitoring (detik)</Label>
                  <Input
                    id="monitoring-interval"
                    value={formState.monitoringIntervalSeconds}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        monitoringIntervalSeconds: event.target.value,
                      }))
                    }
                    placeholder="15"
                  />
                </div>
              ) : null}
              {formState.type === "camera" ? (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="media-source">Sumber</Label>
                  <Input
                    id="media-source"
                    value={formState.source}
                    onChange={(event) => setFormState((current) => ({ ...current, source: event.target.value }))}
                    placeholder="rtsp://ip-camera/live/main"
                  />
                  <p className="text-xs text-muted-foreground">
                    Masukkan RTSP, HTTP stream, atau alamat source camera yang akan dipakai sistem.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 md:col-span-2">
                  <div className="space-y-2">
                    <Label htmlFor="media-file">Upload video source</Label>
                    <Input
                      id="media-file"
                      type="file"
                      accept="video/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setSelectedUploadFile(file);
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileUp className="h-3.5 w-3.5" />
                    {selectedUploadFile
                      ? `${selectedUploadFile.name} akan diupload ke server lokal saat source disimpan.`
                      : editingId
                        ? "Kosongkan file jika ingin tetap memakai video yang sudah tersimpan pada source ini."
                        : "Pilih file video yang akan diupload ke server lokal saat source disimpan."}
                  </div>
                  {editingId && formState.source ? (
                    <div className="rounded-lg border border-border/70 bg-secondary/20 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        Path video tersimpan
                      </p>
                      <p className="mt-1 break-all text-sm text-foreground">{formState.source}</p>
                    </div>
                  ) : null}
                </div>
              )}
              <div className="space-y-2 md:col-span-2">
                <div className="space-y-2">
                  <Label>Kategori Output Utama</Label>
                  <p className="text-xs text-muted-foreground">
                    Pilih kategori output utama yang ingin dipakai source ini. Modul detail seperti `No Helmet` diatur pada halaman Analysis Setup.
                  </p>
                </div>
                <div className="space-y-4 rounded-xl border border-border/70 bg-secondary/10 p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    {ANALYSIS_CATEGORY_OPTIONS.map((category) => {
                      const checked = formState.analytics.includes(category.value);
                      return (
                        <label
                          key={category.value}
                          className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-3 transition-colors hover:bg-background/70"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => toggleAnalyticFeature(category.value, value === true)}
                            className="mt-0.5"
                          />
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">{category.label}</p>
                            <p className="text-xs text-muted-foreground">{category.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formState.analytics.length > 0 ? (
                    formState.analytics.map((analytic) => (
                      <Badge key={analytic} variant="outline" className="border-primary/20">
                        {analytic}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Belum ada fitur analisis yang dipilih.
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="media-note">Catatan operasional</Label>
                <Textarea
                  id="media-note"
                  value={formState.note}
                  onChange={(event) => setFormState((current) => ({ ...current, note: event.target.value }))}
                  placeholder="Catatan singkat untuk operator atau tujuan source ini."
                  className="min-h-[96px]"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border/70 pt-4 bg-background">
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                resetForm();
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={saveMediaItem} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingId ? "Save Changes" : "Create Source"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
