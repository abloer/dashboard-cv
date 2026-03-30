import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  Camera,
  CheckCircle2,
  CircleAlert,
  MonitorSmartphone,
  Pause,
  PauseCircle,
  PlayCircle,
  Radar,
  ShieldAlert,
  Siren,
  Video,
  Wifi,
  WifiOff,
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { useMediaRegistry, useUpdateMediaSourceMonitoring } from "@/hooks/useMediaRegistry";
import {
  useDashboardSummary,
  useSourceLatestAnalysisSummary,
} from "@/hooks/useDashboardSummary";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getSourcePreview } from "@/lib/noHelmetAnalysis";
import type {
  MediaExecutionMode,
  MediaMonitoringStatus,
  MediaSource,
} from "@/lib/mediaRegistry";

const formatExecutionMode = (value: MediaExecutionMode) =>
  value === "manual" ? "Manual" : value === "scheduled" ? "Scheduled" : "Continuous";

const formatMonitoringStatus = (value: MediaMonitoringStatus) =>
  value === "running" ? "Running" : value === "paused" ? "Paused" : "Idle";

const monitoringBadgeVariant = {
  running: "default" as const,
  paused: "outline" as const,
  idle: "secondary" as const,
};

const formatSeconds = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)} s` : "--";

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, "dd MMM yyyy, HH:mm");
};

type AlertSeverity = "none" | "low" | "medium" | "high";

const getAlertSeverity = (eventCount: number, violatorCount: number): AlertSeverity => {
  if (eventCount >= 5 || violatorCount >= 2) return "high";
  if (eventCount >= 2) return "medium";
  if (eventCount >= 1) return "low";
  return "none";
};

const severityBadgeVariant = {
  none: "outline" as const,
  low: "secondary" as const,
  medium: "default" as const,
  high: "destructive" as const,
};

const severityLabel = {
  none: "Normal",
  low: "Low",
  medium: "Medium",
  high: "High",
};

const canBrowserPreviewSource = (source: string) => {
  const normalized = source.trim().toLowerCase();
  return (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("/") ||
    normalized.endsWith(".mp4") ||
    normalized.endsWith(".webm") ||
    normalized.endsWith(".ogg") ||
    normalized.endsWith(".m3u8")
  );
};

const extractYouTubeVideoId = (source: string) => {
  try {
    const url = new URL(source);
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be") {
      return url.pathname.replace(/^\/+/, "").split("/")[0] || null;
    }
    if (host.includes("youtube.com")) {
      if (url.pathname === "/watch") {
        return url.searchParams.get("v");
      }
      const segments = url.pathname.split("/").filter(Boolean);
      const embedIndex = segments.findIndex((segment) =>
        ["embed", "shorts", "live"].includes(segment)
      );
      if (embedIndex >= 0) {
        return segments[embedIndex + 1] || null;
      }
    }
  } catch (_error) {
    return null;
  }
  return null;
};

const getYouTubeEmbedUrl = (source: string) => {
  const videoId = extractYouTubeVideoId(source);
  if (!videoId) return null;
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: "0",
    rel: "0",
    loop: "1",
    playlist: videoId,
    playsinline: "1",
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
};

export default function LiveMonitoring() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: mediaItems = [] } = useMediaRegistry();
  const { data: dashboardSummary } = useDashboardSummary({ refetchInterval: 15000 });
  const updateMonitoringMutation = useUpdateMediaSourceMonitoring();
  const [hoveredSourceId, setHoveredSourceId] = useState<string | null>(null);

  const selectedSourceId = searchParams.get("sourceId");
  const cameraSources = useMemo(
    () => mediaItems.filter((item) => item.type === "camera"),
    [mediaItems]
  );
  const selectedSource = useMemo(
    () => cameraSources.find((item) => item.id === selectedSourceId) || null,
    [cameraSources, selectedSourceId]
  );

  const cameraTiles = useMemo(() => {
    const summaryMap = new Map(
      (dashboardSummary?.sourceSummaries || []).map((summary) => [summary.mediaSourceId, summary])
    );

    return cameraSources
      .map((source) => {
      const summary = summaryMap.get(source.id);
      const latestEventCount = Number(summary?.latestEventCount || 0);
      const latestViolatorCount = Number(summary?.latestViolatorCount || 0);
      return {
        source,
        summary,
        latestEventCount,
        latestViolatorCount,
        hasAlert: Boolean(summary?.hasActiveAlert),
        severity: getAlertSeverity(latestEventCount, latestViolatorCount),
        lastDetectionAt: summary?.latestDetectionAt || null,
      };
      })
      .sort((left, right) => {
        const leftPriority =
          (left.severity === "high" ? 300 : left.severity === "medium" ? 200 : left.severity === "low" ? 100 : 0) +
          (left.source.monitoringStatus === "running" ? 20 : 0) +
          (left.source.status === "active" ? 10 : 0) +
          left.latestEventCount;
        const rightPriority =
          (right.severity === "high" ? 300 : right.severity === "medium" ? 200 : right.severity === "low" ? 100 : 0) +
          (right.source.monitoringStatus === "running" ? 20 : 0) +
          (right.source.status === "active" ? 10 : 0) +
          right.latestEventCount;
        if (leftPriority !== rightPriority) {
          return rightPriority - leftPriority;
        }
        return left.source.name.localeCompare(right.source.name);
      });
  }, [cameraSources, dashboardSummary?.sourceSummaries]);

  const alertRows = useMemo(
    () =>
      cameraTiles
        .filter((tile) => tile.latestEventCount > 0 || (tile.summary?.totalEvents || 0) > 0)
        .sort((left, right) => {
          const leftTimestamp = left.lastDetectionAt || left.summary?.latestRunAt || "";
          const rightTimestamp = right.lastDetectionAt || right.summary?.latestRunAt || "";
          return new Date(rightTimestamp).getTime() - new Date(leftTimestamp).getTime();
        }),
    [cameraTiles]
  );

  const { data: latestSummaryResponse } = useSourceLatestAnalysisSummary(selectedSource?.id || null, {
    refetchInterval: selectedSource?.monitoringStatus === "running" ? 15000 : false,
  });
  const latestSummary =
    latestSummaryResponse?.latestDetectionSummary ||
    latestSummaryResponse?.latestAnalysisSummary ||
    null;
  const latestRunSummary = latestSummaryResponse?.latestAnalysisSummary || null;
  const selectedSourceTile = useMemo(
    () => cameraTiles.find((tile) => tile.source.id === selectedSource?.id) || null,
    [cameraTiles, selectedSource?.id]
  );
  const selectedSourceYoutubeEmbedUrl = selectedSource
    ? getYouTubeEmbedUrl(selectedSource.source)
    : null;
  const selectedSourceCanBrowserPreview = selectedSource
    ? canBrowserPreviewSource(selectedSource.source)
    : false;
  const needsServerPreview =
    Boolean(selectedSource) &&
    !selectedSourceYoutubeEmbedUrl &&
    !selectedSourceCanBrowserPreview;
  const { data: selectedSourcePreview, isFetching: isFetchingSelectedSourcePreview } = useQuery({
    queryKey: ["source-preview", selectedSource?.id, selectedSource?.source],
    queryFn: () => getSourcePreview((selectedSource as MediaSource).source),
    enabled: needsServerPreview,
    refetchInterval:
      needsServerPreview && selectedSource?.monitoringStatus === "running" ? 15000 : false,
    retry: 1,
    staleTime: 10000,
  });

  const stats = useMemo(() => {
    const running = cameraTiles.filter((item) => item.source.monitoringStatus === "running").length;
    const alerting = cameraTiles.filter((item) => item.hasAlert).length;
    const scheduled = cameraTiles.filter((item) => item.source.executionMode === "scheduled").length;
    const highSeverity = cameraTiles.filter((item) => item.severity === "high").length;
    const mediumSeverity = cameraTiles.filter((item) => item.severity === "medium").length;
    const lowSeverity = cameraTiles.filter((item) => item.severity === "low").length;
    return {
      total: cameraTiles.length,
      running,
      alerting,
      scheduled,
      highSeverity,
      mediumSeverity,
      lowSeverity,
    };
  }, [cameraTiles]);

  const updateMonitoring = async (source: MediaSource, monitoringStatus: MediaMonitoringStatus) => {
    try {
      await updateMonitoringMutation.mutateAsync({
        id: source.id,
        executionMode:
          source.executionMode === "manual" ? "continuous" : source.executionMode,
        monitoringStatus,
        monitoringIntervalSeconds: source.monitoringIntervalSeconds,
      });
      toast({
        title:
          monitoringStatus === "running" ? "Monitoring aktif" : "Monitoring dijeda",
        description:
          monitoringStatus === "running"
            ? `${source.name} sekarang berjalan pada mode ${
                source.executionMode === "manual"
                  ? "Continuous"
                  : formatExecutionMode(source.executionMode)
              }.`
            : `${source.name} dihentikan sementara dari monitoring otomatis.`,
      });
    } catch (error) {
      toast({
        title:
          monitoringStatus === "running"
            ? "Gagal mengaktifkan monitoring"
            : "Gagal menjeda monitoring",
        description: error instanceof Error ? error.message : "Request failed.",
        variant: "destructive",
      });
    }
  };

  const renderNvrGrid = () => (
    <Card className="mb-6 border-border/60">
      <CardHeader>
        <CardTitle>NVR View</CardTitle>
        <CardDescription>
          Semua camera source live ditampilkan dalam satu grid operasional. Klik panel camera untuk membuka detail monitoring source tersebut.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {cameraTiles.map((tile) => (
            (() => {
              const isHovered = hoveredSourceId === tile.source.id;
              const canLivePreview = canBrowserPreviewSource(tile.source.source);
              const youtubeEmbedUrl = getYouTubeEmbedUrl(tile.source.source);
              const showYoutubePreview = isHovered && Boolean(youtubeEmbedUrl);
              const showVideoPreview = isHovered && canLivePreview && !youtubeEmbedUrl;
              const showFallbackPreview = isHovered && !canLivePreview && !youtubeEmbedUrl;
              return (
            <button
              key={tile.source.id}
              type="button"
              onClick={() =>
                navigate(`/live-monitoring?sourceId=${encodeURIComponent(tile.source.id)}`)
              }
              onMouseEnter={() => setHoveredSourceId(tile.source.id)}
              onMouseLeave={() => setHoveredSourceId((current) => (current === tile.source.id ? null : current))}
              className="text-left rounded-2xl border border-border/70 bg-card transition-all overflow-hidden hover:border-cyan-500/25 hover:bg-secondary/10"
            >
              <div className="relative min-h-[220px] overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_42%),linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.98))]">
                {tile.summary?.latestSnapshotUrl ? (
                  <>
                    <img
                      src={tile.summary.latestSnapshotUrl}
                      alt={`Snapshot ${tile.source.name}`}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/55 to-slate-950/30" />
                  </>
                ) : null}
                {showYoutubePreview && youtubeEmbedUrl ? (
                  <>
                    <iframe
                      src={youtubeEmbedUrl}
                      title={`Preview ${tile.source.name}`}
                      className="absolute inset-0 h-full w-full"
                      allow="autoplay; encrypted-media; picture-in-picture"
                      allowFullScreen={false}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-slate-950/10 pointer-events-none" />
                    <div className="absolute left-4 bottom-16 flex items-center gap-2 rounded-full border border-red-400/30 bg-red-500/15 px-3 py-1 text-xs font-medium text-red-100 backdrop-blur-sm">
                      <Video className="h-3.5 w-3.5" />
                      YouTube preview
                    </div>
                  </>
                ) : null}
                {showVideoPreview ? (
                  <>
                    <video
                      key={tile.source.source}
                      src={tile.source.source}
                      className="absolute inset-0 h-full w-full object-cover"
                      muted
                      autoPlay
                      loop
                      playsInline
                      preload="metadata"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-slate-950/15" />
                    <div className="absolute left-4 bottom-16 flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/15 px-3 py-1 text-xs font-medium text-cyan-100 backdrop-blur-sm">
                      <Video className="h-3.5 w-3.5" />
                      Live preview
                    </div>
                  </>
                ) : null}
                {showFallbackPreview ? (
                  <div className="absolute inset-x-4 bottom-16 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-xs text-slate-200 backdrop-blur-sm">
                    Browser preview tidak tersedia untuk source ini. RTSP dan beberapa stream live butuh gateway/transcoder agar bisa tampil langsung di browser.
                  </div>
                ) : null}
                <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(148,163,184,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.16)_1px,transparent_1px)] [background-size:28px_28px]" />
                <div className="absolute left-3 top-3 flex items-center gap-2">
                  <Badge variant={monitoringBadgeVariant[tile.source.monitoringStatus]}>
                    {formatMonitoringStatus(tile.source.monitoringStatus)}
                  </Badge>
                  {tile.hasAlert ? (
                    <Badge variant={severityBadgeVariant[tile.severity]}>
                      {severityLabel[tile.severity]}
                    </Badge>
                  ) : null}
                </div>
                <div className="absolute right-3 top-3 flex items-center gap-2">
                  <div
                    className={cn(
                      "flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium backdrop-blur-sm",
                      tile.source.status === "active"
                        ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                        : tile.source.status === "maintenance"
                          ? "border-amber-400/30 bg-amber-500/15 text-amber-200"
                          : "border-slate-400/20 bg-slate-500/10 text-slate-300"
                    )}
                  >
                    {tile.source.status === "active" ? (
                      <Wifi className="h-3 w-3" />
                    ) : tile.source.status === "maintenance" ? (
                      <Pause className="h-3 w-3" />
                    ) : (
                      <WifiOff className="h-3 w-3" />
                    )}
                    {tile.source.status === "active"
                      ? "Online"
                      : tile.source.status === "maintenance"
                        ? "Maintenance"
                        : "Offline"}
                  </div>
                </div>
                <div className="absolute inset-0 flex flex-col justify-end px-4 pb-16 text-left">
                  <div className="max-w-[85%] rounded-xl bg-black/20 px-3 py-2 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <MonitorSmartphone className="h-4 w-4 text-cyan-200" />
                      <p className="text-base font-semibold text-white">{tile.source.name}</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-300">{tile.source.location}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                        {formatExecutionMode(tile.source.executionMode)}
                      </span>
                      {tile.hasAlert ? (
                        <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      )}
                    </div>
                  </div>
                </div>
                <div className="absolute left-3 bottom-3 right-3 flex items-center justify-between rounded-xl border border-white/10 bg-black/35 px-3 py-2 backdrop-blur-sm">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Latest Alert</p>
                    <p className="text-sm font-medium text-white">
                      {tile.latestEventCount > 0
                        ? `${tile.latestEventCount} event / ${tile.latestViolatorCount} violator`
                        : "No active alert"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Last Detection</p>
                    <p className="text-sm font-medium text-white">
                      {tile.lastDetectionAt ? formatDateTime(tile.lastDetectionAt) : "--"}
                    </p>
                  </div>
                </div>
                {tile.hasAlert ? (
                  <div className="absolute bottom-16 left-3 flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/15 px-3 py-1 text-xs font-medium text-destructive backdrop-blur-sm">
                    <CircleAlert className="h-3.5 w-3.5" />
                    Pelanggaran terdeteksi
                  </div>
                ) : null}
              </div>
            </button>
              );
            })()
          ))}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout>
      <Header
        title="Live Monitoring"
        subtitle="Pantau seluruh camera source terdaftar dalam tampilan operasional ala NVR, lengkap dengan status monitoring dan indikator alert pelanggaran."
      />

      {cameraSources.length === 0 ? (
        <Card className="border-border/60">
          <CardContent className="flex flex-col gap-4 p-6 text-sm text-muted-foreground">
            <p>
              Belum ada camera source yang terdaftar. Tambahkan source bertipe `Camera Stream` dari `Media Sources`
              agar halaman ini menampilkan panel monitoring.
            </p>
            <div>
              <Button onClick={() => navigate("/")}>Buka Media Sources</Button>
            </div>
          </CardContent>
        </Card>
      ) : !selectedSource ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 mb-6">
            <MetricCard
              title="Camera Sources"
              value={stats.total}
              subtitle="Seluruh camera stream yang terdaftar"
              icon={Camera}
              variant="primary"
            />
            <MetricCard
              title="Monitoring Active"
              value={stats.running}
              subtitle="Camera yang sedang berjalan otomatis"
              icon={Activity}
              variant="success"
            />
            <MetricCard
              title="Alert Sources"
              value={stats.alerting}
              subtitle="Camera dengan event terbaru"
              icon={Siren}
              variant="warning"
            />
            <MetricCard
              title="Scheduled Sources"
              value={stats.scheduled}
              subtitle="Sampling berkala terkonfigurasi"
              icon={Radar}
              variant="accent"
            />
          </div>

          <Card className="mb-6 border-border/60">
            <CardHeader>
              <CardTitle className="text-lg">Counter Alert per Severity</CardTitle>
              <CardDescription>
                Ringkasan tingkat prioritas alert dari seluruh camera source berdasarkan hasil deteksi terbaru.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">High Severity</p>
                  <p className="mt-2 text-3xl font-semibold text-foreground">{stats.highSeverity}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Event tinggi atau multi-violator</p>
                </div>
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Medium Severity</p>
                  <p className="mt-2 text-3xl font-semibold text-foreground">{stats.mediumSeverity}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Beberapa event pada source yang sama</p>
                </div>
                <div className="rounded-xl border border-secondary/70 bg-secondary/20 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Low Severity</p>
                  <p className="mt-2 text-3xl font-semibold text-foreground">{stats.lowSeverity}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Alert awal dengan satu event singkat</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {renderNvrGrid()}

          <Card>
            <CardHeader>
              <CardTitle>Event Detection Seluruh Camera</CardTitle>
              <CardDescription>
                Event terbaru dari semua camera source yang terdaftar. Klik nama camera untuk membuka detail monitoring per source.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {alertRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-5 text-sm text-muted-foreground">
                  Belum ada alert atau hasil PPE yang tercatat dari camera source.
                </div>
              ) : (
                alertRows.slice(0, 8).map((tile) => (
                  <div
                    key={tile.source.id}
                    className="rounded-xl border border-border/70 bg-secondary/10 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/live-monitoring?sourceId=${encodeURIComponent(tile.source.id)}`)
                          }
                          className="text-left font-medium text-foreground hover:text-primary"
                        >
                          {tile.source.name}
                        </button>
                        <p className="text-xs text-muted-foreground">
                          {tile.source.location || "Lokasi tidak tersedia"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {tile.lastDetectionAt
                            ? `Deteksi terakhir ${formatDateTime(tile.lastDetectionAt)}`
                            : tile.summary?.latestRunAt
                              ? `Run terakhir ${formatDateTime(tile.summary.latestRunAt)}`
                              : "Belum ada timestamp deteksi"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={tile.hasAlert ? "destructive" : "outline"}>
                          {tile.latestEventCount > 0 ? `${tile.latestEventCount} event` : "No active event"}
                        </Badge>
                        <Badge variant="outline">{tile.latestViolatorCount} violator</Badge>
                        <Badge variant="outline">
                          Total {tile.summary?.totalEvents || 0} event
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <div className="mb-6">
            <Button variant="outline" className="gap-2" onClick={() => navigate("/live-monitoring")}>
              <ArrowLeft className="h-4 w-4" />
              Kembali ke NVR View
            </Button>
          </div>

          <div className="mb-6 grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
            <Card className="border-border/60 overflow-hidden">
              <CardHeader>
                <CardTitle>Camera Preview</CardTitle>
                <CardDescription>
                  Preview source yang sedang dipilih untuk monitoring. Jika source berasal dari YouTube atau URL video yang browser-playable, player ditampilkan langsung di area ini.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_42%),linear-gradient(180deg,rgba(15,23,42,0.9),rgba(2,6,23,0.98))] aspect-video">
                  {selectedSourceYoutubeEmbedUrl ? (
                    <iframe
                      src={selectedSourceYoutubeEmbedUrl}
                      title={`Preview ${selectedSource.name}`}
                      className="absolute inset-0 h-full w-full"
                      allow="autoplay; encrypted-media; picture-in-picture"
                      allowFullScreen
                    />
                  ) : selectedSourceCanBrowserPreview ? (
                    <video
                      key={selectedSource.source}
                      src={selectedSource.source}
                      className="absolute inset-0 h-full w-full object-cover"
                      controls
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : selectedSourcePreview?.previewUrl ? (
                    <img
                      src={selectedSourcePreview.previewUrl}
                      alt={`Preview ${selectedSource.name}`}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : latestSummary?.events?.find((event) => event.snapshotUrl)?.snapshotUrl ? (
                    <img
                      src={latestSummary.events.find((event) => event.snapshotUrl)?.snapshotUrl as string}
                      alt={`Preview ${selectedSource.name}`}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-sm text-slate-300">
                      <MonitorSmartphone className="h-10 w-10 text-cyan-200" />
                      <p>
                        {isFetchingSelectedSourcePreview
                          ? "Mengambil snapshot preview dari source camera..."
                          : "Snapshot preview belum berhasil diambil dari source ini. Pastikan stream dapat diakses server dan ffmpeg tersedia."}
                      </p>
                    </div>
                  )}
                  <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
                    <Badge variant={monitoringBadgeVariant[selectedSource.monitoringStatus]}>
                      {formatMonitoringStatus(selectedSource.monitoringStatus)}
                    </Badge>
                    <Badge variant="outline">{formatExecutionMode(selectedSource.executionMode)}</Badge>
                    <Badge variant="outline">{selectedSource.name}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-cyan-500/20 bg-cyan-500/5">
              <CardContent className="space-y-5 p-5">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Camera Aktif</p>
                  <p className="text-2xl font-semibold text-foreground">{selectedSource.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedSource.location}</p>
                </div>

                <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Source</p>
                  <p className="mt-2 break-all text-sm text-foreground">{selectedSource.source}</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Execution Mode</p>
                    <Badge variant="outline">{formatExecutionMode(selectedSource.executionMode)}</Badge>
                    {selectedSource.executionMode === "scheduled" && selectedSource.monitoringIntervalSeconds ? (
                      <p className="text-xs text-muted-foreground">
                        Interval {selectedSource.monitoringIntervalSeconds}s
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Monitoring Status</p>
                    <Badge variant={monitoringBadgeVariant[selectedSource.monitoringStatus]}>
                      {formatMonitoringStatus(selectedSource.monitoringStatus)}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Kategori Output</p>
                    <p className="text-sm text-foreground">
                      {selectedSource.analytics.length > 0 ? selectedSource.analytics.join(", ") : "--"}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Last Detection</p>
                    <p className="text-sm text-foreground">
                      {latestSummary?.createdAt
                        ? formatDateTime(latestSummary.createdAt)
                        : latestRunSummary?.createdAt
                          ? formatDateTime(latestRunSummary.createdAt)
                        : "--"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 mb-6">
            <MetricCard
              title="Monitoring Status"
              value={formatMonitoringStatus(selectedSource.monitoringStatus)}
              subtitle="Status worker otomatis source ini"
              icon={Activity}
              variant={selectedSource.monitoringStatus === "running" ? "success" : "warning"}
            />
            <MetricCard
              title="Execution Mode"
              value={formatExecutionMode(selectedSource.executionMode)}
              subtitle={
                selectedSource.executionMode === "scheduled" && selectedSource.monitoringIntervalSeconds
                  ? `Sampling tiap ${selectedSource.monitoringIntervalSeconds} detik`
                  : "Mode eksekusi aktif"
              }
              icon={Radar}
              variant="primary"
            />
            <MetricCard
              title="Latest Events"
              value={latestSummary?.eventCount ?? latestRunSummary?.eventCount ?? 0}
              subtitle="Hasil run terbaru untuk source ini"
              icon={ShieldAlert}
              variant="warning"
            />
            <MetricCard
              title="Violator Tracks"
              value={latestSummary?.violatorCount ?? latestRunSummary?.violatorCount ?? 0}
              subtitle="Track pelanggar pada hasil terbaru"
              icon={Camera}
              variant="accent"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
            <Card>
              <CardHeader>
                <CardTitle>Control Center</CardTitle>
                <CardDescription>
                  Kontrol operasional source yang dipilih dari NVR View atau action `Open Monitoring` pada `Media Sources`.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{selectedSource.name}</Badge>
                    <Badge variant={monitoringBadgeVariant[selectedSource.monitoringStatus]}>
                      {formatMonitoringStatus(selectedSource.monitoringStatus)}
                    </Badge>
                    <Badge variant="outline">{formatExecutionMode(selectedSource.executionMode)}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {selectedSource.location} • {selectedSource.source}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => updateMonitoring(selectedSource, "running")}
                    disabled={
                      updateMonitoringMutation.isPending ||
                      selectedSource.monitoringStatus === "running"
                    }
                    className="gap-2"
                  >
                    <PlayCircle className="h-4 w-4" />
                    Start Monitoring
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => updateMonitoring(selectedSource, "paused")}
                    disabled={
                      updateMonitoringMutation.isPending ||
                      selectedSource.monitoringStatus !== "running"
                    }
                    className="gap-2"
                  >
                    <PauseCircle className="h-4 w-4" />
                    Stop Monitoring
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/analysis-setup?sourceId=${selectedSource.id}`)}
                  >
                    Setup Analysis
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/output-data?sourceId=${selectedSource.id}`)}
                  >
                    View Result
                  </Button>
                </div>

                <Separator />

                <div className="space-y-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Informasi Operasional</p>
                  <p>
                    Halaman detail ini dipakai untuk satu camera source tertentu. Di sinilah operator mengaktifkan,
                    menjeda, dan mengecek status monitoring source tersebut.
                  </p>
                  <p>
                    Untuk melihat keseluruhan camera sekaligus, kembali ke `NVR View`. Untuk audit detail, gunakan
                    `View Result`.
                  </p>
                  {selectedSource.executionMode === "scheduled" && selectedSource.monitoringIntervalSeconds ? (
                    <p>
                      Source ini menggunakan sampling berkala tiap{" "}
                      <span className="font-medium text-foreground">
                        {selectedSource.monitoringIntervalSeconds} detik
                      </span>.
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Alert & Hasil Analisis Terbaru</CardTitle>
                <CardDescription>
                  Ringkasan alert terakhir dari source yang sedang dipilih.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {!latestSummary ? (
                  <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-5 text-sm text-muted-foreground">
                    Belum ada hasil analisis yang tercatat untuk source ini.
                  </div>
                ) : (
                  <>
                    <div
                      className={cn(
                        "rounded-xl border p-4",
                        latestSummary.eventCount > 0
                          ? "border-destructive/30 bg-destructive/5"
                          : "border-emerald-500/20 bg-emerald-500/5"
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={latestSummary.eventCount > 0 ? "destructive" : "outline"}>
                          {selectedSourceTile?.hasAlert ? "Alert Active" : "Latest Detection"}
                        </Badge>
                        <Badge variant="outline">{latestSummary.eventCount} event</Badge>
                        <Badge variant="outline">{latestSummary.violatorCount} violator</Badge>
                      </div>
                      <p className="mt-4 text-sm leading-7 text-foreground">{latestSummary.narrative}</p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-lg border bg-secondary/20 p-4 space-y-1">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Window Kejadian</p>
                        <p className="text-xl font-semibold">
                          {formatSeconds(latestSummary.firstEventSeconds)} -{" "}
                          {formatSeconds(latestSummary.lastEventSeconds)}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-secondary/20 p-4 space-y-1">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Bukti & Durasi</p>
                        <p className="text-xl font-semibold">{latestSummary.snapshotCount} screenshot</p>
                        <p className="text-sm text-muted-foreground">
                          Durasi total {formatSeconds(latestSummary.totalViolationDurationSeconds)}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {latestSummary.events.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
                          Tidak ada event detail pada hasil terbaru.
                        </div>
                      ) : (
                        latestSummary.events.slice(0, 3).map((event) => (
                          <div
                            key={event.event_id}
                            className="rounded-xl border border-border/70 bg-secondary/10 p-4"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="destructive">{event.event_id}</Badge>
                              <Badge variant="outline">Track {event.track_id}</Badge>
                              <Badge variant="outline">{event.roi_id}</Badge>
                            </div>
                            <p className="mt-3 text-sm text-foreground">
                              Window {formatSeconds(event.start_time_seconds)} -{" "}
                              {formatSeconds(event.end_time_seconds)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Confidence max {event.max_confidence.toFixed(2)}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
