import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  AlertTriangle,
  FileUp,
  FileVideo,
  FolderSearch,
  HardHat,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Undo2,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { SnapshotLightbox, type SnapshotLightboxItem } from "@/components/media/SnapshotLightbox";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { useMediaRegistry } from "@/hooks/useMediaRegistry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  analysisServerBaseUrl,
  getNoHelmetAnalysisJob,
  getNoHelmetDefaults,
  getVideoPreview,
  startNoHelmetAnalysis,
  type NoHelmetAnalysisJob,
  uploadVideoFile,
  type NoHelmetAnalysisEvent,
  type NoHelmetGlobalSummary,
  type NoHelmetAnalysisSummary,
  type VideoPreviewResponse,
} from "@/lib/noHelmetAnalysis";
import { COMMUNITY_DEMO_PRESET, readNoHelmetConfig } from "@/lib/noHelmetConfig";

type RoiPoint = [number, number];

const DEFAULT_ROI_POINTS: RoiPoint[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

const formatSeconds = (value: number) => `${value.toFixed(2)} s`;
const formatOptionalSeconds = (value: number | null | undefined) =>
  typeof value === "number" ? formatSeconds(value) : "--";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const parseCommaSeparated = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const humanizeRequestError = (error: unknown) => {
  const fallback = "Permintaan gagal diproses.";
  if (!(error instanceof Error)) return fallback;
  if (error.message === "Failed to fetch" || error.message === "Load failed") {
    return "Tidak bisa menjangkau server analisis di 127.0.0.1:8081. Jalankan backend lokal di folder server terlebih dulu.";
  }
  return error.message || fallback;
};

const asPercentPoints = (points: RoiPoint[]) =>
  points.map(([x, y]) => `${x * 100},${y * 100}`).join(" ");

const buildClientGlobalSummary = (events: NoHelmetAnalysisEvent[]): NoHelmetGlobalSummary => {
  if (events.length === 0) {
    return {
      detected_track_count: 0,
      detected_tracks_in_roi_count: 0,
      stable_detected_track_count: 0,
      stable_detected_tracks_in_roi_count: 0,
      violator_count: 0,
      event_count: 0,
      snapshot_count: 0,
      first_event_seconds: null,
      last_event_seconds: null,
      total_violation_duration_seconds: 0,
      narrative: "Tidak ada orang yang terdeteksi atau tidak ada data track yang tersedia untuk run ini.",
      detected_tracks: [],
      stable_detected_tracks: [],
      violators: [],
    };
  }

  const grouped = new Map<number, NoHelmetGlobalSummary["violators"][number]>();
  let snapshotCount = 0;
  let totalViolationDurationSeconds = 0;

  for (const event of events) {
    const duration = Math.max(0, event.end_time_seconds - event.start_time_seconds);
    totalViolationDurationSeconds += duration;
    if (event.snapshot_path || event.snapshotUrl) {
      snapshotCount += 1;
    }

    const existing = grouped.get(event.track_id);
    if (!existing) {
      grouped.set(event.track_id, {
        track_id: event.track_id,
        event_count: 1,
        snapshot_count: event.snapshot_path || event.snapshotUrl ? 1 : 0,
        first_event_seconds: event.start_time_seconds,
        last_event_seconds: event.end_time_seconds,
        max_confidence: event.max_confidence,
        total_violation_duration_seconds: duration,
        roi_ids: [event.roi_id],
        event_ids: [event.event_id],
      });
      continue;
    }

    existing.event_count += 1;
    existing.snapshot_count += event.snapshot_path || event.snapshotUrl ? 1 : 0;
    existing.first_event_seconds = Math.min(existing.first_event_seconds, event.start_time_seconds);
    existing.last_event_seconds = Math.max(existing.last_event_seconds, event.end_time_seconds);
    existing.max_confidence = Math.max(existing.max_confidence, event.max_confidence);
    existing.total_violation_duration_seconds += duration;
    if (!existing.roi_ids.includes(event.roi_id)) {
      existing.roi_ids.push(event.roi_id);
    }
    existing.event_ids.push(event.event_id);
  }

  const firstEventSeconds = Math.min(...events.map((event) => event.start_time_seconds));
  const lastEventSeconds = Math.max(...events.map((event) => event.end_time_seconds));
  const violators = Array.from(grouped.values()).sort((left, right) => left.track_id - right.track_id);

  return {
    detected_track_count: violators.length,
    detected_tracks_in_roi_count: violators.length,
    stable_detected_track_count: violators.length,
    stable_detected_tracks_in_roi_count: violators.length,
    violator_count: violators.length,
    event_count: events.length,
    snapshot_count: snapshotCount,
    first_event_seconds: firstEventSeconds,
    last_event_seconds: lastEventSeconds,
    total_violation_duration_seconds: totalViolationDurationSeconds,
    narrative:
      `Estimasi jumlah orang yang terlihat di video adalah ${violators.length}, ` +
      `berdasarkan data event yang tersedia. ` +
      `Sistem mencatat ${events.length} event dengan ${snapshotCount} screencapture bukti ` +
      `pada rentang ${formatSeconds(firstEventSeconds)} sampai ${formatSeconds(lastEventSeconds)}.`,
    detected_tracks: violators.map((violator) => ({
      track_id: violator.track_id,
      in_roi: true,
      observed_frame_count: 0,
      first_seen_seconds: violator.first_event_seconds,
      last_seen_seconds: violator.last_event_seconds,
      event_count: violator.event_count,
      snapshot_count: violator.snapshot_count,
      max_violation_confidence: violator.max_confidence,
      total_violation_duration_seconds: violator.total_violation_duration_seconds,
      roi_ids: violator.roi_ids,
      event_ids: violator.event_ids,
    })),
    stable_detected_tracks: violators.map((violator) => ({
      track_id: violator.track_id,
      in_roi: true,
      observed_frame_count: 0,
      first_seen_seconds: violator.first_event_seconds,
      last_seen_seconds: violator.last_event_seconds,
      event_count: violator.event_count,
      snapshot_count: violator.snapshot_count,
      max_violation_confidence: violator.max_confidence,
      total_violation_duration_seconds: violator.total_violation_duration_seconds,
      roi_ids: violator.roi_ids,
      event_ids: violator.event_ids,
    })),
    violators,
  };
};

export default function NoHelmetAnalysis() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const { data: mediaItems = [] } = useMediaRegistry();
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const lastAppliedSourceIdRef = useRef<string | null>(null);
  const terminalJobToastRef = useRef<string | null>(null);
  const savedConfig = readNoHelmetConfig();
  const [analysisJob, setAnalysisJob] = useState<NoHelmetAnalysisJob | null>(null);
  const [summary, setSummary] = useState<NoHelmetAnalysisSummary | null>(null);
  const [outputDir, setOutputDir] = useState("");
  const [serverDefaults, setServerDefaults] = useState<{
    defaultModelPath: string;
    defaultRoiConfigPath: string;
    analysisOutputRoot: string;
    uploadRoot: string;
  } | null>(null);
  const [preview, setPreview] = useState<VideoPreviewResponse | null>(null);
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [selectedSnapshotIndex, setSelectedSnapshotIndex] = useState<number | null>(null);
  const [dragPointIndex, setDragPointIndex] = useState<number | null>(null);
  const [stderr, setStderr] = useState("");
  const [stdout, setStdout] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [roiPoints, setRoiPoints] = useState<RoiPoint[]>(DEFAULT_ROI_POINTS);
  const [formState, setFormState] = useState({
    videoPath: "/Users/abloer/Downloads/Area_Produksi.mp4",
    modelPath: savedConfig.modelPath,
    roiConfigPath: savedConfig.roiConfigPath,
    roiId: savedConfig.roiId,
    previewTimestampSeconds: "1",
    confidenceThreshold: savedConfig.confidenceThreshold,
    iouThreshold: savedConfig.iouThreshold,
    topRatio: savedConfig.topRatio,
    helmetOverlapThreshold: savedConfig.helmetOverlapThreshold,
    violationOnFrames: savedConfig.violationOnFrames,
    cleanOffFrames: savedConfig.cleanOffFrames,
    frameStep: savedConfig.frameStep,
    imageSize: savedConfig.imageSize,
    personLabels: savedConfig.personLabels,
    helmetLabels: savedConfig.helmetLabels,
    violationLabels: savedConfig.violationLabels,
  });
  const selectedSourceId = searchParams.get("sourceId");
  const selectedSource = useMemo(
    () => mediaItems.find((item) => item.id === selectedSourceId) || null,
    [mediaItems, selectedSourceId]
  );
  const isCameraAutoSource =
    selectedSource?.type === "camera" && selectedSource.executionMode !== "manual";

  useEffect(() => {
    let ignore = false;
    getNoHelmetDefaults()
      .then((defaults) => {
        if (!ignore) {
          setServerDefaults({
            defaultModelPath: defaults.defaultModelPath,
            defaultRoiConfigPath: defaults.defaultRoiConfigPath,
            analysisOutputRoot: defaults.analysisOutputRoot,
            uploadRoot: defaults.uploadRoot,
          });
          setFormState((current) => {
            const legacyLocalPath =
              current.modelPath.startsWith("/Users/") ||
              current.modelPath === COMMUNITY_DEMO_PRESET.suggestedModelPath;
            if (!current.modelPath || legacyLocalPath) {
              return {
                ...current,
                modelPath: defaults.defaultModelPath,
              };
            }
            return current;
          });
        }
      })
      .catch((error) => {
        if (!ignore) {
          toast({
            title: "Server analisis belum siap",
            description: humanizeRequestError(error),
            variant: "destructive",
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, [toast]);

  useEffect(() => {
    const handlePointerUp = () => setDragPointIndex(null);
    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, []);

  useEffect(() => {
    if (!selectedSourceId) {
      lastAppliedSourceIdRef.current = null;
      return;
    }

    if (!selectedSource) {
      if (
        mediaItems.length > 0 &&
        lastAppliedSourceIdRef.current !== `missing:${selectedSourceId}`
      ) {
        lastAppliedSourceIdRef.current = `missing:${selectedSourceId}`;
        toast({
          title: "Source tidak ditemukan",
          description: "Source yang dipilih dari Media Sources tidak tersedia lagi di registry.",
          variant: "destructive",
        });
      }
      return;
    }

    if (lastAppliedSourceIdRef.current === selectedSource.id) {
      return;
    }

    const nextRoiId = `${slugify(selectedSource.name) || selectedSource.id}-dashboard`;
    setFormState((current) => ({
      ...current,
      videoPath: selectedSource.source,
      roiId: nextRoiId,
      roiConfigPath: "",
    }));
    setSelectedVideoFile(null);
      setPreview(null);
      setAnalysisJob(null);
      setSummary(null);
      setOutputDir("");
      setStdout("");
    setStderr("");
    lastAppliedSourceIdRef.current = selectedSource.id;

    toast({
      title: "Source diterapkan ke halaman run",
      description: `${selectedSource.name} dari Media Sources sekarang aktif di PPE • No Helmet Run.`,
    });

    if (selectedSource.type === "camera" && selectedSource.executionMode !== "manual") {
      toast({
        title: "Source camera otomatis terpilih",
        description:
          "Source ini memakai mode monitoring otomatis. Halaman PPE • No Helmet Run sebaiknya dipakai hanya untuk verifikasi manual atau troubleshooting.",
      });
    }
  }, [mediaItems.length, selectedSource, selectedSourceId, toast]);

  const eventCountLabel = useMemo(() => `${summary?.event_count ?? 0} event`, [summary]);
  const globalSummary = useMemo(
    () => (summary ? summary.global_summary ?? buildClientGlobalSummary(summary.events) : null),
    [summary]
  );
  const hasValidRoi = roiPoints.length >= 3;
  const hasCustomRoiPath = formState.roiConfigPath.trim().length > 0;
  const previewFps = preview?.metadata.fps ?? 0;
  const minDetectableDurationSeconds = useMemo(() => {
    const frameStep = Number(formState.frameStep);
    const onFrames = Number(formState.violationOnFrames);
    if (!previewFps || !Number.isFinite(frameStep) || !Number.isFinite(onFrames)) {
      return null;
    }
    return (Math.max(1, frameStep) * Math.max(1, onFrames)) / previewFps;
  }, [formState.frameStep, formState.violationOnFrames, previewFps]);
  const canRunAnalysis =
    formState.videoPath.trim().length > 0 &&
    formState.modelPath.trim().length > 0 &&
    (hasValidRoi || hasCustomRoiPath);
  const analysisJobStatusLabel =
    analysisJob?.status === "queued"
      ? analysisJob.queuePosition > 0
        ? `Queued • posisi ${analysisJob.queuePosition}`
        : "Queued"
      : analysisJob?.status === "running"
        ? "Running"
        : analysisJob?.status === "completed"
          ? "Completed"
          : analysisJob?.status === "failed"
            ? "Failed"
            : "--";
  const snapshotItems: SnapshotLightboxItem[] =
    summary?.events
      .filter((event) => Boolean(event.snapshotUrl))
      .map((event) => ({
        id: event.event_id,
        title: `${event.event_id} • Track ${event.track_id}`,
        url: event.snapshotUrl as string,
      })) || [];

  const handleChange = (field: keyof typeof formState, value: string) => {
    setFormState((current) => ({ ...current, [field]: value }));
  };

  const applyCommunityDemoPreset = () => {
    setFormState((current) => ({
      ...current,
      modelPath: current.modelPath || COMMUNITY_DEMO_PRESET.suggestedModelPath,
      confidenceThreshold: COMMUNITY_DEMO_PRESET.confidenceThreshold,
      personLabels: COMMUNITY_DEMO_PRESET.personLabels,
      helmetLabels: COMMUNITY_DEMO_PRESET.helmetLabels,
      violationLabels: COMMUNITY_DEMO_PRESET.violationLabels,
      violationOnFrames: COMMUNITY_DEMO_PRESET.violationOnFrames,
      cleanOffFrames: COMMUNITY_DEMO_PRESET.cleanOffFrames,
      frameStep: COMMUNITY_DEMO_PRESET.frameStep,
      imageSize: COMMUNITY_DEMO_PRESET.imageSize,
    }));
    toast({
      title: "Preset demo diterapkan",
      description: "Model, label, dan parameter recall telah disesuaikan untuk model komunitas DetectConstructionSafety.",
    });
  };

  const updateRoiPointFromPointer = (clientX: number, clientY: number, pointIndex?: number) => {
    const svg = overlayRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const normalizedPoint: RoiPoint = [
      clamp01((clientX - rect.left) / rect.width),
      clamp01((clientY - rect.top) / rect.height),
    ];

    if (typeof pointIndex === "number") {
      setRoiPoints((current) =>
        current.map((point, index) => (index === pointIndex ? normalizedPoint : point))
      );
      return;
    }

    setRoiPoints((current) => [...current, normalizedPoint]);
  };

  const handleOverlayClick = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragPointIndex !== null) return;
    if (event.target !== event.currentTarget && !(event.target as SVGElement).dataset.background) {
      return;
    }
    updateRoiPointFromPointer(event.clientX, event.clientY);
  };

  const handleOverlayPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragPointIndex === null) return;
    updateRoiPointFromPointer(event.clientX, event.clientY, dragPointIndex);
  };

  const handlePointPointerDown = (index: number) => (event: ReactPointerEvent<SVGCircleElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragPointIndex(index);
  };

  const handleRemovePoint = (index: number) => {
    setRoiPoints((current) => current.filter((_, pointIndex) => pointIndex !== index));
  };

  const handleVideoFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedVideoFile(event.target.files?.[0] || null);
  };

  const loadPreview = async (videoPath: string) => {
    setIsPreviewLoading(true);
    try {
      const timestamp = Number(formState.previewTimestampSeconds);
      const response = await getVideoPreview(
        videoPath.trim(),
        Number.isFinite(timestamp) ? timestamp : undefined
      );
      setPreview(response);
      if (roiPoints.length === 0) {
        setRoiPoints(DEFAULT_ROI_POINTS);
      }
      toast({
        title: "Preview siap",
        description: `Frame preview dibuat pada ${formatSeconds(response.timestampSeconds)}.`,
      });
    } catch (error) {
      const message = humanizeRequestError(error);
      toast({
        title: "Preview gagal",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleUploadVideo = async () => {
    if (!selectedVideoFile) {
      toast({
        title: "Pilih file video dulu",
        description: "Gunakan input upload untuk memilih video yang akan dikirim ke server lokal.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const response = await uploadVideoFile(selectedVideoFile);
      handleChange("videoPath", response.videoPath);
      setAnalysisJob(null);
      setSummary(null);
      setOutputDir("");
      setStdout("");
      setStderr("");
      await loadPreview(response.videoPath);
      toast({
        title: response.warning ? "Upload berhasil, metadata dibatasi" : "Upload berhasil",
        description: response.warning || `${response.fileName} tersimpan di server lokal.`,
      });
    } catch (error) {
      const message = humanizeRequestError(error);
      toast({
        title: "Upload gagal",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (!analysisJob || (analysisJob.status !== "queued" && analysisJob.status !== "running")) {
      return;
    }

    let cancelled = false;
    let intervalId: number | null = null;

    const syncJobState = (job: NoHelmetAnalysisJob) => {
      setAnalysisJob(job);
      setOutputDir(job.outputDir || "");
      setStdout(job.stdout || "");
      setStderr(job.stderr || "");

      if (job.status === "completed") {
        setSummary(job.summary);
        setIsAnalyzing(false);
        if (terminalJobToastRef.current !== job.id) {
          terminalJobToastRef.current = job.id;
          toast({
            title: "Analisis selesai",
            description: `${job.summary?.event_count ?? 0} event no helmet ditemukan.`,
          });
        }
      } else if (job.status === "failed") {
        setSummary(null);
        setIsAnalyzing(false);
        if (terminalJobToastRef.current !== job.id) {
          terminalJobToastRef.current = job.id;
          toast({
            title: "Analisis gagal",
            description: job.message || job.stderr || "Job analisis gagal diproses.",
            variant: "destructive",
          });
        }
      }
    };

    const pollJob = async () => {
      try {
        const response = await getNoHelmetAnalysisJob(analysisJob.id);
        if (cancelled) return;
        syncJobState(response.job);
        if (response.job.status === "completed" || response.job.status === "failed") {
          if (intervalId !== null) {
            window.clearInterval(intervalId);
          }
        }
      } catch (error) {
        if (cancelled) return;
        const message = humanizeRequestError(error);
        setIsAnalyzing(false);
        setStderr(message);
        if (terminalJobToastRef.current !== `poll:${analysisJob.id}`) {
          terminalJobToastRef.current = `poll:${analysisJob.id}`;
          toast({
            title: "Status job gagal diperbarui",
            description: message,
            variant: "destructive",
          });
        }
        if (intervalId !== null) {
          window.clearInterval(intervalId);
        }
      }
    };

    void pollJob();
    intervalId = window.setInterval(() => {
      void pollJob();
    }, 3000);

    return () => {
      cancelled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [analysisJob?.id, toast]);

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      setAnalysisJob(null);
      terminalJobToastRef.current = null;
      setSummary(null);
      setOutputDir("");
      setStdout("");
      setStderr("");

      const response = await startNoHelmetAnalysis({
        mediaSourceId: selectedSource?.id,
        videoPath: formState.videoPath.trim(),
        modelPath: formState.modelPath.trim(),
        roiConfigPath: formState.roiConfigPath.trim() || undefined,
        roiId: formState.roiId.trim() || "roi-dashboard",
        roiNormalized: true,
        roiPolygon: hasValidRoi ? roiPoints : undefined,
        confidenceThreshold: Number(formState.confidenceThreshold),
        iouThreshold: Number(formState.iouThreshold),
        topRatio: Number(formState.topRatio),
        helmetOverlapThreshold: Number(formState.helmetOverlapThreshold),
        violationOnFrames: Number(formState.violationOnFrames),
        cleanOffFrames: Number(formState.cleanOffFrames),
        frameStep: Number(formState.frameStep),
        imageSize: Number(formState.imageSize),
        personLabels: parseCommaSeparated(formState.personLabels),
        helmetLabels: parseCommaSeparated(formState.helmetLabels),
        violationLabels: parseCommaSeparated(formState.violationLabels),
      });

      setAnalysisJob({
        id: response.jobId,
        status: response.status,
        message: response.message,
        runId: response.runId,
        outputDir: response.outputDir,
        createdAt: response.createdAt,
        startedAt: null,
        completedAt: null,
        failedAt: null,
        mediaSourceId: selectedSource?.id || null,
        videoPath: formState.videoPath.trim(),
        stdout: "",
        stderr: "",
        summary: null,
        queuePosition: 0,
      });
      setOutputDir(response.outputDir);
      setStdout("Job analisis sudah dibuat. Tunggu worker menyelesaikan proses dan hasil akan tampil otomatis.");
      setStderr("");
      toast({
        title: "Analisis dimulai",
        description: response.message,
      });
    } catch (error) {
      const message = humanizeRequestError(error);
      setIsAnalyzing(false);
      setStderr(message);
      setAnalysisJob(null);
      toast({
        title: "Analisis gagal",
        description: message,
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardLayout>
      <Header
        title="PPE • No Helmet Run"
        subtitle="Halaman batch/manual untuk menjalankan analisis PPE rule no helmet pada source yang dipilih dari Media Sources."
      />

      {selectedSource && (
        <Card className="mb-6 border-cyan-500/20 bg-cyan-500/5">
          <CardContent className="grid gap-4 p-5 md:grid-cols-[1.3fr,repeat(4,minmax(0,1fr))]">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Source Aktif
              </p>
              <p className="text-lg font-semibold text-foreground">{selectedSource.name}</p>
              <p className="text-sm text-muted-foreground">
                {selectedSource.location} • {selectedSource.source}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Tipe</p>
              <Badge variant="outline">{selectedSource.type === "upload" ? "Upload Video" : "Camera Stream"}</Badge>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Status</p>
              <Badge variant={selectedSource.status === "active" ? "default" : "secondary"}>
                {selectedSource.status === "active"
                  ? "Active"
                  : selectedSource.status === "inactive"
                    ? "Inactive"
                    : "Maintenance"}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Kategori Output</p>
              <p className="text-sm text-foreground">
                {selectedSource.analytics.length > 0
                  ? selectedSource.analytics.join(", ")
                  : "Belum ada analytic aktif"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Catatan</p>
              <p className="text-sm text-muted-foreground">
                {selectedSource.note || "Tidak ada catatan operasional."}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Konteks</p>
              <p className="text-sm text-muted-foreground">
                Histori hasil analisis akan dikaitkan ke source ini di Dashboard.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isCameraAutoSource ? (
        <Card className="mb-6 border-amber-500/30 bg-amber-500/10">
          <CardContent className="flex items-start gap-3 p-5 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-2">
              <p className="font-medium text-foreground">Source ini berjalan pada mode monitoring otomatis</p>
              <p>
                Gunakan halaman ini hanya untuk verifikasi manual atau troubleshooting. Operasional harian source camera
                sebaiknya dikendalikan dari `Live Monitoring` melalui action `Start/Stop Monitoring` di `Media Sources`.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Event Terdeteksi"
          value={eventCountLabel}
          subtitle="Total pelanggaran no helmet"
          icon={ShieldAlert}
          variant="warning"
        />
        <MetricCard
          title="Durasi Video"
          value={summary ? formatSeconds(summary.duration_seconds) : preview ? formatSeconds(preview.metadata.durationSeconds) : "--"}
          subtitle="Summary atau metadata preview"
          icon={FileVideo}
          variant="primary"
        />
        <MetricCard
          title="ROI Points"
          value={roiPoints.length}
          subtitle={hasValidRoi ? "Siap dipakai analisis" : "Minimal 3 titik"}
          icon={ImageIcon}
          variant="accent"
        />
        <MetricCard
          title="Server Analisis"
          value={analysisServerBaseUrl.replace("http://", "")}
          subtitle="Upload, preview, dan inferensi"
          icon={FolderSearch}
          variant="success"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.05fr,0.95fr] gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Upload & Preview</CardTitle>
            <CardDescription>
              Upload video ke server lokal atau gunakan path yang sudah ada, lalu buat ROI dengan klik langsung di atas preview.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-[1fr,auto]">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Upload Video File</label>
                <Input type="file" accept="video/*" onChange={handleVideoFileChange} />
                <p className="text-xs text-muted-foreground">
                  File akan disimpan sementara di server lokal: {serverDefaults?.uploadRoot || "memuat..."}
                </p>
              </div>
              <div className="flex items-end">
                <Button onClick={handleUploadVideo} disabled={isUploading || !selectedVideoFile} className="gap-2 w-full md:w-auto">
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                  {isUploading ? "Mengunggah..." : "Upload Video"}
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr,160px,auto]">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Video Path</label>
                <Input
                  value={formState.videoPath}
                  onChange={(event) => handleChange("videoPath", event.target.value)}
                  placeholder="/Users/abloer/Downloads/Area_Produksi.mp4"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Preview Time (s)</label>
                <Input
                  value={formState.previewTimestampSeconds}
                  onChange={(event) => handleChange("previewTimestampSeconds", event.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={() => loadPreview(formState.videoPath)} disabled={isPreviewLoading || !formState.videoPath.trim()} variant="outline" className="gap-2 w-full md:w-auto">
                  {isPreviewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {isPreviewLoading ? "Memuat..." : "Load Preview"}
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={hasValidRoi || hasCustomRoiPath ? "default" : "destructive"}>
                  {hasValidRoi ? "ROI editor siap" : hasCustomRoiPath ? "ROI file override aktif" : "ROI belum valid"}
                </Badge>
                {preview && (
                  <Badge variant="outline">
                    {preview.metadata.width} x {preview.metadata.height}
                  </Badge>
                )}
                {preview && (
                  <Badge variant="outline">
                    {formatSeconds(preview.metadata.durationSeconds)}
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setRoiPoints(DEFAULT_ROI_POINTS)}>
                  Full Frame
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setRoiPoints((current) => current.slice(0, -1))} disabled={roiPoints.length === 0}>
                  <Undo2 className="w-4 h-4 mr-2" />
                  Undo Point
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setRoiPoints([])} disabled={roiPoints.length === 0}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear ROI
                </Button>
              </div>

              <div className="rounded-2xl border border-cyan-500/20 bg-slate-950/70 p-3">
                {preview?.previewUrl ? (
                  <div className="relative overflow-hidden rounded-xl">
                    <img
                      src={preview.previewUrl}
                      alt="Preview frame"
                      className="block w-full h-auto rounded-xl"
                    />
                    <svg
                      ref={overlayRef}
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      className="absolute inset-0 h-full w-full cursor-crosshair"
                      onPointerMove={handleOverlayPointerMove}
                      onClick={handleOverlayClick}
                    >
                      <rect data-background="true" x="0" y="0" width="100" height="100" fill="transparent" />
                      {roiPoints.length >= 2 && (
                        <polyline
                          points={asPercentPoints(roiPoints)}
                          fill="rgba(34,211,238,0.18)"
                          stroke="rgb(34,211,238)"
                          strokeWidth="0.45"
                        />
                      )}
                      {roiPoints.length >= 3 && (
                        <polygon
                          points={asPercentPoints(roiPoints)}
                          fill="rgba(34,211,238,0.16)"
                          stroke="rgb(56,189,248)"
                          strokeWidth="0.45"
                        />
                      )}
                      {roiPoints.map(([x, y], index) => (
                        <g key={`${x}-${y}-${index}`}>
                          <circle
                            cx={x * 100}
                            cy={y * 100}
                            r="1.4"
                            fill="rgb(8,145,178)"
                            stroke="white"
                            strokeWidth="0.35"
                            onPointerDown={handlePointPointerDown(index)}
                            onDoubleClick={() => handleRemovePoint(index)}
                          />
                          <text
                            x={x * 100}
                            y={y * 100 - 2}
                            textAnchor="middle"
                            fill="white"
                            fontSize="3"
                            style={{ userSelect: "none" }}
                          >
                            {index + 1}
                          </text>
                        </g>
                      ))}
                    </svg>
                  </div>
                ) : (
                  <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-border bg-background/40 px-6 text-center text-sm text-muted-foreground">
                    Upload video atau load preview dari path yang valid untuk mulai menggambar ROI.
                  </div>
                )}
              </div>

              <div className="text-xs text-muted-foreground">
                Klik area preview untuk menambah titik ROI. Drag titik untuk memindahkan. Double click titik untuk menghapus.
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Analysis Settings</CardTitle>
            <CardDescription>
              Pengaturan detector dan smoothing event. ROI editor di kiri akan diprioritaskan dibanding path ROI manual.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Community Demo Preset</p>
                  <p className="text-xs text-muted-foreground">
                    Rekomendasi awal: {COMMUNITY_DEMO_PRESET.name} dengan kelas `person`, `hardhat`, dan `no-hardhat`.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={applyCommunityDemoPreset}>
                  Gunakan Preset Demo
                </Button>
              </div>
              <p className="text-xs text-muted-foreground break-all">
                Repo sumber: {COMMUNITY_DEMO_PRESET.repoUrl}
              </p>
              <p className="text-xs text-muted-foreground break-all">
                Suggested model path: {serverDefaults?.defaultModelPath || COMMUNITY_DEMO_PRESET.suggestedModelPath}
              </p>
              <p className="text-xs text-muted-foreground">
                Preset ini mengutamakan recall: `conf {COMMUNITY_DEMO_PRESET.confidenceThreshold}`, `frame step {COMMUNITY_DEMO_PRESET.frameStep}`, `on {COMMUNITY_DEMO_PRESET.violationOnFrames}`, `off {COMMUNITY_DEMO_PRESET.cleanOffFrames}`, `imgsz {COMMUNITY_DEMO_PRESET.imageSize}`.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">Model Path</label>
                <Input
                  value={formState.modelPath}
                  onChange={(event) => handleChange("modelPath", event.target.value)}
                  placeholder={serverDefaults?.defaultModelPath || "/absolute/path/to/ppe-model.pt"}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">ROI ID</label>
                <Input
                  value={formState.roiId}
                  onChange={(event) => handleChange("roiId", event.target.value)}
                  placeholder="area-produksi-dashboard"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Custom ROI Path</label>
                <Input
                  value={formState.roiConfigPath}
                  onChange={(event) => handleChange("roiConfigPath", event.target.value)}
                  placeholder={serverDefaults?.defaultRoiConfigPath || "Opsional"}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Person Labels</label>
                <Input
                  value={formState.personLabels}
                  onChange={(event) => handleChange("personLabels", event.target.value)}
                  placeholder="person"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Helmet Labels</label>
                <Input
                  value={formState.helmetLabels}
                  onChange={(event) => handleChange("helmetLabels", event.target.value)}
                  placeholder="helmet, hardhat"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">Violation Labels</label>
                <Input
                  value={formState.violationLabels}
                  onChange={(event) => handleChange("violationLabels", event.target.value)}
                  placeholder="no-hardhat"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Confidence</label>
                <Input value={formState.confidenceThreshold} onChange={(event) => handleChange("confidenceThreshold", event.target.value)} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">IoU Tracker</label>
                <Input value={formState.iouThreshold} onChange={(event) => handleChange("iouThreshold", event.target.value)} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Top Ratio</label>
                <Input value={formState.topRatio} onChange={(event) => handleChange("topRatio", event.target.value)} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Helmet Overlap</label>
                <Input value={formState.helmetOverlapThreshold} onChange={(event) => handleChange("helmetOverlapThreshold", event.target.value)} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">On Frames</label>
                <Input value={formState.violationOnFrames} onChange={(event) => handleChange("violationOnFrames", event.target.value)} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Off Frames</label>
                <Input value={formState.cleanOffFrames} onChange={(event) => handleChange("cleanOffFrames", event.target.value)} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Frame Step</label>
                <Input value={formState.frameStep} onChange={(event) => handleChange("frameStep", event.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Nilai kecil lebih sensitif untuk pelanggaran singkat. `25` cocok untuk demo cepat, tapi mudah melewatkan event pendek.
                </p>
                {minDetectableDurationSeconds !== null && (
                  <p className="text-xs text-amber-300">
                    Dengan FPS preview {previewFps.toFixed(2)}, setelan ini baru bisa menangkap pelanggaran yang terlihat sekitar {formatSeconds(minDetectableDurationSeconds)} atau lebih lama.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Image Size</label>
                <Input value={formState.imageSize} onChange={(event) => handleChange("imageSize", event.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Naikkan ke `960` atau `1280` jika pekerja/helm terlihat kecil dan jauh. Semakin besar, proses semakin lambat.
                </p>
              </div>
            </div>

            {minDetectableDurationSeconds !== null && minDetectableDurationSeconds > 1 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Setelan saat ini cenderung konservatif. Untuk event helm dilepas sebentar, mulai dari `Frame Step = 5`, `On Frames = 2`, `Off Frames = 2`, dan `Image Size = 960`.
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-lg border bg-secondary/20 p-4 space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Output Directory</p>
              <p className="text-sm font-medium break-all">{outputDir || serverDefaults?.analysisOutputRoot || "-"}</p>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Badge
                  variant={
                    analysisJob?.status === "completed"
                      ? "default"
                      : analysisJob?.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {analysisJobStatusLabel}
                </Badge>
                {analysisJob?.runId ? <Badge variant="outline">{analysisJob.runId}</Badge> : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {analysisJob?.message ||
                  "Run analisis sekarang memakai background job. Hasil akan muncul otomatis saat worker selesai."}
              </p>
            </div>

            <Button
              onClick={handleRunAnalysis}
              disabled={isAnalyzing || !canRunAnalysis}
              className="gap-2 w-full"
            >
              {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardHat className="w-4 h-4" />}
              {isAnalyzing ? "Worker sedang berjalan..." : "Run No Helmet Analysis"}
            </Button>

            <div className="grid gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Stdout</label>
                <Textarea readOnly value={stdout || "Belum ada output."} className="min-h-[110px] bg-secondary/30" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Stderr / Error</label>
                <Textarea readOnly value={stderr || "Tidak ada error runtime."} className="min-h-[110px] bg-secondary/30" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-xl">Global Summary</CardTitle>
          <CardDescription>
            Ringkasan global run terakhir: estimasi jumlah orang, total event, total bukti screencapture, dan rincian tiap track.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!globalSummary ? (
            <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-6 text-sm text-muted-foreground">
              Jalankan analisis untuk membuat kesimpulan global dari hasil no helmet.
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5">
                <p className="text-base leading-7 text-foreground">{globalSummary.narrative}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-lg border bg-secondary/20 p-4 space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Raw Track Teknis</p>
                  <p className="text-2xl font-semibold">{globalSummary.detected_track_count}</p>
                </div>
                <div className="rounded-lg border bg-secondary/20 p-4 space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Estimasi Orang</p>
                  <p className="text-2xl font-semibold">{globalSummary.stable_detected_track_count}</p>
                </div>
                <div className="rounded-lg border bg-secondary/20 p-4 space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Orang/Track Pelanggar</p>
                  <p className="text-2xl font-semibold">{globalSummary.violator_count}</p>
                </div>
                <div className="rounded-lg border bg-secondary/20 p-4 space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Event / Bukti</p>
                  <p className="text-sm font-semibold">{globalSummary.event_count} event / {globalSummary.snapshot_count} snapshot</p>
                </div>
              </div>

              <div className="rounded-lg border bg-secondary/10">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Track</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>ROI</TableHead>
                      <TableHead>Observed Frames</TableHead>
                      <TableHead>Jumlah Event</TableHead>
                      <TableHead>Snapshot</TableHead>
                      <TableHead>First Seen</TableHead>
                      <TableHead>Last Seen</TableHead>
                      <TableHead>Durasi Total</TableHead>
                      <TableHead>Confidence Max</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {globalSummary.detected_tracks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="h-20 text-center text-muted-foreground">
                          Tidak ada track person yang tercatat pada run terakhir.
                        </TableCell>
                      </TableRow>
                    ) : (
                      globalSummary.detected_tracks.map((track) => (
                      <TableRow key={track.track_id}>
                        <TableCell className="font-medium">{track.track_id}</TableCell>
                        <TableCell>{globalSummary.stable_detected_tracks.some((item) => item.track_id === track.track_id) ? "Stabil" : "Fragmen"}</TableCell>
                        <TableCell>{track.in_roi ? "Di ROI" : "Di luar ROI"}</TableCell>
                        <TableCell>{track.observed_frame_count}</TableCell>
                        <TableCell>{track.event_count}</TableCell>
                        <TableCell>{track.snapshot_count}</TableCell>
                        <TableCell>{formatSeconds(track.first_seen_seconds)}</TableCell>
                        <TableCell>{formatSeconds(track.last_seen_seconds)}</TableCell>
                        <TableCell>
                          {formatSeconds(track.total_violation_duration_seconds)}
                        </TableCell>
                        <TableCell>{track.max_violation_confidence.toFixed(2)}</TableCell>
                      </TableRow>
                    )))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-xl">Detected Events</CardTitle>
          <CardDescription>
            Event pelanggaran dari run terakhir lengkap dengan snapshot bukti yang dibuka langsung dari server lokal.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Track</TableHead>
                <TableHead>Window</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>ROI</TableHead>
                <TableHead>Snapshot</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!summary ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Jalankan analisis untuk melihat hasil event.
                  </TableCell>
                </TableRow>
              ) : summary.events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Tidak ada event `no_helmet` pada run terakhir.
                  </TableCell>
                </TableRow>
              ) : (
                summary.events.map((event) => (
                  <TableRow key={event.event_id}>
                    <TableCell className="font-medium">
                      <div className="space-y-1">
                        <div>{event.event_id}</div>
                        <Badge variant="destructive" className="w-fit">
                          {event.event_type}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>{event.track_id}</TableCell>
                    <TableCell>
                      {formatSeconds(event.start_time_seconds)} - {formatSeconds(event.end_time_seconds)}
                    </TableCell>
                    <TableCell>{event.max_confidence.toFixed(2)}</TableCell>
                    <TableCell>{event.roi_id}</TableCell>
                    <TableCell>
                      {event.snapshotUrl ? (
                        <button
                          type="button"
                          className="block cursor-zoom-in"
                          onClick={() =>
                            setSelectedSnapshotIndex(
                              snapshotItems.findIndex((item) => item.id === event.event_id)
                            )
                          }
                        >
                          <img
                            src={event.snapshotUrl}
                            alt={event.event_id}
                            className="h-20 w-32 rounded-md border object-cover transition-transform hover:scale-[1.02]"
                          />
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                          <AlertTriangle className="w-4 h-4" />
                          Snapshot tidak tersedia
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <SnapshotLightbox
        items={snapshotItems}
        currentIndex={selectedSnapshotIndex}
        onClose={() => setSelectedSnapshotIndex(null)}
        onIndexChange={setSelectedSnapshotIndex}
        description="Review screenshot bukti dalam ukuran besar, pindah antar event, atau download gambar untuk kebutuhan pembuktian."
      />
    </DashboardLayout>
  );
}
