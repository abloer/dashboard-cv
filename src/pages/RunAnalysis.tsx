import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  AlertTriangle,
  Briefcase,
  ClipboardCheck,
  FileVideo,
  FolderSearch,
  HardHat,
  Image as ImageIcon,
  Loader2,
  Radar,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Trash2,
  Undo2,
  Users,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { SnapshotLightbox, type SnapshotLightboxItem } from "@/components/media/SnapshotLightbox";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { useMediaRegistry } from "@/hooks/useMediaRegistry";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  analysisServerBaseUrl,
  getNoHelmetAnalysisJob,
  getNoHelmetDefaults,
  getVideoPreview,
  startNoHelmetAnalysis,
  type NoHelmetAnalysisEvent,
  type NoHelmetAnalysisJob,
  type NoHelmetAnalysisSummary,
  type NoHelmetGlobalSummary,
  type VideoPreviewResponse,
} from "@/lib/noHelmetAnalysis";
import {
  getNoSafetyVestDefaults,
  getNoSafetyVestAnalysisJob,
  startNoSafetyVestAnalysis,
  type NoSafetyVestAnalysisEvent,
  type NoSafetyVestAnalysisJob,
  type NoSafetyVestAnalysisSummary,
} from "@/lib/noSafetyVestAnalysis";
import {
  getHseSafetyRulesDefaults,
  getLatestHseSafetyRulesReport,
  runHseSafetyRulesAssessment,
  type HseSafetyRulesReport,
} from "@/lib/hseSafetyRules";
import {
  buildFindingsAggregate,
  moduleKeyLabel,
  type AnalysisFinding,
} from "@/lib/analysisFindings";
import { COMMUNITY_DEMO_PRESET, STRICT_DISTANCE_PRESET, readNoHelmetConfig } from "@/lib/noHelmetConfig";
import { readNoSafetyVestConfig } from "@/lib/noSafetyVestConfig";
import type { MediaSource } from "@/lib/mediaRegistry";

type RoiPoint = [number, number];
type RunCategoryKey = "PPE" | "HSE" | "Operations" | "Fleet & KPI";
type PpeModuleKey = "ppe.no-helmet" | "ppe.no-safety-vest";
type PpeAnalysisJob = NoHelmetAnalysisJob | NoSafetyVestAnalysisJob;

