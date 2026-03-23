import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ClipboardCheck,
  Loader2,
  Radar,
  RefreshCw,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { useMediaRegistry } from "@/hooks/useMediaRegistry";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getHseSafetyRulesDefaults,
  getLatestHseSafetyRulesReport,
  runHseSafetyRulesAssessment,
  type HseSafetyRulesReport,
} from "@/lib/hseSafetyRules";

const riskBadgeVariant = {
  low: "secondary" as const,
  medium: "default" as const,
  high: "destructive" as const,
};

const readinessBadgeVariant = {
  ready: "default" as const,
  warning: "secondary" as const,
  missing: "destructive" as const,
};

const severityBadgeVariant = {
  low: "secondary" as const,
  medium: "default" as const,
  high: "destructive" as const,
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const humanizeRequestError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return "Permintaan gagal diproses.";
  }
  return error.message || "Permintaan gagal diproses.";
};

export default function HseSafetyRulesRun() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { data: mediaItems = [] } = useMediaRegistry();
  const [report, setReport] = useState<HseSafetyRulesReport | null>(null);
  const [defaultConfig, setDefaultConfig] =
    useState<HseSafetyRulesReport["configSnapshot"] | null>(null);
  const [isLoadingDefaults, setIsLoadingDefaults] = useState(false);
  const [isLoadingLatest, setIsLoadingLatest] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const selectedSourceId = searchParams.get("sourceId");
  const selectedSource = useMemo(
    () => mediaItems.find((item) => item.id === selectedSourceId) || null,
    [mediaItems, selectedSourceId]
  );

  useEffect(() => {
    let ignore = false;
    setIsLoadingDefaults(true);
    getHseSafetyRulesDefaults()
      .then((response) => {
        if (!ignore) {
          setDefaultConfig(response.config);
        }
      })
      .catch((error) => {
        if (!ignore) {
          toast({
            title: "Default HSE belum tersedia",
            description: humanizeRequestError(error),
            variant: "destructive",
          });
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoadingDefaults(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [toast]);

  useEffect(() => {
    if (!selectedSourceId) {
      setReport(null);
      return;
    }

    let ignore = false;
    setIsLoadingLatest(true);
    getLatestHseSafetyRulesReport(selectedSourceId)
      .then((response) => {
        if (!ignore) {
          setReport(response.latestReport);
        }
      })
      .catch(() => {
        if (!ignore) {
          setReport(null);
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoadingLatest(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [selectedSourceId]);

  const handleRunAssessment = async () => {
    if (!selectedSourceId) {
      toast({
        title: "Pilih source dari Media Sources",
        description: "HSE assessment hanya bisa dijalankan untuk source yang sudah dipilih.",
        variant: "destructive",
      });
      return;
    }

    setIsRunning(true);
    try {
      const response = await runHseSafetyRulesAssessment(selectedSourceId);
      setReport(response.report);
      toast({
        title: "Assessment HSE selesai",
        description: `${response.report.summary.openFindingCount} temuan aktif terdeteksi pada source ini.`,
      });
    } catch (error) {
      toast({
        title: "Assessment HSE gagal",
        description: humanizeRequestError(error),
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <DashboardLayout>
      <Header
        title="HSE • Safety Rules Run"
        subtitle="Assessment cepat untuk mengevaluasi kesiapan rule HSE, restricted zone, dan baseline compliance pada source terpilih."
      />

      {selectedSource ? (
        <Card className="mb-6 border-cyan-500/20 bg-cyan-500/5">
          <CardContent className="grid gap-4 p-5 md:grid-cols-[1.4fr,1fr,1fr]">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Source Aktif</p>
              <p className="text-lg font-semibold text-foreground">{selectedSource.name}</p>
              <p className="text-sm text-muted-foreground">
                {selectedSource.location} • {selectedSource.type === "upload" ? "Upload Video" : "Camera Stream"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Kategori Output</p>
              <div className="flex flex-wrap gap-2">
                {selectedSource.analytics.length > 0 ? (
                  selectedSource.analytics.map((analytic) => (
                    <Badge key={analytic} variant="outline" className="border-primary/20">
                      {analytic}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Belum ada kategori output.</p>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Assessment</p>
              <p className="text-sm text-muted-foreground">
                Jalankan assessment ini setelah setup HSE selesai untuk menghasilkan baseline temuan dan tingkat risiko source.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-6 border-amber-500/30 bg-amber-500/10">
          <CardContent className="flex items-start gap-3 p-5 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-2">
              <p className="font-medium text-foreground">Belum ada source yang dipilih</p>
              <p>
                Buka halaman ini dari `Analysis Setup` atau `Safety Rules Setup` dengan source terpilih agar assessment HSE bisa dijalankan pada konteks source yang benar.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Risk Level"
          value={report ? report.summary.riskLevel.toUpperCase() : "--"}
          subtitle="Tingkat risiko assessment terakhir"
          icon={Siren}
          variant={report?.summary.riskLevel === "high" ? "warning" : report?.summary.riskLevel === "medium" ? "accent" : "success"}
        />
        <MetricCard
          title="Open Findings"
          value={report?.summary.openFindingCount ?? 0}
          subtitle="Temuan aktif pada source"
          icon={AlertTriangle}
          variant="warning"
        />
        <MetricCard
          title="Readiness"
          value={report ? `${report.readiness.readyCount}/${report.readiness.totalCount}` : "--"}
          subtitle="Komponen setup yang siap"
          icon={ClipboardCheck}
          variant="primary"
        />
        <MetricCard
          title="Latest Evidence"
          value={report?.summary.latestNoHelmetEventCount ?? 0}
          subtitle="Event PPE terakhir yang dipakai sebagai baseline"
          icon={Radar}
          variant="accent"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Action</CardTitle>
            <CardDescription>
              Assessment ini membaca config `Safety Rules`, status source, dan evidence PPE terbaru untuk menghasilkan temuan HSE.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border bg-secondary/20 p-4 space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Config Snapshot</p>
              {isLoadingDefaults ? (
                <p className="text-sm text-muted-foreground">Memuat default HSE...</p>
              ) : defaultConfig ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="break-all">
                    <span className="font-medium text-foreground">Model:</span> {defaultConfig.modelPath}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Restricted Zones:</span> {defaultConfig.restrictedZones}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Required PPE:</span> {defaultConfig.requiredPpe}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Config default belum tersedia.</p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={handleRunAssessment} disabled={!selectedSourceId || isRunning} className="gap-2">
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {isRunning ? "Menjalankan assessment..." : "Run HSE Assessment"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!selectedSourceId || isLoadingLatest}
                onClick={async () => {
                  if (!selectedSourceId) return;
                  setIsLoadingLatest(true);
                  try {
                    const response = await getLatestHseSafetyRulesReport(selectedSourceId);
                    setReport(response.latestReport);
                    toast({
                      title: "Report terakhir dimuat",
                      description: response.latestReport
                        ? `Assessment ${formatDateTime(response.latestReport.createdAt)} berhasil dimuat.`
                        : "Belum ada report HSE untuk source ini.",
                    });
                  } catch (error) {
                    toast({
                      title: "Gagal memuat report terakhir",
                      description: humanizeRequestError(error),
                      variant: "destructive",
                    });
                  } finally {
                    setIsLoadingLatest(false);
                  }
                }}
                className="gap-2"
              >
                {isLoadingLatest ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh Latest Report
              </Button>
            </div>

            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-muted-foreground">
              Assessment ini tidak menggantikan inference PPE detail, tetapi menyatukan evidence terbaru, status monitoring, dan rule HSE menjadi baseline keputusan operasional.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Assessment Result</CardTitle>
            <CardDescription>
              Report HSE terakhir untuk source ini, termasuk readiness, evidence baseline, dan daftar temuan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!report ? (
              <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-6 text-sm text-muted-foreground">
                Belum ada report HSE. Jalankan assessment untuk menghasilkan baseline risk dan temuan source.
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={riskBadgeVariant[report.summary.riskLevel]}>
                      Risk {report.summary.riskLevel.toUpperCase()}
                    </Badge>
                    <Badge variant="outline">{formatDateTime(report.createdAt)}</Badge>
                    <Badge variant="outline">{report.id}</Badge>
                  </div>
                  <p className="text-sm leading-7 text-foreground">{report.summary.narrative}</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {report.readiness.items.map((item) => (
                    <div key={item.id} className="rounded-lg border bg-secondary/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        <Badge variant={readinessBadgeVariant[item.status]}>
                          {item.status === "ready" ? "Ready" : item.status === "warning" ? "Warning" : "Missing"}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">Temuan Aktif</p>
                    <Badge variant="outline">{report.findings.length} item</Badge>
                  </div>
                  {report.findings.length === 0 ? (
                    <div className="rounded-lg border bg-secondary/20 p-4 text-sm text-muted-foreground">
                      Tidak ada temuan aktif. Baseline HSE untuk source ini saat ini terlihat sehat.
                    </div>
                  ) : (
                    report.findings.map((finding) => (
                      <div key={finding.id} className="rounded-lg border bg-secondary/20 p-4 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{finding.title}</p>
                          <Badge variant={severityBadgeVariant[finding.severity]}>
                            {finding.severity.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{finding.detail}</p>
                        {finding.metric ? (
                          <p className="text-xs text-amber-300">Metric: {finding.metric}</p>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                          Rekomendasi: <span className="text-foreground">{finding.recommendation}</span>
                        </p>
                      </div>
                    ))
                  )}
                </div>

                {report.latestEvidence ? (
                  <div className="rounded-lg border bg-secondary/20 p-4 space-y-3">
                    <p className="text-sm font-medium text-foreground">Evidence Baseline</p>
                    <p className="text-sm text-muted-foreground">{report.latestEvidence.narrative}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{report.latestEvidence.eventCount} event</Badge>
                      <Badge variant="outline">{report.latestEvidence.violatorCount} violator</Badge>
                      <Badge variant="outline">{report.latestEvidence.snapshotCount} snapshot</Badge>
                    </div>
                    {report.latestEvidence.latestSnapshotUrl ? (
                      <img
                        src={report.latestEvidence.latestSnapshotUrl}
                        alt="Latest evidence snapshot"
                        className="h-48 w-full rounded-lg border object-cover"
                      />
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
