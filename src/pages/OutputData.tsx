import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  Activity,
  AlertTriangle,
  Camera,
  FileVideo,
  HardHat,
  Loader2,
  Radar,
  SearchCheck,
  ShieldAlert,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { SnapshotLightbox, type SnapshotLightboxItem } from "@/components/media/SnapshotLightbox";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DashboardSourceSummary } from "@/lib/dashboardSummary";
import { useDashboardSummary, useSourceLatestAnalysisSummary } from "@/hooks/useDashboardSummary";

const formatDateTime = (value: string | null) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, "dd MMM yyyy, HH:mm");
};

const formatAnalysisType = (value: string) =>
  value === "no_helmet" ? "No Helmet" : value;

const formatSeconds = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)} s` : "--";

const statusVariant = {
  active: "default" as const,
  inactive: "secondary" as const,
  maintenance: "destructive" as const,
};

const formatStatus = (value: "active" | "inactive" | "maintenance") =>
  value === "active" ? "Active" : value === "inactive" ? "Inactive" : "Maintenance";

const OutputData = () => {
  const { data, isLoading, isError, error } = useDashboardSummary();
  const [searchParams] = useSearchParams();
  const [selectedSource, setSelectedSource] = useState<DashboardSourceSummary | null>(null);
  const [selectedSnapshotIndex, setSelectedSnapshotIndex] = useState<number | null>(null);
  const { data: selectedSourceSummary, isLoading: isSourceSummaryLoading } =
    useSourceLatestAnalysisSummary(selectedSource?.mediaSourceId || null);
  const requestedSourceId = searchParams.get("sourceId");

  const selectedSourceSnapshots: SnapshotLightboxItem[] =
    selectedSourceSummary?.latestAnalysisSummary?.events
      .filter((event) => Boolean(event.snapshotUrl))
      .map((event) => ({
        id: event.event_id,
        title: `${selectedSourceSummary.latestAnalysisSummary.sourceName} - ${event.event_id}`,
        url: event.snapshotUrl as string,
      })) || [];

  const openSourceSummary = (source: DashboardSourceSummary) => {
    setSelectedSource(source);
    setSelectedSnapshotIndex(null);
  };

  useEffect(() => {
    if (!requestedSourceId || !data?.sourceSummaries?.length) {
      return;
    }

    const matchedSource = data.sourceSummaries.find((source) => source.mediaSourceId === requestedSourceId);
    if (!matchedSource) {
      return;
    }

    setSelectedSource((current) =>
      current?.mediaSourceId === matchedSource.mediaSourceId ? current : matchedSource
    );
  }, [data?.sourceSummaries, requestedSourceId]);

  return (
    <DashboardLayout>
      <Header
        title="Dashboard"
        subtitle="Ringkasan hasil analisis dari seluruh source yang terdaftar di Media Sources."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Total Sources"
          value={isLoading ? "..." : data?.totalSources ?? 0}
          subtitle="Semua source yang terdaftar"
          icon={FileVideo}
          variant="primary"
        />
        <MetricCard
          title="Sources Dianalisis"
          value={isLoading ? "..." : data?.analyzedSourceCount ?? 0}
          subtitle="Source yang sudah punya hasil analisis"
          icon={Radar}
          variant="accent"
        />
        <MetricCard
          title="No Helmet Runs"
          value={isLoading ? "..." : data?.totalNoHelmetRuns ?? 0}
          subtitle="Total eksekusi analisis"
          icon={Activity}
          variant="success"
        />
        <MetricCard
          title="No Helmet Events"
          value={isLoading ? "..." : data?.totalNoHelmetEvents ?? 0}
          subtitle="Total event pelanggaran terdeteksi"
          icon={ShieldAlert}
          variant="warning"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Active Sources"
          value={isLoading ? "..." : data?.activeSources ?? 0}
          subtitle="Source dengan status active"
          icon={Camera}
          variant="primary"
        />
        <MetricCard
          title="Upload Sources"
          value={isLoading ? "..." : data?.uploadSources ?? 0}
          subtitle="Video upload di registry"
          icon={FileVideo}
          variant="accent"
        />
        <MetricCard
          title="Camera Sources"
          value={isLoading ? "..." : data?.cameraSources ?? 0}
          subtitle="Camera live di registry"
          icon={Camera}
          variant="success"
        />
        <MetricCard
          title="Violator Tracks"
          value={isLoading ? "..." : data?.totalViolatorTracks ?? 0}
          subtitle={data?.latestRunSourceName ? `Run terakhir: ${data.latestRunSourceName}` : "Belum ada run terbaru"}
          icon={HardHat}
          variant="warning"
        />
      </div>

      {isError && (
        <Card className="mb-6 border-destructive/30">
          <CardContent className="flex items-center gap-3 p-5 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <p>{error instanceof Error ? error.message : "Gagal memuat ringkasan dashboard."}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr,0.8fr] gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Summary per Source</CardTitle>
            <CardDescription>
              Rekap status source, jumlah run analisis, dan total event. Klik `Lihat Summary` untuk membuka hasil analisis terakhir per media.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Runs</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Violator Tracks</TableHead>
                  <TableHead>Latest Run</TableHead>
                  <TableHead className="text-right">Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Memuat summary source...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : !data || data.sourceSummaries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      Belum ada source atau histori analisis yang tercatat.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.sourceSummaries.map((source) => (
                    <TableRow key={source.mediaSourceId}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{source.name}</p>
                          <p className="text-xs text-muted-foreground">{source.location}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[source.status]}>{formatStatus(source.status)}</Badge>
                      </TableCell>
                      <TableCell className="capitalize">{source.type}</TableCell>
                      <TableCell>{source.runCount}</TableCell>
                      <TableCell>{source.totalEvents}</TableCell>
                      <TableCell>{source.totalViolators}</TableCell>
                      <TableCell>{formatDateTime(source.latestRunAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => openSourceSummary(source)}
                          disabled={source.runCount === 0}
                        >
                          <SearchCheck className="h-4 w-4" />
                          Lihat Summary
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Analysis Runs</CardTitle>
            <CardDescription>
              Riwayat run terbaru dari modul analisis yang sudah dijalankan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="flex min-h-[220px] items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Memuat histori run...
              </div>
            ) : !data || data.recentRuns.length === 0 ? (
              <div className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
                Belum ada histori analisis yang tersimpan.
              </div>
            ) : (
              data.recentRuns.map((run) => (
                <div
                  key={run.id}
                  className="rounded-xl border border-border/70 bg-secondary/10 p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{run.sourceName}</p>
                      <p className="text-xs text-muted-foreground">{formatAnalysisType(run.analysisType)}</p>
                    </div>
                    <Badge variant="outline">{formatDateTime(run.createdAt)}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Events</p>
                      <p className="font-medium">{run.eventCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Violators</p>
                      <p className="font-medium">{run.violatorCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Estimasi Orang</p>
                      <p className="font-medium">{run.stableDetectedTrackCount}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground break-all">{run.outputDir}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(selectedSource)} onOpenChange={(open) => !open && setSelectedSource(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {selectedSource ? `Summary Analisis - ${selectedSource.name}` : "Summary Analisis"}
            </DialogTitle>
            <DialogDescription>
              Menampilkan hasil analisis terakhir khusus untuk media/source yang dipilih di dashboard.
            </DialogDescription>
          </DialogHeader>

          {isSourceSummaryLoading ? (
            <div className="flex min-h-[240px] items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Memuat summary source...
            </div>
          ) : !selectedSourceSummary?.latestAnalysisSummary ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/30 p-5 text-sm text-muted-foreground">
              Source ini belum memiliki hasil analisis yang bisa ditampilkan.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {formatAnalysisType(selectedSourceSummary.latestAnalysisSummary.analysisType)}
                      </Badge>
                      <Badge variant="secondary">
                        {formatDateTime(selectedSourceSummary.latestAnalysisSummary.createdAt)}
                      </Badge>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {selectedSourceSummary.latestAnalysisSummary.sourceName}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedSourceSummary.latestAnalysisSummary.location || "Lokasi belum diisi"} •{" "}
                      {selectedSourceSummary.latestAnalysisSummary.outputDir}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-base leading-7 text-foreground">
                  {selectedSourceSummary.latestAnalysisSummary.narrative}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card className="border-border/60 bg-background/20">
                  <CardContent className="space-y-1 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Estimasi Orang
                    </p>
                    <p className="text-2xl font-semibold">
                      {selectedSourceSummary.latestAnalysisSummary.stableDetectedTrackCount}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Raw track teknis: {selectedSourceSummary.latestAnalysisSummary.rawDetectedTrackCount}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-background/20">
                  <CardContent className="space-y-1 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Track Pelanggar
                    </p>
                    <p className="text-2xl font-semibold">
                      {selectedSourceSummary.latestAnalysisSummary.violatorCount}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Total event: {selectedSourceSummary.latestAnalysisSummary.eventCount}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-background/20">
                  <CardContent className="space-y-1 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Bukti & Durasi
                    </p>
                    <p className="text-2xl font-semibold">
                      {selectedSourceSummary.latestAnalysisSummary.snapshotCount} screenshot
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Durasi pelanggaran: {formatSeconds(selectedSourceSummary.latestAnalysisSummary.totalViolationDurationSeconds)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-background/20">
                  <CardContent className="space-y-1 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Window Kejadian
                    </p>
                    <p className="text-base font-semibold">
                      {formatSeconds(selectedSourceSummary.latestAnalysisSummary.firstEventSeconds)} -{" "}
                      {formatSeconds(selectedSourceSummary.latestAnalysisSummary.lastEventSeconds)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedSourceSummary.latestAnalysisSummary.analyzedFrameCount} frame dianalisis
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr,1.05fr]">
                <Card className="border-border/60 bg-background/20">
                  <CardHeader>
                    <CardTitle className="text-lg">Parameter Run Terakhir</CardTitle>
                    <CardDescription>
                      Informasi teknis minimal untuk memahami cakupan analisis terakhir.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Durasi Video</p>
                      <p className="text-base font-medium">
                        {formatSeconds(selectedSourceSummary.latestAnalysisSummary.durationSeconds)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">FPS</p>
                      <p className="text-base font-medium">
                        {selectedSourceSummary.latestAnalysisSummary.fps.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Frame Dianalisis</p>
                      <p className="text-base font-medium">
                        {selectedSourceSummary.latestAnalysisSummary.analyzedFrameCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Run ID</p>
                      <p className="text-base font-medium">
                        {selectedSourceSummary.latestAnalysisSummary.id}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-background/20">
                  <CardHeader>
                    <CardTitle className="text-lg">Event Terdeteksi pada Media Ini</CardTitle>
                    <CardDescription>
                      Maksimal 6 event pertama dari hasil analisis terakhir source yang dipilih.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {selectedSourceSummary.latestAnalysisSummary.events.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                        Run terakhir source ini tidak menghasilkan event no helmet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {selectedSourceSummary.latestAnalysisSummary.events.map((event) => (
                          <div
                            key={event.event_id}
                            className="grid gap-3 rounded-xl border border-border/70 bg-secondary/10 p-4 md:grid-cols-[1fr,140px]"
                          >
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="destructive">{event.event_id}</Badge>
                                <Badge variant="outline">Track {event.track_id}</Badge>
                                <Badge variant="outline">ROI {event.roi_id}</Badge>
                              </div>
                              <p className="text-sm text-foreground">
                                Window {formatSeconds(event.start_time_seconds)} - {formatSeconds(event.end_time_seconds)}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Confidence max {event.max_confidence.toFixed(2)}
                              </p>
                            </div>
                            <div className="overflow-hidden rounded-lg border border-border/70 bg-background/40">
                              {event.snapshotUrl ? (
                                <button
                                  type="button"
                                  className="block h-full w-full cursor-zoom-in"
                                  onClick={() =>
                                    setSelectedSnapshotIndex(
                                      selectedSourceSnapshots.findIndex((item) => item.id === event.event_id)
                                    )
                                  }
                                >
                                  <img
                                    src={event.snapshotUrl}
                                    alt={`Snapshot ${event.event_id}`}
                                    className="h-full w-full object-cover transition-transform hover:scale-[1.02]"
                                  />
                                </button>
                              ) : (
                                <div className="flex h-full min-h-[88px] items-center justify-center px-3 text-center text-xs text-muted-foreground">
                                  Snapshot belum tersedia
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <SnapshotLightbox
        items={selectedSourceSnapshots}
        currentIndex={selectedSnapshotIndex}
        onClose={() => setSelectedSnapshotIndex(null)}
        onIndexChange={setSelectedSnapshotIndex}
        description="Review screenshot bukti dalam ukuran besar, pindah antar bukti, atau download gambar untuk dokumentasi."
      />
    </DashboardLayout>
  );
};

export default OutputData;