const DEFAULT_ROI_POINTS: RoiPoint[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

const RUN_CATEGORY_OPTIONS: Array<{
  key: RunCategoryKey;
  label: string;
  description: string;
  icon: typeof HardHat;
  engineStatus: "active" | "planned";
}> = [
  {
    key: "PPE",
    label: "PPE",
    description: "Menjalankan detector PPE yang aktif, saat ini fokus ke modul no helmet.",
    icon: HardHat,
    engineStatus: "active",
  },
  {
    key: "HSE",
    label: "HSE",
    description: "Menjalankan assessment safety rules berbasis policy, restricted zone, dan evidence PPE.",
    icon: ShieldCheck,
    engineStatus: "active",
  },
  {
    key: "Operations",
    label: "Operations",
    description: "Modul operations belum punya engine run aktif.",
    icon: Users,
    engineStatus: "planned",
  },
  {
    key: "Fleet & KPI",
    label: "Fleet & KPI",
    description: "Modul fleet dan KPI masih planned.",
    icon: Briefcase,
    engineStatus: "planned",
  },
];

const PPE_MODULE_OPTIONS: Array<{
  key: PpeModuleKey;
  label: string;
  description: string;
}> = [
  {
    key: "ppe.no-helmet",
    label: "No Helmet",
    description: "Detector PPE untuk pekerja tanpa helm keselamatan.",
  },
  {
    key: "ppe.no-safety-vest",
    label: "No Safety Vest",
    description: "Detector PPE untuk pekerja tanpa rompi keselamatan.",
  },
];

const riskBadgeVariant = {
  low: "secondary" as const,
  medium: "default" as const,
  high: "destructive" as const,
};

const severityBadgeVariant = {
  low: "secondary" as const,
  medium: "default" as const,
  high: "destructive" as const,
};

const formatSeconds = (value: number) => `${value.toFixed(2)} s`;

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

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const toTimestamp = (value: string | null | undefined) => {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const humanizeRequestError = (error: unknown) => {
  const fallback = "Permintaan gagal diproses.";
  if (!(error instanceof Error)) return fallback;
  if (error.message === "Failed to fetch" || error.message === "Load failed") {
    return "Tidak bisa menjangkau service backend di 127.0.0.1:8081. Jalankan backend lokal di folder server terlebih dulu.";
  }
  if (error.message === "Video path not found.") {
    return "File video untuk source ini sudah tidak ada di disk lokal. Upload ulang dari Media Sources agar path source diperbarui.";
  }
  return error.message || fallback;
};

const isLegacyContainerModelPath = (value: string | null | undefined) =>
  String(value || "")
    .trim()
    .startsWith("/app/");

const asPercentPoints = (points: RoiPoint[]) =>
  points.map(([x, y]) => `${x * 100},${y * 100}`).join(" ");

const buildLegacyNoHelmetFindings = (
  source: MediaSource | null,
  analysisSummary: NoHelmetAnalysisSummary | null
): AnalysisFinding[] => {
  if (!source || !analysisSummary) return [];
  const createdAt = "createdAt" in analysisSummary && analysisSummary.createdAt
    ? analysisSummary.createdAt
    : new Date().toISOString();
  return analysisSummary.events.map((event) => {
    const durationSeconds = Math.max(0, event.end_time_seconds - event.start_time_seconds);
    const severity = event.max_confidence >= 0.8 ? "high" : "medium";
    return {
      id: `finding-${event.event_id}`,
      runId: `legacy-ppe-${source.id}`,
      sourceId: source.id,
      sourceName: source.name,
      sourceLocation: source.location,
      sourceType: source.type,
      category: "PPE",
      moduleKey: "ppe.no-helmet",
      findingType: "missing-helmet",
      title: "Pekerja tanpa helm terdeteksi",
      detail: `Detector menemukan event no helmet pada track ${event.track_id} di ROI ${event.roi_id}.`,
      recommendation: "Verifikasi visual di lapangan dan tindak lanjuti pelanggaran helm berulang.",
      severity,
      status: "open",
      riskScore: Math.round(event.max_confidence * 100),
      metric: `${durationSeconds.toFixed(1)} s • conf ${event.max_confidence.toFixed(2)}`,
      eventCount: 1,
      violatorCount: 1,
      startsAtSeconds: event.start_time_seconds,
      endsAtSeconds: event.end_time_seconds,
      durationSeconds,
      roiId: event.roi_id,
      zoneIds: [],
      requiredPpe: ["helmet"],
      trackIds: [event.track_id],
      labels: ["person", "helmet", "no-helmet"],
      snapshotUrl: event.snapshotUrl || null,
      evidenceUrls: event.snapshotUrl ? [event.snapshotUrl] : [],
      detectorEvidence: {
        analysisType: "no_helmet",
        outputDir: null,
        createdAt: null,
      },
      configSnapshot: {},
      metadata: {
        eventId: event.event_id,
      },
      createdAt,
      updatedAt: createdAt,
    };
  });
};

const buildLegacyNoSafetyVestFindings = (
  source: MediaSource | null,
  analysisSummary: NoSafetyVestAnalysisSummary | null
): AnalysisFinding[] => {
  if (!source || !analysisSummary) return [];
  const createdAt =
    "createdAt" in analysisSummary && analysisSummary.createdAt
      ? analysisSummary.createdAt
      : new Date().toISOString();
  return analysisSummary.events.map((event: NoSafetyVestAnalysisEvent) => {
    const durationSeconds = Math.max(0, event.end_time_seconds - event.start_time_seconds);
    const severity = event.max_confidence >= 0.8 ? "high" : "medium";
    return {
      id: `finding-${event.event_id}`,
      runId: `legacy-ppe-vest-${source.id}`,
      sourceId: source.id,
      sourceName: source.name,
      sourceLocation: source.location,
      sourceType: source.type,
      category: "PPE",
      moduleKey: "ppe.no-safety-vest",
      findingType: "missing-safety-vest",
      title: "Pekerja tanpa rompi keselamatan terdeteksi",
      detail: `Detector menemukan event no safety vest pada track ${event.track_id} di ROI ${event.roi_id}.`,
      recommendation: "Verifikasi visual di lapangan dan tindak lanjuti pelanggaran rompi keselamatan berulang.",
      severity,
      status: "open",
      riskScore: Math.round(event.max_confidence * 100),
      metric: `${durationSeconds.toFixed(1)} s • conf ${event.max_confidence.toFixed(2)}`,
      eventCount: 1,
      violatorCount: 1,
      startsAtSeconds: event.start_time_seconds,
      endsAtSeconds: event.end_time_seconds,
      durationSeconds,
      roiId: event.roi_id,
      zoneIds: [],
      requiredPpe: ["safety vest"],
      trackIds: [event.track_id],
      labels: ["person", "safety-vest", "no-safety-vest"],
      snapshotUrl: event.snapshotUrl || null,
      evidenceUrls: event.snapshotUrl ? [event.snapshotUrl] : [],
      detectorEvidence: {
        analysisType: "no_safety_vest",
        outputDir: null,
        createdAt,
      },
      configSnapshot: {},
      metadata: {
        eventId: event.event_id,
      },
      createdAt,
      updatedAt: createdAt,
    };
  });
};

const buildLegacyHseFindings = (
  source: MediaSource | null,
  report: HseSafetyRulesReport | null
): AnalysisFinding[] => {
  if (!source || !report) return [];
  return report.findings.map((finding) => ({
    id: `finding-${finding.id}`,
    runId: report.id,
    sourceId: source.id,
    sourceName: source.name,
    sourceLocation: source.location,
    sourceType: source.type,
    category: "HSE",
    moduleKey: "hse.safety-rules",
    findingType: finding.id,
    title: finding.title,
    detail: finding.detail,
    recommendation: finding.recommendation,
    severity: finding.severity,
    status: finding.status === "resolved" ? "resolved" : "open",
    riskScore: finding.severity === "high" ? 90 : finding.severity === "medium" ? 65 : 30,
    metric: finding.metric || null,
    eventCount: finding.metric ? 1 : 0,
    violatorCount: finding.severity === "high" ? 1 : 0,
    startsAtSeconds: null,
    endsAtSeconds: null,
    durationSeconds: null,
    roiId: null,
    zoneIds: report.summary.restrictedZones,
    requiredPpe: report.summary.requiredPpe,
    trackIds: [],
    labels: [],
    snapshotUrl: null,
    evidenceUrls: [],
    detectorEvidence: {
      analysisType: report.latestEvidence?.analysisType || null,
      outputDir: report.outputDir,
      createdAt: report.createdAt,
    },
    configSnapshot: report.configSnapshot,
    metadata: {},
    createdAt: report.createdAt,
    updatedAt: report.createdAt,
  }));
};

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
      narrative: "Belum ada event PPE yang tercatat untuk source ini.",
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
      `Sistem PPE mencatat ${events.length} event dengan ${snapshotCount} bukti snapshot. ` +
      `Estimasi track/objek pelanggar yang terdeteksi saat ini adalah ${violators.length}.`,
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

export default function RunAnalysis() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: mediaItems = [] } = useMediaRegistry();
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const lastAppliedSourceIdRef = useRef<string | null>(null);
  const terminalJobToastRef = useRef<string | null>(null);
  const processedTerminalJobRef = useRef<string | null>(null);
  const autoRefreshedHseKeyRef = useRef<string | null>(null);
  const savedNoHelmetConfig = readNoHelmetConfig();
  const savedNoSafetyVestConfig = readNoSafetyVestConfig();

  const [selectedRunCategories, setSelectedRunCategories] = useState<RunCategoryKey[]>([]);
  const [selectedPpeModules, setSelectedPpeModules] = useState<PpeModuleKey[]>(["ppe.no-helmet"]);
  const [activePpeModule, setActivePpeModule] = useState<PpeModuleKey | null>(null);
  const [pendingPpeModules, setPendingPpeModules] = useState<PpeModuleKey[]>([]);
  const [analysisJob, setAnalysisJob] = useState<PpeAnalysisJob | null>(null);
  const [summary, setSummary] = useState<NoHelmetAnalysisSummary | null>(null);
  const [noSafetyVestSummary, setNoSafetyVestSummary] = useState<NoSafetyVestAnalysisSummary | null>(null);
  const [hseReport, setHseReport] = useState<HseSafetyRulesReport | null>(null);
  const [defaultHseConfig, setDefaultHseConfig] = useState<HseSafetyRulesReport["configSnapshot"] | null>(null);
  const [outputDir, setOutputDir] = useState("");
  const [serverDefaults, setServerDefaults] = useState<{
    defaultModelPath: string;
    defaultRoiConfigPath: string;
    analysisOutputRoot: string;
  } | null>(null);
  const [noSafetyVestServerDefaults, setNoSafetyVestServerDefaults] = useState<{
    defaultModelPath: string;
    defaultRoiConfigPath: string;
    analysisOutputRoot: string;
  } | null>(null);
  const [preview, setPreview] = useState<VideoPreviewResponse | null>(null);
  const [selectedSnapshotIndex, setSelectedSnapshotIndex] = useState<number | null>(null);
  const [dragPointIndex, setDragPointIndex] = useState<number | null>(null);
  const [stderr, setStderr] = useState("");
  const [stdout, setStdout] = useState("");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRunningHse, setIsRunningHse] = useState(false);
  const [isLoadingHseDefaults, setIsLoadingHseDefaults] = useState(false);
  const [isLoadingHseLatest, setIsLoadingHseLatest] = useState(false);
  const [pendingHseAfterPpe, setPendingHseAfterPpe] = useState(false);
  const [sourceFileMissing, setSourceFileMissing] = useState(false);
  const [hasSessionResults, setHasSessionResults] = useState(false);
  const [roiPoints, setRoiPoints] = useState<RoiPoint[]>(DEFAULT_ROI_POINTS);
  const [formState, setFormState] = useState({
    videoPath: "",
    modelPath: savedNoHelmetConfig.modelPath,
    roiConfigPath: savedNoHelmetConfig.roiConfigPath,
    roiId: savedNoHelmetConfig.roiId,
    previewTimestampSeconds: "",
    confidenceThreshold: savedNoHelmetConfig.confidenceThreshold,
    iouThreshold: savedNoHelmetConfig.iouThreshold,
    topRatio: savedNoHelmetConfig.topRatio,
    helmetOverlapThreshold: savedNoHelmetConfig.helmetOverlapThreshold,
    violationOnFrames: savedNoHelmetConfig.violationOnFrames,
    cleanOffFrames: savedNoHelmetConfig.cleanOffFrames,
    frameStep: savedNoHelmetConfig.frameStep,
    imageSize: savedNoHelmetConfig.imageSize,
    personLabels: savedNoHelmetConfig.personLabels,
    helmetLabels: savedNoHelmetConfig.helmetLabels,
    violationLabels: savedNoHelmetConfig.violationLabels,
  });

  const selectedSourceId = searchParams.get("sourceId");
  const selectedSource = useMemo(
    () => mediaItems.find((item) => item.id === selectedSourceId) || null,
    [mediaItems, selectedSourceId]
  );
  const selectableSources = useMemo(
    () => [...mediaItems].sort((left, right) => left.name.localeCompare(right.name, "id-ID", { sensitivity: "base" })),
    [mediaItems]
  );
  const sourceSupportsPpe = selectedSource?.analytics.includes("PPE") ?? false;
  const sourceSupportsHse = selectedSource?.analytics.includes("HSE") ?? false;
  const hasValidRoi = roiPoints.length >= 3;
  const hasCustomRoiPath = formState.roiConfigPath.trim().length > 0;
  const canRunPpe =
    Boolean(selectedSource) &&
    sourceSupportsPpe &&
    formState.videoPath.trim().length > 0 &&
    formState.modelPath.trim().length > 0 &&
    (hasValidRoi || hasCustomRoiPath);
  const canRunHse = Boolean(selectedSource) && sourceSupportsHse;
  const hasSelectedPpeModule = selectedPpeModules.length > 0;
  const hasSupportedSelection = selectedRunCategories.some((category) =>
    category === "PPE" ? canRunPpe && hasSelectedPpeModule : category === "HSE" ? canRunHse : false
  );
  const globalSummary = useMemo(() => {
    if (summary) {
      return summary.global_summary ?? buildClientGlobalSummary(summary.events);
    }
    if (noSafetyVestSummary) {
      return (
        noSafetyVestSummary.global_summary ??
        buildClientGlobalSummary(noSafetyVestSummary.events as unknown as NoHelmetAnalysisEvent[])
      );
    }
    return null;
  }, [noSafetyVestSummary, summary]);
  const latestPpeEvidenceAt = useMemo(() => {
    return Math.max(
      toTimestamp(summary?.createdAt),
      toTimestamp(noSafetyVestSummary?.createdAt)
    );
  }, [noSafetyVestSummary?.createdAt, summary?.createdAt]);
  const hseReportTimestamp = toTimestamp(hseReport?.createdAt);
  const isHseReportStale = Boolean(
    hseReport &&
      sourceSupportsHse &&
      latestPpeEvidenceAt > 0 &&
      latestPpeEvidenceAt > hseReportTimestamp
  );
  const unifiedFindings = useMemo<AnalysisFinding[]>(() => {
    const helmetFindings =
      summary?.analysisFindings && summary.analysisFindings.length > 0
        ? summary.analysisFindings
        : buildLegacyNoHelmetFindings(selectedSource, summary);
    const vestFindings =
      noSafetyVestSummary?.analysisFindings && noSafetyVestSummary.analysisFindings.length > 0
        ? noSafetyVestSummary.analysisFindings
        : buildLegacyNoSafetyVestFindings(selectedSource, noSafetyVestSummary);
    const hseFindings = isHseReportStale
      ? []
      : hseReport?.analysisFindings && hseReport.analysisFindings.length > 0
        ? hseReport.analysisFindings
        : buildLegacyHseFindings(selectedSource, hseReport);

    return [...helmetFindings, ...vestFindings, ...hseFindings].sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    );
  }, [hseReport, isHseReportStale, noSafetyVestSummary, selectedSource, summary]);
  const reviewFindings = useMemo(
    () => unifiedFindings.filter((finding) => finding.status === "uncertain"),
    [unifiedFindings]
  );
  const finalFindings = useMemo(
    () => unifiedFindings.filter((finding) => finding.status !== "uncertain"),
    [unifiedFindings]
  );
  const unifiedSummary = useMemo(() => buildFindingsAggregate(unifiedFindings), [unifiedFindings]);
  const activePpeModuleLabel =
    activePpeModule === "ppe.no-safety-vest" ? "PPE • No Safety Vest" : "PPE • No Helmet";
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
  const snapshotItems: SnapshotLightboxItem[] = unifiedFindings
    .filter((finding) => Boolean(finding.snapshotUrl))
    .map((finding) => ({
      id: finding.id,
      title: `${moduleKeyLabel[finding.moduleKey] || finding.moduleKey} • ${finding.title}${finding.status === "uncertain" ? " • Needs Review" : ""}`,
      url: finding.snapshotUrl as string,
    }));

  const handleSourceChange = (nextSourceId: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("sourceId", nextSourceId);
    setSearchParams(nextParams);
  };

  const handleRunCategoryChange = (category: RunCategoryKey, checked: boolean) => {
    setSelectedRunCategories((current) => {
      if (checked) {
        return current.includes(category) ? current : [...current, category];
      }
      return current.filter((item) => item !== category);
    });
  };

  const selectAllActiveCategories = () => {
    if (!selectedSource) return;
    setSelectedRunCategories(selectedSource.analytics.filter((item): item is RunCategoryKey =>
      RUN_CATEGORY_OPTIONS.some((option) => option.key === item)
    ));
  };

  useEffect(() => {
    let ignore = false;
    getNoHelmetDefaults()
      .then((defaults) => {
        if (ignore) return;
        setServerDefaults({
          defaultModelPath: defaults.defaultModelPath,
          defaultRoiConfigPath: defaults.defaultRoiConfigPath,
          analysisOutputRoot: defaults.analysisOutputRoot,
        });
        setFormState((current) => {
          const legacyLocalPath =
            current.modelPath.startsWith("/Users/") ||
            isLegacyContainerModelPath(current.modelPath) ||
            current.modelPath === COMMUNITY_DEMO_PRESET.suggestedModelPath;
          const shouldUseServerModel =
            savedNoHelmetConfig.modelSource !== "manual" || !current.modelPath || legacyLocalPath;
          if (shouldUseServerModel) {
            return {
              ...current,
              modelPath: defaults.defaultModelPath,
            };
          }
          return current;
        });
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
    let ignore = false;
    getNoSafetyVestDefaults()
      .then((defaults) => {
        if (ignore) return;
        setNoSafetyVestServerDefaults({
          defaultModelPath: defaults.defaultModelPath,
          defaultRoiConfigPath: defaults.defaultRoiConfigPath,
          analysisOutputRoot: defaults.analysisOutputRoot,
        });
      })
      .catch((error) => {
        if (!ignore) {
          toast({
            title: "Default No Safety Vest belum siap",
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
    let ignore = false;
    setIsLoadingHseDefaults(true);
    getHseSafetyRulesDefaults()
      .then((response) => {
        if (!ignore) {
          setDefaultHseConfig(response.config);
        }
      })
      .catch(() => {
        if (!ignore) {
          setDefaultHseConfig(null);
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoadingHseDefaults(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const handlePointerUp = () => setDragPointIndex(null);
    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, []);

  useEffect(() => {
    if (!selectedSourceId) {
      lastAppliedSourceIdRef.current = null;
      setPreview(null);
      setFormState((current) => ({
        ...current,
        videoPath: "",
        roiConfigPath: "",
      }));
      setSelectedRunCategories([]);
      setSelectedPpeModules(["ppe.no-helmet"]);
      setSummary(null);
      setNoSafetyVestSummary(null);
      setHseReport(null);
      autoRefreshedHseKeyRef.current = null;
      setHasSessionResults(false);
      return;
    }

    if (!selectedSource) {
      return;
    }

    if (lastAppliedSourceIdRef.current !== selectedSource.id) {
      const nextRoiId = `${slugify(selectedSource.name) || selectedSource.id}-dashboard`;
      setFormState((current) => ({
        ...current,
        videoPath: selectedSource.source,
        roiId: nextRoiId,
        roiConfigPath: "",
      }));
      setPreview(null);
      setAnalysisJob(null);
      setSummary(null);
      setNoSafetyVestSummary(null);
      setOutputDir("");
      setStdout("");
      setStderr("");
      setSourceFileMissing(false);
      setActivePpeModule(null);
      setPendingPpeModules([]);
      setHasSessionResults(false);
      processedTerminalJobRef.current = null;
      autoRefreshedHseKeyRef.current = null;
      lastAppliedSourceIdRef.current = selectedSource.id;
      setSelectedRunCategories(
        selectedSource.analytics.filter((item): item is RunCategoryKey =>
          RUN_CATEGORY_OPTIONS.some((option) => option.key === item)
        )
      );
      setSelectedPpeModules(["ppe.no-helmet", "ppe.no-safety-vest"]);
    }
  }, [selectedSource, selectedSourceId]);

  useEffect(() => {
    if (!selectedSourceId) {
      setHseReport(null);
      return;
    }

    setHseReport(null);
    setIsLoadingHseLatest(false);
  }, [selectedSourceId]);

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
      description: "Parameter awal PPE no helmet disesuaikan ke preset komunitas DetectConstructionSafety.",
    });
  };

  const applyStrictDistancePreset = () => {
    setFormState((current) => ({
      ...current,
      modelPath: current.modelPath || STRICT_DISTANCE_PRESET.suggestedModelPath,
      confidenceThreshold: STRICT_DISTANCE_PRESET.confidenceThreshold,
      iouThreshold: STRICT_DISTANCE_PRESET.iouThreshold,
      topRatio: STRICT_DISTANCE_PRESET.topRatio,
      helmetOverlapThreshold: STRICT_DISTANCE_PRESET.helmetOverlapThreshold,
      personLabels: STRICT_DISTANCE_PRESET.personLabels,
      helmetLabels: STRICT_DISTANCE_PRESET.helmetLabels,
      violationLabels: STRICT_DISTANCE_PRESET.violationLabels,
      violationOnFrames: STRICT_DISTANCE_PRESET.violationOnFrames,
      cleanOffFrames: STRICT_DISTANCE_PRESET.cleanOffFrames,
      frameStep: STRICT_DISTANCE_PRESET.frameStep,
      imageSize: STRICT_DISTANCE_PRESET.imageSize,
    }));
    toast({
      title: "Preset strict diterapkan",
      description: "Preset konservatif untuk kamera jauh diterapkan agar false positive no helmet berkurang.",
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

  const loadPreview = async (videoPath: string) => {
    setIsPreviewLoading(true);
    try {
      const trimmedTimestamp = formState.previewTimestampSeconds.trim();
      const timestamp = trimmedTimestamp.length > 0 ? Number(trimmedTimestamp) : undefined;
      const response = await getVideoPreview(
        videoPath.trim(),
        typeof timestamp === "number" && Number.isFinite(timestamp) ? timestamp : undefined
      );
      setPreview(response);
      setSourceFileMissing(false);
      if (roiPoints.length === 0) {
        setRoiPoints(DEFAULT_ROI_POINTS);
      }
      toast({
        title: "Preview siap",
        description: `Frame preview dibuat pada ${formatSeconds(response.timestampSeconds)}.`,
      });
    } catch (error) {
      const message = humanizeRequestError(error);
      if (message.includes("Upload ulang")) {
        setSourceFileMissing(true);
      }
      toast({
        title: "Preview gagal",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const runHseAssessmentInternal = async (showSuccessToast = true) => {
    if (!selectedSourceId || !sourceSupportsHse) {
      return;
    }

    setIsRunningHse(true);
    try {
      const response = await runHseSafetyRulesAssessment(selectedSourceId);
      setHseReport(response.report);
      setSourceFileMissing(false);
      setHasSessionResults(true);
      if (showSuccessToast) {
        toast({
          title: "Assessment HSE selesai",
          description: `${response.report.summary.openFindingCount} temuan aktif terdeteksi pada source ini.`,
        });
      }
    } catch (error) {
      const message = humanizeRequestError(error);
      if (message.includes("Upload ulang")) {
        setSourceFileMissing(true);
      }
      toast({
        title: "Assessment HSE gagal",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsRunningHse(false);
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
        if (activePpeModule === "ppe.no-safety-vest") {
          setNoSafetyVestSummary(job.summary as NoSafetyVestAnalysisSummary | null);
        } else {
          setSummary(job.summary as NoHelmetAnalysisSummary | null);
        }
        if (terminalJobToastRef.current !== job.id) {
          terminalJobToastRef.current = job.id;
          toast({
            title: `${activePpeModuleLabel} selesai`,
            description: `${job.summary?.event_count ?? 0} event ditemukan.`,
          });
        }
      } else if (job.status === "failed") {
        if (activePpeModule === "ppe.no-safety-vest") {
          setNoSafetyVestSummary(null);
        } else {
          setSummary(null);
        }
        setIsAnalyzing(false);
        setPendingPpeModules([]);
        setPendingHseAfterPpe(false);
        if (terminalJobToastRef.current !== job.id) {
          terminalJobToastRef.current = job.id;
          toast({
            title: `${activePpeModuleLabel} gagal`,
            description: job.message || job.stderr || "Job analisis gagal diproses.",
            variant: "destructive",
          });
        }
      }
    };

    const pollJob = async () => {
      try {
        const response =
          activePpeModule === "ppe.no-safety-vest"
            ? await getNoSafetyVestAnalysisJob(analysisJob.id)
            : await getNoHelmetAnalysisJob(analysisJob.id);
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
        setPendingHseAfterPpe(false);
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
  }, [activePpeModule, activePpeModuleLabel, analysisJob?.id, toast]);

  useEffect(() => {
    if (
      !analysisJob ||
      analysisJob.status !== "completed" ||
      processedTerminalJobRef.current === analysisJob.id
    ) {
      return;
    }
    processedTerminalJobRef.current = analysisJob.id;
    if (pendingPpeModules.length > 0) {
      setHasSessionResults(true);
      const [nextModule, ...restModules] = pendingPpeModules;
      setPendingPpeModules(restModules);
      void startPpeModule(nextModule);
      return;
    }
    setIsAnalyzing(false);
    setHasSessionResults(true);
    if (pendingHseAfterPpe || sourceSupportsHse) {
      setPendingHseAfterPpe(false);
      void runHseAssessmentInternal(true);
    }
  }, [analysisJob, pendingHseAfterPpe, pendingPpeModules, sourceSupportsHse]);

  useEffect(() => {
    if (
      !selectedSourceId ||
      !sourceSupportsHse ||
      !isHseReportStale ||
      isAnalyzing ||
      isRunningHse ||
      latestPpeEvidenceAt === 0
    ) {
      return;
    }

    const refreshKey = `${selectedSourceId}:${latestPpeEvidenceAt}`;
    if (autoRefreshedHseKeyRef.current === refreshKey) {
      return;
    }
    autoRefreshedHseKeyRef.current = refreshKey;
    void runHseAssessmentInternal(false);
  }, [isAnalyzing, isHseReportStale, isRunningHse, latestPpeEvidenceAt, selectedSourceId, sourceSupportsHse]);

  const startPpeModule = async (moduleKey: PpeModuleKey) => {
    if (!selectedSource) {
      return;
    }

    setActivePpeModule(moduleKey);
    setAnalysisJob(null);
    terminalJobToastRef.current = null;
    processedTerminalJobRef.current = null;
    setOutputDir("");
    setStdout("");
    setStderr("");

    const isVestModule = moduleKey === "ppe.no-safety-vest";
    const resolvedNoSafetyVestModelPath =
      savedNoSafetyVestConfig.modelSource !== "manual" ||
      !savedNoSafetyVestConfig.modelPath.trim() ||
      isLegacyContainerModelPath(savedNoSafetyVestConfig.modelPath)
        ? noSafetyVestServerDefaults?.defaultModelPath || savedNoSafetyVestConfig.modelPath.trim()
        : savedNoSafetyVestConfig.modelPath.trim();
    const resolvedNoHelmetModelPath =
      !formState.modelPath.trim() || isLegacyContainerModelPath(formState.modelPath)
        ? serverDefaults?.defaultModelPath || formState.modelPath.trim()
        : formState.modelPath.trim();
    const response = isVestModule
      ? await startNoSafetyVestAnalysis({
          mediaSourceId: selectedSource.id,
          videoPath: formState.videoPath.trim(),
          modelPath: resolvedNoSafetyVestModelPath,
          roiConfigPath: formState.roiConfigPath.trim() || undefined,
          roiId: formState.roiId.trim() || savedNoSafetyVestConfig.roiId || "roi-dashboard",
          roiNormalized: true,
          roiPolygon: hasValidRoi ? roiPoints : undefined,
          confidenceThreshold: Number(savedNoSafetyVestConfig.confidenceThreshold),
          iouThreshold: Number(savedNoSafetyVestConfig.iouThreshold),
          violationOnFrames: Number(savedNoSafetyVestConfig.violationOnFrames),
          cleanOffFrames: Number(savedNoSafetyVestConfig.cleanOffFrames),
          frameStep: Number(savedNoSafetyVestConfig.frameStep),
          imageSize: Number(savedNoSafetyVestConfig.imageSize),
          personLabels: ["person"],
          vestLabels: parseCommaSeparated(savedNoSafetyVestConfig.vestLabels),
          violationLabels: parseCommaSeparated(savedNoSafetyVestConfig.violationLabels),
        })
      : await startNoHelmetAnalysis({
          mediaSourceId: selectedSource.id,
          videoPath: formState.videoPath.trim(),
          modelPath: resolvedNoHelmetModelPath,
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
      mediaSourceId: selectedSource.id,
      videoPath: formState.videoPath.trim(),
      stdout: "",
      stderr: "",
      summary: null,
      queuePosition: 0,
    });
    setOutputDir(response.outputDir);
    setStdout(`Job ${moduleKeyLabel[moduleKey]} dibuat. Worker akan memproses source aktif di background.`);
    toast({
      title: `${moduleKeyLabel[moduleKey]} dimulai`,
      description: response.message,
    });
  };

  const startPpeAnalysis = async (queueHseAfterwards: boolean) => {
    if (!selectedSource) {
      toast({
        title: "Pilih source terlebih dulu",
        description: "Source aktif wajib dipilih sebelum menjalankan modul PPE.",
        variant: "destructive",
      });
      return;
    }
    if (!canRunPpe) {
      toast({
        title: "Konfigurasi PPE belum siap",
        description: "Pastikan source punya kategori PPE, model terisi, dan ROI valid sebelum run.",
        variant: "destructive",
      });
      return;
    }
    if (!selectedPpeModules.length) {
      toast({
        title: "Pilih modul PPE terlebih dulu",
        description: "Centang minimal satu sub-modul PPE yang ingin dijalankan.",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    setPendingHseAfterPpe(queueHseAfterwards);
    setPendingPpeModules(selectedPpeModules.slice(1));

    try {
      await startPpeModule(selectedPpeModules[0]);
    } catch (error) {
      setIsAnalyzing(false);
      setPendingPpeModules([]);
      setPendingHseAfterPpe(false);
      const message = humanizeRequestError(error);
      if (message.includes("Upload ulang")) {
        setSourceFileMissing(true);
      }
      setStderr(message);
      setAnalysisJob(null);
      toast({
        title: "Analisis PPE gagal",
        description: message,
        variant: "destructive",
      });
    }
  };

  const handleRunSelectedAnalysis = async () => {
    if (!selectedSource) {
      toast({
        title: "Pilih source terlebih dulu",
        description: "Halaman analysis selalu bekerja berdasarkan source yang aktif.",
        variant: "destructive",
      });
      return;
    }

    const wantsPpe = selectedRunCategories.includes("PPE");
    const wantsHse = selectedRunCategories.includes("HSE");

    if (!wantsPpe && !wantsHse) {
      toast({
        title: "Pilih modul yang akan dijalankan",
        description: "Pilih minimal satu modul aktif, misalnya PPE atau HSE.",
        variant: "destructive",
      });
      return;
    }

    if (wantsPpe) {
      await startPpeAnalysis(wantsHse && sourceSupportsHse);
      return;
    }

    if (wantsHse) {
      await runHseAssessmentInternal(true);
    }
  };

  return (
    <DashboardLayout>
      <Header
        title="Run Analysis"
        subtitle="Workspace analisis berbasis sesi untuk satu source aktif. Pilih source, siapkan preview, jalankan modul yang diperlukan, lalu review hasil sesi di halaman yang sama."
      />

      <Card className="mb-6 border-border/60 bg-secondary/10">
        <CardHeader>
          <CardTitle className="text-xl">Pilih Source</CardTitle>
          <CardDescription>
            Halaman ini dipakai untuk menjalankan analisis baru dari <code>Media Sources</code>, bukan untuk menampilkan riwayat hasil secara otomatis.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1.2fr,0.8fr] md:items-end">
          <div className="space-y-2">
            <Select value={selectedSourceId ?? undefined} onValueChange={handleSourceChange}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih source yang akan dianalisis" />
              </SelectTrigger>
              <SelectContent>
                {selectableSources.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} • {item.location}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Source yang dipilih di sini menjadi konteks tunggal untuk preview, run PPE, assessment HSE, serta hasil sesi analisis yang baru dijalankan dari halaman ini.
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/40 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Konteks Sesi</p>
            <p>
              {selectedSource
                ? `${selectedSource.name} aktif sebagai source untuk sesi analisis ini.`
                : "Belum ada source aktif. Pilih source dari daftar untuk memulai sesi analisis."}
            </p>
            {sourceFileMissing ? (
              <p className="mt-2 text-sm text-destructive">
                File video source ini sudah tidak ada di disk lokal. Upload ulang video dari <code>Media Sources</code>.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6 border-cyan-500/20 bg-cyan-500/5">
        <CardHeader>
          <CardTitle className="text-xl">Info Source Aktif</CardTitle>
          <CardDescription>
            Ringkasan source yang sedang dipakai sebagai target semua proses pada sesi analisis aktif.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1.35fr,repeat(4,minmax(0,1fr))]">
          <div className="space-y-1">
            <p className="text-lg font-semibold text-foreground">{selectedSource?.name || "--"}</p>
              <p className="text-sm text-muted-foreground">
                {selectedSource ? `${selectedSource.location} • ${selectedSource.source}` : "Belum ada source yang dipilih."}
              </p>
              {sourceFileMissing ? (
                <p className="text-sm text-destructive">
                  Path source tersimpan sudah tidak valid. Re-upload source untuk memperbarui lokasi file video.
                </p>
              ) : null}
            </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Tipe</p>
            <Badge variant="outline">
              {selectedSource
                ? selectedSource.type === "upload"
                  ? "Upload Video"
                  : "Camera Stream"
                : "--"}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Status</p>
            <Badge variant={selectedSource?.status === "active" ? "default" : "secondary"}>
              {selectedSource?.status || "--"}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Kategori Output</p>
            <div className="flex flex-wrap gap-2">
              {selectedSource?.analytics.length ? (
                selectedSource.analytics.map((analytic) => (
                  <Badge key={analytic} variant="outline" className="border-primary/20">
                    {analytic}
                  </Badge>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Belum ada kategori aktif.</p>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Konteks</p>
            <p className="text-sm text-muted-foreground">
              {selectedSource?.note || "Tidak ada catatan operasional."}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Server Analisis</p>
            <p className="text-sm text-foreground">{analysisServerBaseUrl.replace("http://", "")}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl">Source & Preview</CardTitle>
          <CardDescription>
            Preview source aktif dan siapkan ROI visual yang akan dipakai untuk modul detector visual seperti PPE no helmet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[1fr,160px,auto]">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Source Path</label>
              <Input value={formState.videoPath} readOnly placeholder="Pilih source terlebih dulu" />
              <p className="text-xs text-muted-foreground">
                Upload video baru dan perubahan source tetap dilakukan dari halaman <code>Media Sources</code>.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Preview Time (s)</label>
              <Input
                value={formState.previewTimestampSeconds}
                onChange={(event) => handleChange("previewTimestampSeconds", event.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => loadPreview(formState.videoPath)}
                disabled={isPreviewLoading || !selectedSource || !formState.videoPath.trim()}
                variant="outline"
                className="gap-2 w-full md:w-auto"
              >
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
              {preview && <Badge variant="outline">{preview.metadata.width} x {preview.metadata.height}</Badge>}
              {preview && <Badge variant="outline">{formatSeconds(preview.metadata.durationSeconds)}</Badge>}
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
                  <img src={preview.previewUrl} alt="Preview frame" className="block w-full h-auto rounded-xl" />
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
                  {selectedSource
                    ? "Load preview dari source aktif untuk mulai menggambar ROI."
                    : "Pilih source terlebih dulu untuk mulai membuat preview dan ROI."}
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              Klik pada preview untuk menambah titik ROI. Drag titik untuk memindahkan. Double click titik untuk menghapus.
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl">Analysis Settings</CardTitle>
          <CardDescription>
            Pilih modul analysis yang akan dijalankan pada source ini. PPE akan memakai detector setup di bawah, sementara HSE memakai snapshot default module safety rules.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-border/60 bg-secondary/10 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Pilih Modul Analysis</p>
                <p className="text-xs text-muted-foreground">
                  Centang kategori yang ingin dijalankan untuk source aktif. Gunakan <code>Pilih Semua Kategori Aktif</code> untuk mengikuti kategori output source.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={selectAllActiveCategories} disabled={!selectedSource}>
                  Pilih Semua Kategori Aktif
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedRunCategories([])}>
                  Reset Pilihan
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {RUN_CATEGORY_OPTIONS.map((option) => {
                const isEnabledForSource = selectedSource?.analytics.includes(option.key) ?? false;
                const isChecked = selectedRunCategories.includes(option.key);
                return (
                  <label
                    key={option.key}
                    className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/50 p-4"
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(checked) => handleRunCategoryChange(option.key, Boolean(checked))}
                      disabled={!isEnabledForSource}
                    />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{option.label}</span>
                        <Badge variant={option.engineStatus === "active" ? "default" : "secondary"}>
                          {option.engineStatus === "active" ? "Ready" : "Planned"}
                        </Badge>
                        {!isEnabledForSource ? <Badge variant="outline">Tidak aktif di source</Badge> : null}
                      </div>
                      <p className="text-sm text-muted-foreground">{option.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>

            {selectedRunCategories.includes("PPE") ? (
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Sub-modul PPE</p>
                  <p className="text-xs text-muted-foreground">
                    Pilih detector PPE yang ingin dijalankan. Keduanya bisa dijalankan berurutan pada source yang sama.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {PPE_MODULE_OPTIONS.map((option) => (
                    <label
                      key={option.key}
                      className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/50 p-4"
                    >
                      <Checkbox
                        checked={selectedPpeModules.includes(option.key)}
                        onCheckedChange={(checked) =>
                          setSelectedPpeModules((current) =>
                            checked
                              ? current.includes(option.key)
                                ? current
                                : [...current, option.key]
                              : current.filter((item) => item !== option.key)
                          )
                        }
                      />
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">{option.label}</p>
                        <p className="text-sm text-muted-foreground">{option.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
            <div className="space-y-6">
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Community Demo Preset</p>
                    <p className="text-xs text-muted-foreground">
                      Baseline awal untuk detector PPE no helmet.
                    </p>
                  </div>
                  <Button type="button" variant="outline" onClick={applyCommunityDemoPreset}>
                    Gunakan Preset Demo
                  </Button>
                </div>
                <p className="text-xs break-all text-muted-foreground">Repo sumber: {COMMUNITY_DEMO_PRESET.repoUrl}</p>
                <p className="text-xs break-all text-muted-foreground">
                  Suggested model path: {serverDefaults?.defaultModelPath || COMMUNITY_DEMO_PRESET.suggestedModelPath}
                </p>
              </div>

              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Strict Distant-View Preset</p>
                    <p className="text-xs text-muted-foreground">
                      Baseline konservatif untuk objek kecil, kamera jauh, dan scene yang rawan false positive.
                    </p>
                  </div>
                  <Button type="button" variant="outline" onClick={applyStrictDistancePreset}>
                    Gunakan Preset Strict
                  </Button>
                </div>
                <p className="text-xs break-all text-muted-foreground">
                  Conf {STRICT_DISTANCE_PRESET.confidenceThreshold} • Step {STRICT_DISTANCE_PRESET.frameStep} • On {STRICT_DISTANCE_PRESET.violationOnFrames} • Off {STRICT_DISTANCE_PRESET.cleanOffFrames} • ImgSz {STRICT_DISTANCE_PRESET.imageSize}
                </p>
                <p className="text-xs text-muted-foreground">
                  Violation label langsung dikosongkan agar detector mengandalkan pencocokan `person + hardhat` yang lebih aman untuk scene jauh.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-foreground">Model Path PPE</label>
                  <Input
                    value={formState.modelPath}
                    onChange={(event) => handleChange("modelPath", event.target.value)}
                    placeholder={serverDefaults?.defaultModelPath || "/app/models/detect-construction-safety-best.pt"}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">ROI ID</label>
                  <Input value={formState.roiId} onChange={(event) => handleChange("roiId", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Custom ROI Path</label>
                  <Input value={formState.roiConfigPath} onChange={(event) => handleChange("roiConfigPath", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Person Labels</label>
                  <Input value={formState.personLabels} onChange={(event) => handleChange("personLabels", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Helmet Labels</label>
                  <Input value={formState.helmetLabels} onChange={(event) => handleChange("helmetLabels", event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-foreground">Violation Labels</label>
                  <Input
                    value={formState.violationLabels}
                    onChange={(event) => handleChange("violationLabels", event.target.value)}
                    placeholder="Opsional. Kosongkan untuk hanya memakai person + hardhat matching"
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
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Image Size</label>
                  <Input value={formState.imageSize} onChange={(event) => handleChange("imageSize", event.target.value)} />
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-lg border bg-secondary/20 p-4 space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Status Run PPE</p>
                <div className="flex flex-wrap items-center gap-2">
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
                  {analysisJob ? <Badge variant="outline">{activePpeModuleLabel}</Badge> : null}
                  {analysisJob?.runId ? <Badge variant="outline">{analysisJob.runId}</Badge> : null}
                </div>
                <p className="text-sm font-medium break-all">{outputDir || serverDefaults?.analysisOutputRoot || "-"}</p>
                <p className="text-xs text-muted-foreground">
                  {analysisJob?.message ||
                    "Job PPE memakai background worker. Hasil sesi akan tampil setelah worker selesai. Jika dua sub-modul PPE dipilih, keduanya dijalankan berurutan."}
                </p>
              </div>

              <div className="rounded-lg border bg-secondary/20 p-4 space-y-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Snapshot Config HSE</p>
                {isLoadingHseDefaults ? (
                  <p className="text-sm text-muted-foreground">Memuat config HSE...</p>
                ) : defaultHseConfig ? (
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p className="break-all">
                      <span className="font-medium text-foreground">Model:</span> {defaultHseConfig.modelPath}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Restricted Zones:</span> {defaultHseConfig.restrictedZones}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Required PPE:</span> {defaultHseConfig.requiredPpe}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Cooldown:</span> {defaultHseConfig.alertCooldownSeconds}s
                    </p>
                    {isHseReportStale ? (
                      <p className="text-xs text-amber-400">
                        Evidence PPE lebih baru daripada report HSE terakhir. Assessment HSE sedang disegarkan otomatis.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Config HSE belum tersedia.</p>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <Button type="button" onClick={handleRunSelectedAnalysis} disabled={!hasSupportedSelection || isAnalyzing || isRunningHse} className="gap-2">
                  {isAnalyzing || isRunningHse ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                  {isAnalyzing || isRunningHse ? "Menjalankan..." : "Run Selected Analysis"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void runHseAssessmentInternal(true)}
                  disabled={!canRunHse || isRunningHse}
                  className="gap-2"
                >
                  {isRunningHse ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  Jalankan Ulang HSE
                </Button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Stdout</label>
                <Textarea readOnly value={stdout || "Belum ada output."} className="min-h-[110px] bg-secondary/30" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Stderr / Error</label>
                <Textarea readOnly value={stderr || "Tidak ada error runtime."} className="min-h-[110px] bg-secondary/30" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl">Global Summary</CardTitle>
          <CardDescription>
            Ringkasan terpadu untuk hasil sesi saat ini. Hanya hasil analisis yang dijalankan dari halaman ini yang dirangkum di bawah.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!hasSessionResults || unifiedFindings.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-6 text-sm text-muted-foreground">
              Belum ada hasil analysis di sesi ini. Saat halaman baru dibuka atau setelah hard refresh, hasil lama tidak ditampilkan otomatis. Jalankan PPE, HSE, atau keduanya untuk menghasilkan summary source ini.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={unifiedSummary.highSeverityCount > 0 ? "destructive" : unifiedSummary.mediumSeverityCount > 0 ? "default" : "secondary"}>
                    {unifiedSummary.highSeverityCount > 0 ? "Risk HIGH" : unifiedSummary.mediumSeverityCount > 0 ? "Risk MEDIUM" : "Risk LOW"}
                  </Badge>
                  <Badge variant="outline">{formatDateTime(unifiedSummary.latestCreatedAt)}</Badge>
                  <Badge variant="outline">{unifiedSummary.totalFindings} finding</Badge>
                  {reviewFindings.length > 0 ? (
                    <Badge variant="outline">{reviewFindings.length} needs review</Badge>
                  ) : null}
                </div>
                <p className="text-sm leading-7 text-foreground">
                  Source ini saat ini memiliki {unifiedSummary.totalFindings} finding gabungan dari modul yang dijalankan.
                  Severity tertinggi adalah {unifiedSummary.highSeverityCount > 0 ? "high" : unifiedSummary.mediumSeverityCount > 0 ? "medium" : "low"}.
                </p>
                {reviewFindings.length > 0 ? (
                  <p className="text-xs leading-6 text-muted-foreground">
                    {reviewFindings.length} indikasi tambahan masih berstatus <span className="text-foreground">needs review</span> dan tidak dihitung sebagai violation final di summary maupun HSE.
                  </p>
                ) : null}
              </div>
              <div className="grid gap-4 md:grid-cols-5">
                <div className="rounded-lg border bg-secondary/20 p-4 space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Open Findings</p>
                  <p className="text-2xl font-semibold">{unifiedSummary.openFindings}</p>
                </div>
                <div className="rounded-lg border bg-secondary/20 p-4 space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">High Severity</p>
                  <p className="text-2xl font-semibold">{unifiedSummary.highSeverityCount}</p>
                </div>
                <div className="rounded-lg border bg-secondary/20 p-4 space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Medium Severity</p>
                  <p className="text-2xl font-semibold">{unifiedSummary.mediumSeverityCount}</p>
                </div>
                <div className="rounded-lg border bg-secondary/20 p-4 space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Low Severity</p>
                  <p className="text-2xl font-semibold">{unifiedSummary.lowSeverityCount}</p>
                </div>
                <div className="rounded-lg border bg-secondary/20 p-4 space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Needs Review</p>
                  <p className="text-2xl font-semibold">{reviewFindings.length}</p>
                </div>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg border bg-secondary/20 p-4 space-y-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Category Split</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(unifiedSummary.categoryCounts)
                      .filter(([, count]) => count > 0)
                      .map(([category, count]) => (
                        <Badge key={category} variant="outline">
                          {category}: {count}
                        </Badge>
                      ))}
                  </div>
                </div>
                <div className="rounded-lg border bg-secondary/20 p-4 space-y-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Module Split</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(unifiedSummary.moduleCounts).map(([moduleKey, count]) => (
                      <Badge key={moduleKey} variant="outline">
                        {moduleKeyLabel[moduleKey] || moduleKey}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              {globalSummary ? (
                <div className="rounded-lg border bg-secondary/20 p-4 space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Legacy PPE Detector Snapshot</p>
                  <p className="text-sm text-muted-foreground">
                    Narrative detector terakhir: <span className="text-foreground">{globalSummary.narrative}</span>
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Detected Events</CardTitle>
          <CardDescription>
            Daftar finding final dari sesi saat ini. PPE event dan HSE finding dirender dengan schema yang sama agar mudah dibandingkan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-secondary/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Module</TableHead>
                  <TableHead>Finding</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Metric</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!hasSessionResults || finalFindings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      Belum ada finding final di sesi ini. Jalankan satu atau lebih modul analysis untuk menghasilkan findings source ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  finalFindings.map((finding) => (
                    <TableRow key={finding.id}>
                      <TableCell className="font-medium">
                        <div className="space-y-1">
                          <Badge variant="outline">{finding.category}</Badge>
                          <div className="text-sm text-muted-foreground">
                            {moduleKeyLabel[finding.moduleKey] || finding.moduleKey}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">{finding.title}</div>
                          <div className="text-sm text-muted-foreground">{finding.detail}</div>
                          <div className="text-xs text-muted-foreground">
                            Rekomendasi: <span className="text-foreground">{finding.recommendation}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={severityBadgeVariant[finding.severity]}>
                          {finding.severity.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>{finding.metric || "--"}</TableCell>
                      <TableCell>
                        {finding.snapshotUrl ? (
                          <button
                            type="button"
                            className="block cursor-zoom-in"
                            onClick={() =>
                              setSelectedSnapshotIndex(snapshotItems.findIndex((item) => item.id === finding.id))
                            }
                          >
                            <img
                              src={finding.snapshotUrl}
                              alt={finding.title}
                              className="h-20 w-32 rounded-md border object-cover transition-transform hover:scale-[1.02]"
                            />
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 text-muted-foreground text-sm">
                            <AlertTriangle className="w-4 h-4" />
                            Tidak ada snapshot
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{formatDateTime(finding.createdAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {hasSessionResults && reviewFindings.length > 0 ? (
        <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-xl">Needs Review</CardTitle>
          <CardDescription>
              Indikasi ambigu dari sesi saat ini. Item di bawah ini tidak dihitung sebagai violation final dan perlu verifikasi operator sebelum ditindaklanjuti.
          </CardDescription>
        </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module</TableHead>
                    <TableHead>Indikasi</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Metric</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewFindings.map((finding) => (
                    <TableRow key={finding.id}>
                      <TableCell className="font-medium">
                        <div className="space-y-1">
                          <Badge variant="outline">{finding.category}</Badge>
                          <div className="text-sm text-muted-foreground">
                            {moduleKeyLabel[finding.moduleKey] || finding.moduleKey}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">{finding.title}</div>
                          <div className="text-sm text-muted-foreground">{finding.detail}</div>
                          <div className="text-xs text-muted-foreground">
                            Rekomendasi: <span className="text-foreground">{finding.recommendation}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">NEEDS REVIEW</Badge>
                      </TableCell>
                      <TableCell>{finding.metric || "--"}</TableCell>
                      <TableCell>
                        {finding.snapshotUrl ? (
                          <button
                            type="button"
                            className="block cursor-zoom-in"
                            onClick={() =>
                              setSelectedSnapshotIndex(snapshotItems.findIndex((item) => item.id === finding.id))
                            }
                          >
                            <img
                              src={finding.snapshotUrl}
                              alt={finding.title}
                              className="h-20 w-32 rounded-md border border-amber-500/30 object-cover transition-transform hover:scale-[1.02]"
                            />
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 text-muted-foreground text-sm">
                            <AlertTriangle className="w-4 h-4" />
                            Tidak ada snapshot
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{formatDateTime(finding.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

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
