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
import { Link, useSearchParams } from "react-router-dom";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  analysisServerBaseUrl,
  getNoHelmetAnalysisJob,
  getNoHelmetDefaults,
  getSourcePreview,
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
  getNoLifeVestDefaults,
  getNoLifeVestAnalysisJob,
  startNoLifeVestAnalysis,
  type NoLifeVestAnalysisEvent,
  type NoLifeVestAnalysisJob,
  type NoLifeVestAnalysisSummary,
} from "@/lib/noLifeVestAnalysis";
import {
  getHseSafetyRulesDefaults,
  getLatestHseSafetyRulesReport,
  runHseSafetyRulesAssessment,
  type HseSafetyRulesReport,
} from "@/lib/hseSafetyRules";
import {
  getWorkingAtHeightAnalysisJob,
  getWorkingAtHeightDefaults,
  startWorkingAtHeightAnalysis,
  type WorkingAtHeightAnalysisEvent,
  type WorkingAtHeightAnalysisJob,
  type WorkingAtHeightAnalysisSummary,
} from "@/lib/workingAtHeightAnalysis";
import {
  getRedLightViolationAnalysisJob,
  getRedLightViolationDefaults,
  startRedLightViolationAnalysis,
  type RedLightViolationAnalysisEvent,
  type RedLightViolationAnalysisJob,
  type RedLightViolationAnalysisSummary,
} from "@/lib/redLightViolationAnalysis";
import {
  getDumpTruckBedOpenAnalysisJob,
  getDumpTruckBedOpenDefaults,
  startDumpTruckBedOpenAnalysis,
  type DumpTruckBedOpenAnalysisEvent,
  type DumpTruckBedOpenAnalysisJob,
  type DumpTruckBedOpenAnalysisSummary,
} from "@/lib/dumpTruckBedOpenAnalysis";
import {
  buildFindingsAggregate,
  moduleKeyLabel,
  type AnalysisFinding,
} from "@/lib/analysisFindings";
import {
  generateHseNarrative,
  generateOperatorIncidentSummary,
  getAiAssistConfig,
  verifyNeedsReviewFinding,
  type NeedsReviewAiVerdict,
  type OperatorIncidentAiSummary,
} from "@/lib/aiAssist";
import { COMMUNITY_DEMO_PRESET, STRICT_DISTANCE_PRESET, readNoHelmetConfig } from "@/lib/noHelmetConfig";
import { readNoSafetyVestConfig } from "@/lib/noSafetyVestConfig";
import { readNoLifeVestConfig } from "@/lib/noLifeVestConfig";
import { readWorkingAtHeightConfig } from "@/lib/workingAtHeightConfig";
import { readRedLightViolationConfig } from "@/lib/redLightViolationConfig";
import { readDumpTruckBedOpenConfig } from "@/lib/dumpTruckBedOpenConfig";
import type { MediaSource } from "@/lib/mediaRegistry";

type RoiPoint = [number, number];
type RunCategoryKey = "PPE" | "HSE" | "Operations" | "Fleet & KPI";
type PpeModuleKey = "ppe.no-helmet" | "ppe.no-safety-vest" | "ppe.no-life-vest";
type HseModuleKey = "hse.safety-rules" | "hse.working-at-height";
type OperationsModuleKey = "operations.red-light-violation" | "operations.dump-truck-bed-open";
type AreaEditorModuleKey = PpeModuleKey | HseModuleKey | OperationsModuleKey;
type PpeAnalysisJob = NoHelmetAnalysisJob | NoSafetyVestAnalysisJob | NoLifeVestAnalysisJob;
type OperationsAnalysisJob = RedLightViolationAnalysisJob | DumpTruckBedOpenAnalysisJob;

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
    description: "Menjalankan vehicle safety analysis. Sprint ini sudah membuka engine Red Light Violation untuk source operations yang relevan.",
    icon: Users,
    engineStatus: "active",
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
  {
    key: "ppe.no-life-vest",
    label: "No Life Vest",
    description: "Detector PPE untuk pekerja/crew tanpa pelampung di area air.",
  },
];

const HSE_MODULE_OPTIONS: Array<{
  key: HseModuleKey;
  label: string;
  description: string;
}> = [
  {
    key: "hse.safety-rules",
    label: "Safety Rules",
    description: "Assessment HSE berbasis policy, restricted zone, dan evidence PPE/HSE.",
  },
  {
    key: "hse.working-at-height",
    label: "Working at Height",
    description: "Assessment zone-based untuk aktivitas person pada area elevasi atau bekerja di ketinggian.",
  },
];

const OPERATIONS_MODULE_OPTIONS: Array<{
  key: OperationsModuleKey;
  label: string;
  description: string;
  setupPath: string;
  engineStatus: "active" | "planned";
}> = [
  {
    key: "operations.red-light-violation",
    label: "Red Light Violation",
    description: "Setup detector kendaraan, status lampu, dan stop line untuk persimpangan tambang.",
    setupPath: "/red-light-violation-setup",
    engineStatus: "active",
  },
  {
    key: "operations.dump-truck-bed-open",
    label: "Dump Truck Bed Open",
    description: "Setup detector dump truck, state bak, dan rule bak terbuka saat kendaraan bergerak.",
    setupPath: "/dump-truck-bed-open-setup",
    engineStatus: "active",
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

const buildLegacyNoLifeVestFindings = (
  source: MediaSource | null,
  analysisSummary: NoLifeVestAnalysisSummary | null
): AnalysisFinding[] => {
  if (!source || !analysisSummary) return [];
  const createdAt =
    "createdAt" in analysisSummary && analysisSummary.createdAt
      ? analysisSummary.createdAt
      : new Date().toISOString();
  return analysisSummary.events.map((event: NoLifeVestAnalysisEvent) => {
    const durationSeconds = Math.max(0, event.end_time_seconds - event.start_time_seconds);
    const severity = event.max_confidence >= 0.8 ? "high" : "medium";
    return {
      id: `finding-${event.event_id}`,
      runId: `legacy-ppe-life-vest-${source.id}`,
      sourceId: source.id,
      sourceName: source.name,
      sourceLocation: source.location,
      sourceType: source.type,
      category: "PPE",
      moduleKey: "ppe.no-life-vest",
      findingType: "missing-life-vest",
      title: "Pekerja tanpa pelampung terdeteksi",
      detail: `Detector menemukan event no life vest pada track ${event.track_id} di ROI ${event.roi_id}.`,
      recommendation: "Verifikasi visual di lapangan dan tindak lanjuti pelanggaran pelampung berulang.",
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
      requiredPpe: ["life vest"],
      trackIds: [event.track_id],
      labels: ["person", "life-vest", "no-life-vest"],
      snapshotUrl: event.snapshotUrl || null,
      evidenceUrls: event.snapshotUrl ? [event.snapshotUrl] : [],
      detectorEvidence: {
        analysisType: "no_life_vest",
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

const buildLegacyWorkingAtHeightFindings = (
  source: MediaSource | null,
  analysisSummary: WorkingAtHeightAnalysisSummary | null
): AnalysisFinding[] => {
  if (!source || !analysisSummary) return [];
  const createdAt =
    "createdAt" in analysisSummary && analysisSummary.createdAt
      ? analysisSummary.createdAt
      : new Date().toISOString();
  return analysisSummary.events.map((event: WorkingAtHeightAnalysisEvent) => {
    const durationSeconds = Math.max(0, event.end_time_seconds - event.start_time_seconds);
    const severity = durationSeconds >= 5 ? "high" : "medium";
    return {
      id: `finding-${event.event_id}`,
      runId: `legacy-hse-working-height-${source.id}`,
      sourceId: source.id,
      sourceName: source.name,
      sourceLocation: source.location,
      sourceType: source.type,
      category: "HSE",
      moduleKey: "hse.working-at-height",
      findingType: "working-at-height",
      title: "Aktivitas bekerja di ketinggian terdeteksi",
      detail: `Detector menemukan event working at height pada track ${event.track_id} di zone ${event.roi_id}.`,
      recommendation: "Verifikasi visual di lapangan, pastikan akses area elevasi sah, dan cek kepatuhan APD wajib untuk pekerjaan di ketinggian.",
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
      zoneIds: [event.roi_id],
      requiredPpe: ["helmet", "safety vest", "safety harness"],
      trackIds: [event.track_id],
      labels: ["person", "working-at-height"],
      snapshotUrl: event.snapshotUrl || null,
      evidenceUrls: event.snapshotUrl ? [event.snapshotUrl] : [],
      detectorEvidence: {
        analysisType: "working_at_height",
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

const buildLegacyRedLightViolationFindings = (
  source: MediaSource | null,
  analysisSummary: RedLightViolationAnalysisSummary | null
): AnalysisFinding[] => {
  if (!source || !analysisSummary) return [];
  const createdAt =
    "createdAt" in analysisSummary && analysisSummary.createdAt
      ? analysisSummary.createdAt
      : new Date().toISOString();
  return analysisSummary.events.map((event: RedLightViolationAnalysisEvent) => {
    const durationSeconds = Math.max(0, event.end_time_seconds - event.start_time_seconds);
    const isUncertain = event.status === "uncertain";
    return {
      id: `finding-${event.event_id}`,
      runId: `legacy-operations-red-light-${source.id}`,
      sourceId: source.id,
      sourceName: source.name,
      sourceLocation: source.location,
      sourceType: source.type,
      category: "Operations",
      moduleKey: "operations.red-light-violation",
      findingType: "red-light-violation",
      title: isUncertain
        ? "Indikasi pelanggaran lampu merah perlu verifikasi"
        : "Kendaraan melintasi saat lampu merah",
      detail: `Detector menemukan crossing event pada track ${event.track_id} di intersection ${event.roi_id}.`,
      recommendation: isUncertain
        ? "Verifikasi visual pada stop line dan status lampu sebelum temuan ini dijadikan pelanggaran final."
        : "Verifikasi crossing kendaraan, audit kepatuhan persimpangan, dan tindak lanjuti pelanggaran berulang.",
      severity: durationSeconds >= 2 ? "high" : "medium",
      status: isUncertain ? "uncertain" : "open",
      riskScore: Math.round(event.max_confidence * 100),
      metric: `${durationSeconds.toFixed(1)} s • conf ${event.max_confidence.toFixed(2)}`,
      eventCount: isUncertain ? 0 : 1,
      violatorCount: isUncertain ? 0 : 1,
      startsAtSeconds: event.start_time_seconds,
      endsAtSeconds: event.end_time_seconds,
      durationSeconds,
      roiId: event.roi_id,
      zoneIds: [event.roi_id],
      requiredPpe: [],
      trackIds: [event.track_id],
      labels: ["vehicle", "red-light", "green-light"],
      snapshotUrl: event.snapshotUrl || null,
      evidenceUrls: event.snapshotUrl ? [event.snapshotUrl] : [],
      detectorEvidence: {
        analysisType: "red_light_violation",
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

const buildLegacyDumpTruckBedOpenFindings = (
  source: MediaSource | null,
  analysisSummary: DumpTruckBedOpenAnalysisSummary | null
): AnalysisFinding[] => {
  if (!source || !analysisSummary) return [];
  const createdAt =
    "createdAt" in analysisSummary && analysisSummary.createdAt
      ? analysisSummary.createdAt
      : new Date().toISOString();
  return analysisSummary.events.map((event: DumpTruckBedOpenAnalysisEvent) => {
    const durationSeconds = Math.max(0, event.end_time_seconds - event.start_time_seconds);
    const isUncertain = event.status === "uncertain";
    return {
      id: `finding-${event.event_id}`,
      runId: `legacy-operations-dump-truck-${source.id}`,
      sourceId: source.id,
      sourceName: source.name,
      sourceLocation: source.location,
      sourceType: source.type,
      category: "Operations",
      moduleKey: "operations.dump-truck-bed-open",
      findingType: "dump-truck-bed-open",
      title: isUncertain
        ? "Indikasi dump truck bak terbuka perlu verifikasi"
        : "Dump truck bergerak dengan bak terbuka",
      detail: `Detector menemukan event dump truck bed open pada track ${event.track_id} di area ${event.roi_id}.`,
      recommendation: isUncertain
        ? "Verifikasi visual state bak dump truck sebelum temuan ini dijadikan pelanggaran final."
        : "Verifikasi visual dump truck yang bergerak dengan bak masih terbuka dan tindak lanjuti pelanggaran operasional hauling road.",
      severity: durationSeconds >= 2 ? "high" : "medium",
      status: isUncertain ? "uncertain" : "open",
      riskScore: Math.round(event.max_confidence * 100),
      metric: `${durationSeconds.toFixed(1)} s • conf ${event.max_confidence.toFixed(2)}`,
      eventCount: isUncertain ? 0 : 1,
      violatorCount: isUncertain ? 0 : 1,
      startsAtSeconds: event.start_time_seconds,
      endsAtSeconds: event.end_time_seconds,
      durationSeconds,
      roiId: event.roi_id,
      zoneIds: [event.roi_id],
      requiredPpe: [],
      trackIds: [event.track_id],
      labels: ["dump-truck", "bed-open", "bed-closed"],
      snapshotUrl: event.snapshotUrl || null,
      evidenceUrls: event.snapshotUrl ? [event.snapshotUrl] : [],
      detectorEvidence: {
        analysisType: "dump_truck_bed_open",
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
  const [searchParams] = useSearchParams();
  const { data: mediaItems = [] } = useMediaRegistry();
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const lastAppliedSourceIdRef = useRef<string | null>(null);
  const terminalJobToastRef = useRef<string | null>(null);
  const processedTerminalJobRef = useRef<string | null>(null);
  const autoRefreshedHseKeyRef = useRef<string | null>(null);
  const pendingHseModulesRef = useRef<HseModuleKey[]>([]);
  const pendingOperationsModulesRef = useRef<OperationsModuleKey[]>([]);
  const processedWorkingAtHeightJobRef = useRef<string | null>(null);
  const processedOperationsJobRef = useRef<string | null>(null);
  const savedNoHelmetConfig = readNoHelmetConfig();
  const savedNoSafetyVestConfig = readNoSafetyVestConfig();
  const savedNoLifeVestConfig = readNoLifeVestConfig();
  const savedWorkingAtHeightConfig = readWorkingAtHeightConfig();
  const savedRedLightConfig = readRedLightViolationConfig();
  const savedDumpTruckConfig = readDumpTruckBedOpenConfig();

  const [selectedRunCategories, setSelectedRunCategories] = useState<RunCategoryKey[]>([]);
  const [selectedPpeModules, setSelectedPpeModules] = useState<PpeModuleKey[]>(["ppe.no-helmet"]);
  const [selectedHseModules, setSelectedHseModules] = useState<HseModuleKey[]>([
    "hse.safety-rules",
    "hse.working-at-height",
  ]);
  const [selectedOperationsModules, setSelectedOperationsModules] = useState<OperationsModuleKey[]>([
    "operations.red-light-violation",
  ]);
  const [activePpeModule, setActivePpeModule] = useState<PpeModuleKey | null>(null);
  const [activeHseModule, setActiveHseModule] = useState<HseModuleKey | null>(null);
  const [activeOperationsModule, setActiveOperationsModule] = useState<OperationsModuleKey | null>(null);
  const [pendingPpeModules, setPendingPpeModules] = useState<PpeModuleKey[]>([]);
  const [pendingHseModules, setPendingHseModules] = useState<HseModuleKey[]>([]);
  const [pendingOperationsModules, setPendingOperationsModules] = useState<OperationsModuleKey[]>([]);
  const [analysisJob, setAnalysisJob] = useState<PpeAnalysisJob | null>(null);
  const [operationsJob, setOperationsJob] = useState<OperationsAnalysisJob | null>(null);
  const [summary, setSummary] = useState<NoHelmetAnalysisSummary | null>(null);
  const [noSafetyVestSummary, setNoSafetyVestSummary] = useState<NoSafetyVestAnalysisSummary | null>(null);
  const [noLifeVestSummary, setNoLifeVestSummary] = useState<NoLifeVestAnalysisSummary | null>(null);
  const [workingAtHeightJob, setWorkingAtHeightJob] = useState<WorkingAtHeightAnalysisJob | null>(null);
  const [workingAtHeightSummary, setWorkingAtHeightSummary] = useState<WorkingAtHeightAnalysisSummary | null>(null);
  const [redLightSummary, setRedLightSummary] = useState<RedLightViolationAnalysisSummary | null>(null);
  const [dumpTruckSummary, setDumpTruckSummary] = useState<DumpTruckBedOpenAnalysisSummary | null>(null);
  const [hseReport, setHseReport] = useState<HseSafetyRulesReport | null>(null);
  const [aiAssistEnabled, setAiAssistEnabled] = useState(false);
  const [aiNeedsReviewResults, setAiNeedsReviewResults] = useState<Record<string, NeedsReviewAiVerdict>>({});
  const [aiIncidentSummaries, setAiIncidentSummaries] = useState<Record<string, OperatorIncidentAiSummary>>({});
  const [aiVerifyingFindingIds, setAiVerifyingFindingIds] = useState<Record<string, boolean>>({});
  const [aiSummarizingFindingIds, setAiSummarizingFindingIds] = useState<Record<string, boolean>>({});
  const [aiHseNarrative, setAiHseNarrative] = useState("");
  const [isGeneratingAiHseNarrative, setIsGeneratingAiHseNarrative] = useState(false);
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
  const [noLifeVestServerDefaults, setNoLifeVestServerDefaults] = useState<{
    defaultModelPath: string;
    defaultRoiConfigPath: string;
    analysisOutputRoot: string;
  } | null>(null);
  const [workingAtHeightServerDefaults, setWorkingAtHeightServerDefaults] = useState<{
    defaultModelPath: string;
    defaultZoneConfigPath: string;
    analysisOutputRoot: string;
  } | null>(null);
  const [redLightServerDefaults, setRedLightServerDefaults] = useState<{
    defaultVehicleModelPath: string;
    defaultTrafficLightModelPath: string;
    defaultStopLineConfigPath: string;
    analysisOutputRoot: string;
  } | null>(null);
  const [dumpTruckServerDefaults, setDumpTruckServerDefaults] = useState<{
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
  const [sourceFileMissing, setSourceFileMissing] = useState(false);
  const [hasSessionResults, setHasSessionResults] = useState(false);
  const [isHelmetConfigOpen, setIsHelmetConfigOpen] = useState(false);
  const [isVestConfigOpen, setIsVestConfigOpen] = useState(false);
  const [isLifeVestConfigOpen, setIsLifeVestConfigOpen] = useState(false);
  const [isWorkingAtHeightConfigOpen, setIsWorkingAtHeightConfigOpen] = useState(false);
  const [isRedLightConfigOpen, setIsRedLightConfigOpen] = useState(false);
  const [isDumpTruckConfigOpen, setIsDumpTruckConfigOpen] = useState(false);
  const [activeAreaEditorKey, setActiveAreaEditorKey] = useState<AreaEditorModuleKey>("ppe.no-helmet");
  const [helmetAreaPoints, setHelmetAreaPoints] = useState<RoiPoint[]>(DEFAULT_ROI_POINTS);
  const [vestAreaPoints, setVestAreaPoints] = useState<RoiPoint[]>(DEFAULT_ROI_POINTS);
  const [lifeVestAreaPoints, setLifeVestAreaPoints] = useState<RoiPoint[]>(DEFAULT_ROI_POINTS);
  const [workingAtHeightAreaPoints, setWorkingAtHeightAreaPoints] = useState<RoiPoint[]>(DEFAULT_ROI_POINTS);
  const [redLightAreaPoints, setRedLightAreaPoints] = useState<RoiPoint[]>(DEFAULT_ROI_POINTS);
  const [dumpTruckAreaPoints, setDumpTruckAreaPoints] = useState<RoiPoint[]>(DEFAULT_ROI_POINTS);
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
  const [vestFormState, setVestFormState] = useState({
    modelPath: savedNoSafetyVestConfig.modelPath,
    roiConfigPath: savedNoSafetyVestConfig.roiConfigPath,
    roiId: savedNoSafetyVestConfig.roiId,
    confidenceThreshold: savedNoSafetyVestConfig.confidenceThreshold,
    iouThreshold: savedNoSafetyVestConfig.iouThreshold,
    violationOnFrames: savedNoSafetyVestConfig.violationOnFrames,
    cleanOffFrames: savedNoSafetyVestConfig.cleanOffFrames,
    frameStep: savedNoSafetyVestConfig.frameStep,
    imageSize: savedNoSafetyVestConfig.imageSize,
    vestLabels: savedNoSafetyVestConfig.vestLabels,
    violationLabels: savedNoSafetyVestConfig.violationLabels,
  });
  const [lifeVestFormState, setLifeVestFormState] = useState({
    modelPath: savedNoLifeVestConfig.modelPath,
    roiConfigPath: savedNoLifeVestConfig.roiConfigPath,
    roiId: savedNoLifeVestConfig.roiId,
    confidenceThreshold: savedNoLifeVestConfig.confidenceThreshold,
    iouThreshold: savedNoLifeVestConfig.iouThreshold,
    violationOnFrames: savedNoLifeVestConfig.violationOnFrames,
    cleanOffFrames: savedNoLifeVestConfig.cleanOffFrames,
    frameStep: savedNoLifeVestConfig.frameStep,
    imageSize: savedNoLifeVestConfig.imageSize,
    lifeVestLabels: savedNoLifeVestConfig.lifeVestLabels,
    violationLabels: savedNoLifeVestConfig.violationLabels,
  });
  const [workingAtHeightFormState, setWorkingAtHeightFormState] = useState({
    modelPath: savedWorkingAtHeightConfig.modelPath,
    zoneConfigPath: savedWorkingAtHeightConfig.zoneConfigPath,
    zoneId: savedWorkingAtHeightConfig.zoneId,
    confidenceThreshold: savedWorkingAtHeightConfig.confidenceThreshold,
    iouThreshold: savedWorkingAtHeightConfig.iouThreshold,
    frameStep: savedWorkingAtHeightConfig.frameStep,
    imageSize: savedWorkingAtHeightConfig.imageSize,
    personLabels: savedWorkingAtHeightConfig.personLabels,
    minimumPresenceSeconds: savedWorkingAtHeightConfig.minimumPresenceSeconds,
    requiredPpeAtHeight: savedWorkingAtHeightConfig.requiredPpeAtHeight,
    alertCooldownSeconds: savedWorkingAtHeightConfig.alertCooldownSeconds,
    operationalNotes: savedWorkingAtHeightConfig.operationalNotes,
  });
  const [redLightFormState, setRedLightFormState] = useState({
    vehicleModelPath: savedRedLightConfig.vehicleModelPath,
    trafficLightModelPath: savedRedLightConfig.trafficLightModelPath,
    intersectionId: savedRedLightConfig.intersectionId,
    stopLineConfigPath: savedRedLightConfig.stopLineConfigPath,
    vehicleLabels: savedRedLightConfig.vehicleLabels,
    redLightLabels: savedRedLightConfig.redLightLabels,
    greenLightLabels: savedRedLightConfig.greenLightLabels,
    confidenceThreshold: savedRedLightConfig.confidenceThreshold,
    iouThreshold: savedRedLightConfig.iouThreshold,
    frameStep: savedRedLightConfig.frameStep,
    imageSize: savedRedLightConfig.imageSize,
    crossingWindowSeconds: savedRedLightConfig.crossingWindowSeconds,
  });
  const [dumpTruckFormState, setDumpTruckFormState] = useState({
    modelPath: savedDumpTruckConfig.modelPath,
    roiConfigPath: savedDumpTruckConfig.roiConfigPath,
    roiId: savedDumpTruckConfig.roiId,
    truckLabels: savedDumpTruckConfig.truckLabels,
    bedOpenLabels: savedDumpTruckConfig.bedOpenLabels,
    bedClosedLabels: savedDumpTruckConfig.bedClosedLabels,
    confidenceThreshold: savedDumpTruckConfig.confidenceThreshold,
    iouThreshold: savedDumpTruckConfig.iouThreshold,
    frameStep: savedDumpTruckConfig.frameStep,
    imageSize: savedDumpTruckConfig.imageSize,
    movementThreshold: savedDumpTruckConfig.movementThreshold,
    minimumMovingSeconds: savedDumpTruckConfig.minimumMovingSeconds,
  });

  const selectedSourceId = searchParams.get("sourceId");
  const selectedSource = useMemo(
    () => mediaItems.find((item) => item.id === selectedSourceId) || null,
    [mediaItems, selectedSourceId]
  );
  const sourceSupportsPpe = selectedSource?.analytics.includes("PPE") ?? false;
  const sourceSupportsHse = selectedSource?.analytics.includes("HSE") ?? false;
  const sourceSupportsOperations = selectedSource?.analytics.includes("Operations") ?? false;
  useEffect(() => {
    let mounted = true;
    const loadAiAssistConfig = async () => {
      try {
        const response = await getAiAssistConfig();
        if (!mounted) return;
        setAiAssistEnabled(response.config.enabled);
      } catch (_error) {
        if (!mounted) return;
        setAiAssistEnabled(false);
      }
    };

    void loadAiAssistConfig();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setAiNeedsReviewResults({});
    setAiIncidentSummaries({});
    setAiHseNarrative("");
    setAiVerifyingFindingIds({});
    setAiSummarizingFindingIds({});
  }, [selectedSourceId, hasSessionResults]);
  const supportedRunCategoryOptions = useMemo(
    () =>
      RUN_CATEGORY_OPTIONS.filter((option) =>
        selectedSource ? selectedSource.analytics.includes(option.key) : false
      ),
    [selectedSource]
  );
  const areaEditorTabs = useMemo(() => {
    const items: Array<{ key: AreaEditorModuleKey; label: string }> = [];
    if (selectedRunCategories.includes("PPE")) {
      if (selectedPpeModules.includes("ppe.no-helmet")) {
        items.push({ key: "ppe.no-helmet", label: "Helmet" });
      }
      if (selectedPpeModules.includes("ppe.no-safety-vest")) {
        items.push({ key: "ppe.no-safety-vest", label: "Safety Vest" });
      }
      if (selectedPpeModules.includes("ppe.no-life-vest")) {
        items.push({ key: "ppe.no-life-vest", label: "Life Vest" });
      }
    }
    if (selectedRunCategories.includes("HSE") && selectedHseModules.includes("hse.working-at-height")) {
      items.push({ key: "hse.working-at-height", label: "Working at Height" });
    }
    if (selectedRunCategories.includes("Operations")) {
      if (selectedOperationsModules.includes("operations.red-light-violation")) {
        items.push({ key: "operations.red-light-violation", label: "Red Light" });
      }
      if (selectedOperationsModules.includes("operations.dump-truck-bed-open")) {
        items.push({ key: "operations.dump-truck-bed-open", label: "Dump Truck" });
      }
    }
    return items;
  }, [selectedHseModules, selectedOperationsModules, selectedPpeModules, selectedRunCategories]);
  const currentAreaPoints = useMemo(() => {
    switch (activeAreaEditorKey) {
      case "ppe.no-safety-vest":
        return vestAreaPoints;
      case "ppe.no-life-vest":
        return lifeVestAreaPoints;
      case "hse.working-at-height":
        return workingAtHeightAreaPoints;
      case "operations.red-light-violation":
        return redLightAreaPoints;
      case "operations.dump-truck-bed-open":
        return dumpTruckAreaPoints;
      case "ppe.no-helmet":
      default:
        return helmetAreaPoints;
    }
  }, [
    activeAreaEditorKey,
    dumpTruckAreaPoints,
    helmetAreaPoints,
    lifeVestAreaPoints,
    redLightAreaPoints,
    vestAreaPoints,
    workingAtHeightAreaPoints,
  ]);
  const setCurrentAreaPoints = (updater: RoiPoint[] | ((current: RoiPoint[]) => RoiPoint[])) => {
    const resolve = (current: RoiPoint[]) =>
      typeof updater === "function" ? (updater as (current: RoiPoint[]) => RoiPoint[])(current) : updater;
    switch (activeAreaEditorKey) {
      case "ppe.no-safety-vest":
        setVestAreaPoints((current) => resolve(current));
        return;
      case "ppe.no-life-vest":
        setLifeVestAreaPoints((current) => resolve(current));
        return;
      case "hse.working-at-height":
        setWorkingAtHeightAreaPoints((current) => resolve(current));
        return;
      case "operations.red-light-violation":
        setRedLightAreaPoints((current) => resolve(current));
        return;
      case "operations.dump-truck-bed-open":
        setDumpTruckAreaPoints((current) => resolve(current));
        return;
      case "ppe.no-helmet":
      default:
        setHelmetAreaPoints((current) => resolve(current));
    }
  };
  const hasValidHelmetArea = helmetAreaPoints.length >= 3;
  const hasValidVestArea = vestAreaPoints.length >= 3;
  const hasValidLifeVestArea = lifeVestAreaPoints.length >= 3;
  const hasValidWorkingAtHeightArea = workingAtHeightAreaPoints.length >= 3;
  const hasValidRedLightArea = redLightAreaPoints.length >= 3;
  const hasValidDumpTruckArea = dumpTruckAreaPoints.length >= 3;
  const hasValidCurrentArea = currentAreaPoints.length >= 3;
  const hasHelmetCustomRoiPath = formState.roiConfigPath.trim().length > 0;
  const hasVestCustomRoiPath = vestFormState.roiConfigPath.trim().length > 0;
  const hasLifeVestCustomRoiPath = lifeVestFormState.roiConfigPath.trim().length > 0;
  const hasWorkingAtHeightCustomZonePath = workingAtHeightFormState.zoneConfigPath.trim().length > 0;
  const hasRedLightCustomStopLinePath = redLightFormState.stopLineConfigPath.trim().length > 0;
  const hasDumpTruckCustomRoiPath = dumpTruckFormState.roiConfigPath.trim().length > 0;
  const hasRelevantAreaOverride = useMemo(() => {
    switch (activeAreaEditorKey) {
      case "ppe.no-safety-vest":
        return hasVestCustomRoiPath;
      case "ppe.no-life-vest":
        return hasLifeVestCustomRoiPath;
      case "hse.working-at-height":
        return hasWorkingAtHeightCustomZonePath;
      case "operations.red-light-violation":
        return hasRedLightCustomStopLinePath;
      case "operations.dump-truck-bed-open":
        return hasDumpTruckCustomRoiPath;
      case "ppe.no-helmet":
      default:
        return hasHelmetCustomRoiPath;
    }
  }, [
    activeAreaEditorKey,
    hasDumpTruckCustomRoiPath,
    hasHelmetCustomRoiPath,
    hasLifeVestCustomRoiPath,
    hasRedLightCustomStopLinePath,
    hasVestCustomRoiPath,
    hasWorkingAtHeightCustomZonePath,
  ]);
  const canRunNoHelmet =
    Boolean(selectedSource) &&
    sourceSupportsPpe &&
    formState.videoPath.trim().length > 0 &&
    formState.modelPath.trim().length > 0 &&
    (hasValidHelmetArea || hasHelmetCustomRoiPath);
  const canRunNoSafetyVest =
    Boolean(selectedSource) &&
    sourceSupportsPpe &&
    formState.videoPath.trim().length > 0 &&
    vestFormState.modelPath.trim().length > 0 &&
    (hasValidVestArea || hasVestCustomRoiPath);
  const canRunNoLifeVest =
    Boolean(selectedSource) &&
    sourceSupportsPpe &&
    formState.videoPath.trim().length > 0 &&
    lifeVestFormState.modelPath.trim().length > 0 &&
    (hasValidLifeVestArea || hasLifeVestCustomRoiPath);
  const canRunWorkingAtHeight =
    Boolean(selectedSource) &&
    sourceSupportsHse &&
    formState.videoPath.trim().length > 0 &&
    workingAtHeightFormState.modelPath.trim().length > 0 &&
    (hasValidWorkingAtHeightArea || hasWorkingAtHeightCustomZonePath);
  const canRunRedLightViolation =
    Boolean(selectedSource) &&
    sourceSupportsOperations &&
    formState.videoPath.trim().length > 0 &&
    redLightFormState.vehicleModelPath.trim().length > 0 &&
    redLightFormState.trafficLightModelPath.trim().length > 0 &&
    (hasValidRedLightArea || hasRedLightCustomStopLinePath);
  const canRunDumpTruckBedOpen =
    Boolean(selectedSource) &&
    sourceSupportsOperations &&
    formState.videoPath.trim().length > 0 &&
    dumpTruckFormState.modelPath.trim().length > 0 &&
    (hasValidDumpTruckArea || hasDumpTruckCustomRoiPath);
  const canRunPpe = selectedPpeModules.every((moduleKey) =>
    moduleKey === "ppe.no-safety-vest"
      ? canRunNoSafetyVest
      : moduleKey === "ppe.no-life-vest"
        ? canRunNoLifeVest
        : canRunNoHelmet
  );
  const canRunHse = selectedHseModules.every((moduleKey) =>
    moduleKey === "hse.working-at-height"
      ? canRunWorkingAtHeight
      : Boolean(selectedSource) && sourceSupportsHse
  );
  const canRunOperations = selectedOperationsModules.every((moduleKey) =>
    moduleKey === "operations.red-light-violation"
      ? canRunRedLightViolation
      : moduleKey === "operations.dump-truck-bed-open"
        ? canRunDumpTruckBedOpen
        : false
  );
  const hasSelectedPpeModule = selectedPpeModules.length > 0;
  const hasSelectedHseModule = selectedHseModules.length > 0;
  const hasSelectedOperationsModule = selectedOperationsModules.length > 0;
  const hasSupportedSelection = selectedRunCategories.some((category) =>
    category === "PPE"
      ? canRunPpe && hasSelectedPpeModule
      : category === "HSE"
        ? canRunHse && hasSelectedHseModule
        : category === "Operations"
          ? canRunOperations && hasSelectedOperationsModule
        : false
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
    if (noLifeVestSummary) {
      return (
        noLifeVestSummary.global_summary ??
        buildClientGlobalSummary(noLifeVestSummary.events as unknown as NoHelmetAnalysisEvent[])
      );
    }
    if (workingAtHeightSummary) {
      return (
        workingAtHeightSummary.global_summary ??
        buildClientGlobalSummary(workingAtHeightSummary.events as unknown as NoHelmetAnalysisEvent[])
      );
    }
    if (redLightSummary) {
      return (
        redLightSummary.global_summary ??
        buildClientGlobalSummary(redLightSummary.events as unknown as NoHelmetAnalysisEvent[])
      );
    }
    if (dumpTruckSummary) {
      return (
        dumpTruckSummary.global_summary ??
        buildClientGlobalSummary(dumpTruckSummary.events as unknown as NoHelmetAnalysisEvent[])
      );
    }
    return null;
  }, [dumpTruckSummary, noLifeVestSummary, noSafetyVestSummary, redLightSummary, summary, workingAtHeightSummary]);
  const latestPpeEvidenceAt = useMemo(() => {
    return Math.max(
      toTimestamp(summary?.createdAt),
      toTimestamp(noSafetyVestSummary?.createdAt),
      toTimestamp(noLifeVestSummary?.createdAt)
    );
  }, [noLifeVestSummary?.createdAt, noSafetyVestSummary?.createdAt, summary?.createdAt]);
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
    const lifeVestFindings =
      noLifeVestSummary?.analysisFindings && noLifeVestSummary.analysisFindings.length > 0
        ? noLifeVestSummary.analysisFindings
        : buildLegacyNoLifeVestFindings(selectedSource, noLifeVestSummary);
    const workingAtHeightFindings =
      workingAtHeightSummary?.analysisFindings && workingAtHeightSummary.analysisFindings.length > 0
        ? workingAtHeightSummary.analysisFindings
        : buildLegacyWorkingAtHeightFindings(selectedSource, workingAtHeightSummary);
    const redLightFindings =
      redLightSummary?.analysisFindings && redLightSummary.analysisFindings.length > 0
        ? redLightSummary.analysisFindings
        : buildLegacyRedLightViolationFindings(selectedSource, redLightSummary);
    const dumpTruckFindings =
      dumpTruckSummary?.analysisFindings && dumpTruckSummary.analysisFindings.length > 0
        ? dumpTruckSummary.analysisFindings
        : buildLegacyDumpTruckBedOpenFindings(selectedSource, dumpTruckSummary);
    const hseFindings = isHseReportStale
      ? []
      : hseReport?.analysisFindings && hseReport.analysisFindings.length > 0
        ? hseReport.analysisFindings
        : buildLegacyHseFindings(selectedSource, hseReport);

    return [...helmetFindings, ...vestFindings, ...lifeVestFindings, ...workingAtHeightFindings, ...redLightFindings, ...dumpTruckFindings, ...hseFindings].sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    );
  }, [dumpTruckSummary, hseReport, isHseReportStale, noLifeVestSummary, noSafetyVestSummary, redLightSummary, selectedSource, summary, workingAtHeightSummary]);
  const reviewFindings = useMemo(
    () => unifiedFindings.filter((finding) => finding.status === "uncertain"),
    [unifiedFindings]
  );
  const groupedReviewFindings = useMemo(() => {
    const grouped = new Map<string, AnalysisFinding[]>();

    reviewFindings.forEach((finding) => {
      const trackKey =
        finding.trackIds.length > 0 ? finding.trackIds.join("-") : `finding-${finding.id}`;
      const roiKey = finding.roiId || "no-roi";
      const key = `${finding.moduleKey}::${trackKey}::${roiKey}`;
      const current = grouped.get(key) || [];
      current.push(finding);
      grouped.set(key, current);
    });

    return Array.from(grouped.values())
      .map((items) => {
        const representative = [...items].sort((left, right) => {
          const durationDiff = (right.durationSeconds || 0) - (left.durationSeconds || 0);
          if (durationDiff !== 0) {
            return durationDiff;
          }
          return (right.riskScore || 0) - (left.riskScore || 0);
        })[0];
        if (!representative) {
          return null;
        }

        const mergedCount = items.length;
        const maxDuration = Math.max(...items.map((item) => item.durationSeconds || 0));
        const maxConfidence = Math.max(
          ...items.map((item) => Number(item.metadata?.maxConfidence || 0))
        );
        const latestCreatedAt = [...items]
          .map((item) => item.createdAt)
          .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];
        const trackLabel =
          representative.trackIds.length > 0
            ? `track ${representative.trackIds.join(", ")}`
            : "track tidak diketahui";

        return {
          ...representative,
          id: `${representative.id}-grouped`,
          title: representative.title,
          detail:
            mergedCount > 1
              ? `${representative.detail} Sistem menggabungkan ${mergedCount} indikasi ambigu dari ${trackLabel} pada sesi ini ke satu item review.`
              : representative.detail,
          metric: `${maxDuration.toFixed(1)} s • conf ${maxConfidence.toFixed(2)}`,
          eventCount: 0,
          violatorCount: 0,
          createdAt: latestCreatedAt || representative.createdAt,
          updatedAt: latestCreatedAt || representative.updatedAt,
          metadata: {
            ...representative.metadata,
            mergedReviewCount: mergedCount,
          },
        } satisfies AnalysisFinding;
      })
      .filter((item): item is AnalysisFinding => Boolean(item))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }, [reviewFindings]);
  const finalFindings = useMemo(
    () => unifiedFindings.filter((finding) => finding.status !== "uncertain"),
    [unifiedFindings]
  );
  const unifiedSummary = useMemo(() => buildFindingsAggregate(unifiedFindings), [unifiedFindings]);
  const activePpeModuleLabel =
    activePpeModule === "ppe.no-safety-vest"
      ? "PPE • No Safety Vest"
      : activePpeModule === "ppe.no-life-vest"
        ? "PPE • No Life Vest"
        : "PPE • No Helmet";
  const activeHseModuleLabel =
    activeHseModule === "hse.working-at-height"
      ? "HSE • Working at Height"
      : activeHseModule === "hse.safety-rules"
        ? "HSE • Safety Rules"
        : "--";
  const activeOperationsModuleLabel =
    activeOperationsModule === "operations.red-light-violation"
      ? "Operations • Red Light Violation"
      : activeOperationsModule === "operations.dump-truck-bed-open"
        ? "Operations • Dump Truck Bed Open"
        : "--";
  const activeRunModuleLabel = activePpeModule
    ? activePpeModuleLabel
    : activeHseModule
      ? activeHseModuleLabel
      : activeOperationsModuleLabel;
  const areaEditorContext = useMemo(() => {
    switch (activeAreaEditorKey) {
      case "ppe.no-safety-vest":
        return {
          title: "Area Analisis Safety Vest",
          readyLabel: "Editor area safety vest siap",
          overrideLabel: "File area safety vest override aktif",
          missingLabel: "Area safety vest belum valid",
          instruction:
            "Gunakan editor ini untuk membatasi area pengamatan rompi keselamatan agar deteksi fokus pada area kerja yang relevan.",
        };
      case "ppe.no-life-vest":
        return {
          title: "Area Analisis Life Vest",
          readyLabel: "Editor area life vest siap",
          overrideLabel: "File area life vest override aktif",
          missingLabel: "Area life vest belum valid",
          instruction:
            "Gunakan editor ini untuk membatasi area pengamatan pelampung agar modul life vest fokus pada area air atau tepi perairan yang relevan.",
        };
      case "hse.working-at-height":
        return {
          title: "Zona Ketinggian",
          readyLabel: "Editor zona ketinggian siap",
          overrideLabel: "File zona ketinggian override aktif",
          missingLabel: "Zona ketinggian belum valid",
          instruction:
            "Gunakan editor ini untuk menggambar area kerja di ketinggian yang akan dipantau oleh modul Working at Height.",
        };
      case "operations.red-light-violation":
        return {
          title: "Stop Line & Area Persimpangan",
          readyLabel: "Editor stop line siap",
          overrideLabel: "File stop line override aktif",
          missingLabel: "Stop line belum valid",
          instruction:
            "Gunakan editor ini untuk menandai garis atau area crossing yang dipakai modul Red Light Violation.",
        };
      case "operations.dump-truck-bed-open":
        return {
          title: "Area Analisis Dump Truck",
          readyLabel: "Editor area dump truck siap",
          overrideLabel: "File area dump truck override aktif",
          missingLabel: "Area dump truck belum valid",
          instruction:
            "Gunakan editor ini untuk membatasi area pantau dump truck agar analisis fokus ke jalur kendaraan yang relevan.",
        };
      case "ppe.no-helmet":
      default:
        return {
          title: "Area Analisis Helmet",
          readyLabel: "Editor area helmet siap",
          overrideLabel: "File area helmet override aktif",
          missingLabel: "Area helmet belum valid",
          instruction:
            "Gunakan editor ini untuk membatasi area pengamatan agar modul helmet hanya menganalisis area kerja yang relevan.",
        };
    }
  }, [activeAreaEditorKey]);
  const helmetConfigSummary = `Conf ${formState.confidenceThreshold} • Step ${formState.frameStep} • ImgSz ${formState.imageSize}`;
  const vestConfigSummary = `Conf ${vestFormState.confidenceThreshold} • Step ${vestFormState.frameStep} • ImgSz ${vestFormState.imageSize}`;
  const lifeVestConfigSummary = `Conf ${lifeVestFormState.confidenceThreshold} • Step ${lifeVestFormState.frameStep} • ImgSz ${lifeVestFormState.imageSize}`;
  const workingAtHeightConfigSummary = `Min ${workingAtHeightFormState.minimumPresenceSeconds}s • Step ${workingAtHeightFormState.frameStep} • ImgSz ${workingAtHeightFormState.imageSize}`;
  const redLightConfigSummary = `Conf ${redLightFormState.confidenceThreshold} • Step ${redLightFormState.frameStep} • ImgSz ${redLightFormState.imageSize}`;
  const dumpTruckConfigSummary = `Move ${dumpTruckFormState.movementThreshold} • Min ${dumpTruckFormState.minimumMovingSeconds}s • ImgSz ${dumpTruckFormState.imageSize}`;
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
  const snapshotItems: SnapshotLightboxItem[] = [...finalFindings, ...groupedReviewFindings]
    .filter((finding) => Boolean(finding.snapshotUrl))
    .map((finding) => ({
      id: finding.id,
      title: `${moduleKeyLabel[finding.moduleKey] || finding.moduleKey} • ${finding.title}${finding.status === "uncertain" ? " • Needs Review" : ""}`,
      url: finding.snapshotUrl as string,
    }));
  const sourceVideoUrl = useMemo(() => {
    if (!selectedSource) return null;
    if (selectedSource.type === "camera") {
      return selectedSource.source;
    }
    const trimmedVideoPath = formState.videoPath.trim();
    const analysisRoot = serverDefaults?.analysisOutputRoot?.replace(/\\/g, "/");
    const normalizedVideoPath = trimmedVideoPath.replace(/\\/g, "/");
    if (!analysisRoot || !normalizedVideoPath.startsWith(`${analysisRoot}/`)) {
      return null;
    }
    const relativePath = normalizedVideoPath.slice(analysisRoot.length + 1);
    const encodedPath = relativePath
      .split("/")
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return `${analysisServerBaseUrl}/analysis-output/${encodedPath}`;
  }, [formState.videoPath, selectedSource, serverDefaults?.analysisOutputRoot]);

  const setQueuedHseModules = (items: HseModuleKey[]) => {
    pendingHseModulesRef.current = items;
    setPendingHseModules(items);
  };

  const setQueuedOperationsModules = (items: OperationsModuleKey[]) => {
    pendingOperationsModulesRef.current = items;
    setPendingOperationsModules(items);
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
    getNoLifeVestDefaults()
      .then((defaults) => {
        if (ignore) return;
        setNoLifeVestServerDefaults({
          defaultModelPath: defaults.defaultModelPath,
          defaultRoiConfigPath: defaults.defaultRoiConfigPath,
          analysisOutputRoot: defaults.analysisOutputRoot,
        });
      })
      .catch((error) => {
        if (!ignore) {
          toast({
            title: "Default No Life Vest belum siap",
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
    getWorkingAtHeightDefaults()
      .then((defaults) => {
        if (ignore) return;
        setWorkingAtHeightServerDefaults({
          defaultModelPath: defaults.defaultModelPath,
          defaultZoneConfigPath: defaults.defaultZoneConfigPath,
          analysisOutputRoot: defaults.analysisOutputRoot,
        });
        setWorkingAtHeightFormState((current) => ({
          ...current,
          modelPath:
            !current.modelPath.trim() || isLegacyContainerModelPath(current.modelPath)
              ? defaults.defaultModelPath
              : current.modelPath,
        }));
      })
      .catch(() => {
        if (!ignore) {
          const fallbackModelPath =
            !savedWorkingAtHeightConfig.modelPath.trim() ||
            isLegacyContainerModelPath(savedWorkingAtHeightConfig.modelPath)
              ? serverDefaults?.defaultModelPath || savedWorkingAtHeightConfig.modelPath || ""
              : savedWorkingAtHeightConfig.modelPath;
          setWorkingAtHeightServerDefaults({
            defaultModelPath: fallbackModelPath,
            defaultZoneConfigPath: savedWorkingAtHeightConfig.zoneConfigPath || "",
            analysisOutputRoot: serverDefaults?.analysisOutputRoot || "",
          });
          setWorkingAtHeightFormState((current) => ({
            ...current,
            modelPath:
              !current.modelPath.trim() || isLegacyContainerModelPath(current.modelPath)
                ? fallbackModelPath
                : current.modelPath,
          }));
        }
      });

    return () => {
      ignore = true;
    };
  }, [savedWorkingAtHeightConfig.modelPath, savedWorkingAtHeightConfig.zoneConfigPath, serverDefaults?.analysisOutputRoot, serverDefaults?.defaultModelPath]);

  useEffect(() => {
    let ignore = false;
    getRedLightViolationDefaults()
      .then((defaults) => {
        if (ignore) return;
        setRedLightServerDefaults({
          defaultVehicleModelPath: defaults.defaultVehicleModelPath,
          defaultTrafficLightModelPath: defaults.defaultTrafficLightModelPath,
          defaultStopLineConfigPath: defaults.defaultStopLineConfigPath,
          analysisOutputRoot: defaults.analysisOutputRoot,
        });
        setRedLightFormState((current) => ({
          ...current,
          vehicleModelPath:
            !current.vehicleModelPath.trim() || isLegacyContainerModelPath(current.vehicleModelPath)
              ? defaults.defaultVehicleModelPath
              : current.vehicleModelPath,
          trafficLightModelPath:
            !current.trafficLightModelPath.trim() || isLegacyContainerModelPath(current.trafficLightModelPath)
              ? defaults.defaultTrafficLightModelPath
              : current.trafficLightModelPath,
          stopLineConfigPath:
            !current.stopLineConfigPath.trim() ? defaults.defaultStopLineConfigPath : current.stopLineConfigPath,
        }));
      })
      .catch(() => {
        if (!ignore) {
          setRedLightServerDefaults({
            defaultVehicleModelPath: savedRedLightConfig.vehicleModelPath,
            defaultTrafficLightModelPath: savedRedLightConfig.trafficLightModelPath,
            defaultStopLineConfigPath: savedRedLightConfig.stopLineConfigPath,
            analysisOutputRoot: serverDefaults?.analysisOutputRoot || "",
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, [
    savedRedLightConfig.stopLineConfigPath,
    savedRedLightConfig.trafficLightModelPath,
    savedRedLightConfig.vehicleModelPath,
    serverDefaults?.analysisOutputRoot,
  ]);

  useEffect(() => {
    let ignore = false;
    getDumpTruckBedOpenDefaults()
      .then((defaults) => {
        if (ignore) return;
        setDumpTruckServerDefaults({
          defaultModelPath: defaults.defaultModelPath,
          defaultRoiConfigPath: defaults.defaultRoiConfigPath,
          analysisOutputRoot: defaults.analysisOutputRoot,
        });
        setDumpTruckFormState((current) => ({
          ...current,
          modelPath:
            !current.modelPath.trim() || isLegacyContainerModelPath(current.modelPath)
              ? defaults.defaultModelPath
              : current.modelPath,
          roiConfigPath:
            !current.roiConfigPath.trim() ? defaults.defaultRoiConfigPath : current.roiConfigPath,
        }));
      })
      .catch(() => {
        if (!ignore) {
          setDumpTruckServerDefaults({
            defaultModelPath:
              !savedDumpTruckConfig.modelPath.trim() || isLegacyContainerModelPath(savedDumpTruckConfig.modelPath)
                ? serverDefaults?.defaultModelPath || savedDumpTruckConfig.modelPath || ""
                : savedDumpTruckConfig.modelPath,
            defaultRoiConfigPath: savedDumpTruckConfig.roiConfigPath || "",
            analysisOutputRoot: serverDefaults?.analysisOutputRoot || "",
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, [
    savedDumpTruckConfig.modelPath,
    savedDumpTruckConfig.roiConfigPath,
    serverDefaults?.analysisOutputRoot,
    serverDefaults?.defaultModelPath,
  ]);

  useEffect(() => {
    if (workingAtHeightServerDefaults?.defaultModelPath) {
      return;
    }
    if (!serverDefaults?.defaultModelPath) {
      return;
    }

    setWorkingAtHeightServerDefaults({
      defaultModelPath: serverDefaults.defaultModelPath,
      defaultZoneConfigPath: savedWorkingAtHeightConfig.zoneConfigPath || "",
      analysisOutputRoot: serverDefaults.analysisOutputRoot,
    });
    setWorkingAtHeightFormState((current) => ({
      ...current,
      modelPath:
        !current.modelPath.trim() || isLegacyContainerModelPath(current.modelPath)
          ? serverDefaults.defaultModelPath
          : current.modelPath,
    }));
  }, [savedWorkingAtHeightConfig.zoneConfigPath, serverDefaults?.analysisOutputRoot, serverDefaults?.defaultModelPath, workingAtHeightServerDefaults?.defaultModelPath]);

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
    if (areaEditorTabs.length === 0) {
      setActiveAreaEditorKey("ppe.no-helmet");
      return;
    }
    if (!areaEditorTabs.some((item) => item.key === activeAreaEditorKey)) {
      setActiveAreaEditorKey(areaEditorTabs[0].key);
    }
  }, [activeAreaEditorKey, areaEditorTabs]);

  useEffect(() => {
    if (!selectedSourceId) {
      lastAppliedSourceIdRef.current = null;
      setPreview(null);
      setFormState((current) => ({
        ...current,
        videoPath: "",
        roiConfigPath: "",
      }));
      setHelmetAreaPoints(DEFAULT_ROI_POINTS);
      setVestAreaPoints(DEFAULT_ROI_POINTS);
      setLifeVestAreaPoints(DEFAULT_ROI_POINTS);
      setWorkingAtHeightAreaPoints(DEFAULT_ROI_POINTS);
      setRedLightAreaPoints(DEFAULT_ROI_POINTS);
      setDumpTruckAreaPoints(DEFAULT_ROI_POINTS);
      setSelectedRunCategories([]);
      setSelectedPpeModules(["ppe.no-helmet"]);
      setSelectedHseModules(["hse.safety-rules", "hse.working-at-height"]);
      setSelectedOperationsModules(["operations.red-light-violation"]);
      setSummary(null);
      setNoSafetyVestSummary(null);
      setNoLifeVestSummary(null);
      setWorkingAtHeightSummary(null);
      setRedLightSummary(null);
      setDumpTruckSummary(null);
      setWorkingAtHeightJob(null);
      setOperationsJob(null);
      setHseReport(null);
      autoRefreshedHseKeyRef.current = null;
      setHasSessionResults(false);
      setQueuedHseModules([]);
      setQueuedOperationsModules([]);
      return;
    }

    if (!selectedSource) {
      return;
    }

    if (lastAppliedSourceIdRef.current !== selectedSource.id) {
      const nextRoiId = `${slugify(selectedSource.name) || selectedSource.id}-dashboard`;
      const nextVestRoiId = `${slugify(selectedSource.name) || selectedSource.id}-vest-dashboard`;
      const nextLifeVestRoiId = `${slugify(selectedSource.name) || selectedSource.id}-life-vest-dashboard`;
      const nextWorkingAtHeightZoneId = `${slugify(selectedSource.name) || selectedSource.id}-height-dashboard`;
      const nextIntersectionId = `${slugify(selectedSource.name) || selectedSource.id}-intersection`;
      const nextDumpTruckRoiId = `${slugify(selectedSource.name) || selectedSource.id}-dump-truck-dashboard`;
      setFormState((current) => ({
        ...current,
        videoPath: selectedSource.source,
        roiId: nextRoiId,
        roiConfigPath: "",
      }));
      setHelmetAreaPoints(DEFAULT_ROI_POINTS);
      setVestAreaPoints(DEFAULT_ROI_POINTS);
      setLifeVestAreaPoints(DEFAULT_ROI_POINTS);
      setWorkingAtHeightAreaPoints(DEFAULT_ROI_POINTS);
      setRedLightAreaPoints(DEFAULT_ROI_POINTS);
      setDumpTruckAreaPoints(DEFAULT_ROI_POINTS);
      setVestFormState((current) => ({
        ...current,
        roiId: nextVestRoiId,
        roiConfigPath: "",
      }));
      setLifeVestFormState((current) => ({
        ...current,
        roiId: nextLifeVestRoiId,
        roiConfigPath: "",
      }));
      setWorkingAtHeightFormState((current) => ({
        ...current,
        zoneId: nextWorkingAtHeightZoneId,
        zoneConfigPath: "",
      }));
      setRedLightFormState((current) => ({
        ...current,
        intersectionId: nextIntersectionId,
        stopLineConfigPath: "",
      }));
      setDumpTruckFormState((current) => ({
        ...current,
        roiId: nextDumpTruckRoiId,
        roiConfigPath: "",
      }));
      setPreview(null);
      setAnalysisJob(null);
      setWorkingAtHeightJob(null);
      setOperationsJob(null);
      setSummary(null);
      setNoSafetyVestSummary(null);
      setNoLifeVestSummary(null);
      setWorkingAtHeightSummary(null);
      setRedLightSummary(null);
      setDumpTruckSummary(null);
      setOutputDir("");
      setStdout("");
      setStderr("");
      setSourceFileMissing(false);
      setActivePpeModule(null);
      setActiveHseModule(null);
      setActiveOperationsModule(null);
      setPendingPpeModules([]);
      setQueuedHseModules([]);
      setQueuedOperationsModules([]);
      setHasSessionResults(false);
      processedTerminalJobRef.current = null;
      processedWorkingAtHeightJobRef.current = null;
      processedOperationsJobRef.current = null;
      autoRefreshedHseKeyRef.current = null;
      lastAppliedSourceIdRef.current = selectedSource.id;
      setSelectedRunCategories(
        selectedSource.analytics.filter((item): item is RunCategoryKey =>
          RUN_CATEGORY_OPTIONS.some((option) => option.key === item)
        )
      );
      setSelectedPpeModules(["ppe.no-helmet", "ppe.no-safety-vest"]);
      setSelectedHseModules(["hse.safety-rules", "hse.working-at-height"]);
      setSelectedOperationsModules(["operations.red-light-violation"]);
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

  const handleVestChange = (field: keyof typeof vestFormState, value: string) => {
    setVestFormState((current) => ({ ...current, [field]: value }));
  };

  const handleLifeVestChange = (field: keyof typeof lifeVestFormState, value: string) => {
    setLifeVestFormState((current) => ({ ...current, [field]: value }));
  };

  const handleWorkingAtHeightChange = (
    field: keyof typeof workingAtHeightFormState,
    value: string
  ) => {
    setWorkingAtHeightFormState((current) => ({ ...current, [field]: value }));
  };

  const handleRedLightChange = (
    field: keyof typeof redLightFormState,
    value: string
  ) => {
    setRedLightFormState((current) => ({ ...current, [field]: value }));
  };

  const handleDumpTruckChange = (
    field: keyof typeof dumpTruckFormState,
    value: string
  ) => {
    setDumpTruckFormState((current) => ({ ...current, [field]: value }));
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

  const applyPositiveVestBaseline = () => {
    setVestFormState((current) => ({
      ...current,
      modelPath: current.modelPath || noSafetyVestServerDefaults?.defaultModelPath || current.modelPath,
      confidenceThreshold: "0.28",
      iouThreshold: "0.30",
      vestLabels: "safety-vest, vest",
      violationLabels: "",
      violationOnFrames: "3",
      cleanOffFrames: "3",
      frameStep: "2",
      imageSize: "1280",
    }));
    toast({
      title: "Baseline positive vest diterapkan",
      description: "Parameter No Safety Vest disetel ke baseline positive vest agar job vest tidak lagi terlihat memakai konfigurasi helmet.",
    });
  };

  const applyPositiveLifeVestBaseline = () => {
    setLifeVestFormState((current) => ({
      ...current,
      modelPath: current.modelPath || noLifeVestServerDefaults?.defaultModelPath || current.modelPath,
      confidenceThreshold: "0.28",
      iouThreshold: "0.30",
      lifeVestLabels: "life-vest, life vest, life_jacket",
      violationLabels: "",
      violationOnFrames: "3",
      cleanOffFrames: "3",
      frameStep: "2",
      imageSize: "1280",
    }));
    toast({
      title: "Baseline positive life vest diterapkan",
      description: "Parameter No Life Vest disetel ke baseline positive life vest untuk area air dan kerja dekat perairan.",
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
      setCurrentAreaPoints((current) =>
        current.map((point, index) => (index === pointIndex ? normalizedPoint : point))
      );
      return;
    }

    setCurrentAreaPoints((current) => [...current, normalizedPoint]);
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
    setCurrentAreaPoints((current) => current.filter((_, pointIndex) => pointIndex !== index));
  };

  const loadPreview = async (videoPath: string, timestampOverrideSeconds?: number) => {
    setIsPreviewLoading(true);
    try {
      if (selectedSource?.type === "camera") {
        const response = await getSourcePreview(selectedSource.source);
        setPreview({
          ok: true,
          videoPath: selectedSource.source,
          previewPath: response.previewPath,
          previewUrl: response.previewUrl,
          timestampSeconds: 0,
          metadata:
            preview?.metadata || {
              width: 0,
              height: 0,
              fps: 0,
              durationSeconds: 0,
            },
        });
        toast({
          title: "Preview siap",
          description: "Snapshot terbaru dari source camera berhasil dimuat untuk editor area analisis.",
        });
      } else {
        const trimmedTimestamp = formState.previewTimestampSeconds.trim();
        const timestamp =
          typeof timestampOverrideSeconds === "number"
            ? timestampOverrideSeconds
            : trimmedTimestamp.length > 0
              ? Number(trimmedTimestamp)
              : undefined;
        const response = await getVideoPreview(
          videoPath.trim(),
          typeof timestamp === "number" && Number.isFinite(timestamp) ? timestamp : undefined
        );
        setPreview(response);
        toast({
          title: "Preview siap",
          description: `Frame preview dibuat pada ${formatSeconds(response.timestampSeconds)}.`,
        });
      }
      setSourceFileMissing(false);
      if (currentAreaPoints.length === 0) {
        setCurrentAreaPoints(DEFAULT_ROI_POINTS);
      }
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

  const handleUseCurrentVideoFrame = () => {
    const currentVideoTime = videoPreviewRef.current?.currentTime;
    if (typeof currentVideoTime !== "number" || Number.isNaN(currentVideoTime)) {
      return;
    }
    handleChange("previewTimestampSeconds", currentVideoTime.toFixed(1));
    void loadPreview(formState.videoPath, currentVideoTime);
  };

  const handleVerifyNeedsReview = async (finding: AnalysisFinding) => {
    setAiVerifyingFindingIds((current) => ({ ...current, [finding.id]: true }));
    try {
      const response = await verifyNeedsReviewFinding({
        finding: {
          id: finding.id,
          moduleKey: finding.moduleKey,
          title: finding.title,
          detail: finding.detail,
          recommendation: finding.recommendation,
          metric: finding.metric,
          snapshotUrl: finding.snapshotUrl,
          sourceName: selectedSource?.name,
          sourceLocation: selectedSource?.location,
        },
      });
      setAiNeedsReviewResults((current) => ({
        ...current,
        [finding.id]: response.result,
      }));
      toast({
        title: "AI verifier selesai",
        description: "Verifikasi visual tambahan untuk item needs review sudah dibuat.",
      });
    } catch (error) {
      toast({
        title: "AI verifier gagal",
        description: humanizeRequestError(error),
        variant: "destructive",
      });
    } finally {
      setAiVerifyingFindingIds((current) => ({ ...current, [finding.id]: false }));
    }
  };

  const handleGenerateOperatorSummary = async (finding: AnalysisFinding) => {
    setAiSummarizingFindingIds((current) => ({ ...current, [finding.id]: true }));
    try {
      const response = await generateOperatorIncidentSummary({
        source: {
          name: selectedSource?.name,
          location: selectedSource?.location,
          type: selectedSource?.type,
        },
        finding: {
          id: finding.id,
          moduleKey: finding.moduleKey,
          title: finding.title,
          detail: finding.detail,
          recommendation: finding.recommendation,
          metric: finding.metric,
          severity: finding.severity,
          snapshotUrl: finding.snapshotUrl,
        },
      });
      setAiIncidentSummaries((current) => ({
        ...current,
        [finding.id]: response.result,
      }));
      toast({
        title: "Ringkasan incident siap",
        description: "AI assist sudah membuat ringkasan dan action list untuk operator.",
      });
    } catch (error) {
      toast({
        title: "Ringkasan incident gagal",
        description: humanizeRequestError(error),
        variant: "destructive",
      });
    } finally {
      setAiSummarizingFindingIds((current) => ({ ...current, [finding.id]: false }));
    }
  };

  const handleGenerateHseNarrative = async () => {
    setIsGeneratingAiHseNarrative(true);
    try {
      const response = await generateHseNarrative({
        source: selectedSource
          ? {
              name: selectedSource.name,
              location: selectedSource.location,
              analytics: selectedSource.analytics,
            }
          : undefined,
        report: hseReport,
        findings: unifiedFindings.filter((finding) => finding.category === "HSE" || finding.category === "PPE"),
      });
      setAiHseNarrative(response.result.narrative);
      toast({
        title: "Narasi HSE siap",
        description: "AI assist sudah menyusun narasi supervisor untuk sesi aktif.",
      });
    } catch (error) {
      toast({
        title: "Narasi HSE gagal",
        description: humanizeRequestError(error),
        variant: "destructive",
      });
    } finally {
      setIsGeneratingAiHseNarrative(false);
    }
  };

  const runNextQueuedHseModule = () => {
    const [nextModule, ...restModules] = pendingHseModulesRef.current;
    setQueuedHseModules(restModules);
    if (!nextModule) {
      if (pendingOperationsModulesRef.current.length > 0) {
        runNextQueuedOperationsModule();
        return;
      }
      setIsAnalyzing(false);
      setActiveHseModule(null);
      return;
    }

    if (nextModule === "hse.working-at-height") {
      void startWorkingAtHeightModule();
      return;
    }

    void runHseAssessmentInternal(true, true);
  };

  const runNextQueuedOperationsModule = () => {
    const [nextModule, ...restModules] = pendingOperationsModulesRef.current;
    setQueuedOperationsModules(restModules);
    if (!nextModule) {
      setIsAnalyzing(false);
      setActiveOperationsModule(null);
      return;
    }

    if (nextModule === "operations.red-light-violation") {
      void startRedLightViolationModule();
      return;
    }

    if (nextModule === "operations.dump-truck-bed-open") {
      void startDumpTruckBedOpenModule();
      return;
    }

    runNextQueuedOperationsModule();
  };

  const runHseAssessmentInternal = async (showSuccessToast = true, continueQueue = false) => {
    if (!selectedSourceId || !sourceSupportsHse) {
      return;
    }

    setActiveHseModule("hse.safety-rules");
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
      setActiveHseModule(null);
      if (continueQueue) {
        runNextQueuedHseModule();
      }
    }
  };

  const startWorkingAtHeightModule = async () => {
    if (!selectedSource) {
      return;
    }

    setActiveHseModule("hse.working-at-height");
    setWorkingAtHeightJob(null);
    processedWorkingAtHeightJobRef.current = null;
    terminalJobToastRef.current = null;
    setOutputDir("");
    setStdout("");
    setStderr("");

    const resolvedModelPath =
      !workingAtHeightFormState.modelPath.trim() || isLegacyContainerModelPath(workingAtHeightFormState.modelPath)
        ? workingAtHeightServerDefaults?.defaultModelPath || workingAtHeightFormState.modelPath.trim()
        : workingAtHeightFormState.modelPath.trim();

    const response = await startWorkingAtHeightAnalysis({
      mediaSourceId: selectedSource.id,
      videoPath: formState.videoPath.trim(),
      modelPath: resolvedModelPath,
      zoneConfigPath: workingAtHeightFormState.zoneConfigPath.trim() || undefined,
      zoneId: workingAtHeightFormState.zoneId.trim() || "working-at-height-zone",
      zoneNormalized: true,
      zonePolygon: hasValidWorkingAtHeightArea ? workingAtHeightAreaPoints : undefined,
      confidenceThreshold: Number(workingAtHeightFormState.confidenceThreshold),
      iouThreshold: Number(workingAtHeightFormState.iouThreshold),
      frameStep: Number(workingAtHeightFormState.frameStep),
      imageSize: Number(workingAtHeightFormState.imageSize),
      personLabels: parseCommaSeparated(workingAtHeightFormState.personLabels),
      minimumPresenceSeconds: Number(workingAtHeightFormState.minimumPresenceSeconds),
    });

    setWorkingAtHeightJob({
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
    setStdout("Job HSE • Working at Height dibuat. Worker akan memproses source aktif di background.");
    toast({
      title: "HSE • Working at Height dimulai",
      description: response.message,
    });
  };

  const startRedLightViolationModule = async () => {
    if (!selectedSource) {
      return;
    }

    setActiveOperationsModule("operations.red-light-violation");
    setOperationsJob(null);
    processedOperationsJobRef.current = null;
    terminalJobToastRef.current = null;
    setOutputDir("");
    setStdout("");
    setStderr("");

    const resolvedVehicleModelPath =
      !redLightFormState.vehicleModelPath.trim() || isLegacyContainerModelPath(redLightFormState.vehicleModelPath)
        ? redLightServerDefaults?.defaultVehicleModelPath || redLightFormState.vehicleModelPath.trim()
        : redLightFormState.vehicleModelPath.trim();
    const resolvedTrafficLightModelPath =
      !redLightFormState.trafficLightModelPath.trim() || isLegacyContainerModelPath(redLightFormState.trafficLightModelPath)
        ? redLightServerDefaults?.defaultTrafficLightModelPath || redLightFormState.trafficLightModelPath.trim()
        : redLightFormState.trafficLightModelPath.trim();

    const response = await startRedLightViolationAnalysis({
      mediaSourceId: selectedSource.id,
      videoPath: formState.videoPath.trim(),
      vehicleModelPath: resolvedVehicleModelPath,
      trafficLightModelPath: resolvedTrafficLightModelPath,
      stopLineConfigPath: redLightFormState.stopLineConfigPath.trim() || undefined,
      intersectionId: redLightFormState.intersectionId.trim() || "intersection-dashboard",
      stopLineNormalized: true,
      stopLinePolygon:
        hasValidRedLightArea && !redLightFormState.stopLineConfigPath.trim() ? redLightAreaPoints : undefined,
      confidenceThreshold: Number(redLightFormState.confidenceThreshold),
      iouThreshold: Number(redLightFormState.iouThreshold),
      frameStep: Number(redLightFormState.frameStep),
      imageSize: Number(redLightFormState.imageSize),
      vehicleLabels: parseCommaSeparated(redLightFormState.vehicleLabels),
      redLightLabels: parseCommaSeparated(redLightFormState.redLightLabels),
      greenLightLabels: parseCommaSeparated(redLightFormState.greenLightLabels),
      crossingWindowSeconds: Number(redLightFormState.crossingWindowSeconds),
    });

    setOperationsJob({
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
    setStdout("Job Operations • Red Light Violation dibuat. Worker akan memproses source aktif di background.");
    toast({
      title: "Operations • Red Light Violation dimulai",
      description: response.message,
    });
  };

  const startDumpTruckBedOpenModule = async () => {
    if (!selectedSource) {
      return;
    }

    setActiveOperationsModule("operations.dump-truck-bed-open");
    setOperationsJob(null);
    processedOperationsJobRef.current = null;
    terminalJobToastRef.current = null;
    setOutputDir("");
    setStdout("");
    setStderr("");

    const resolvedModelPath =
      !dumpTruckFormState.modelPath.trim() || isLegacyContainerModelPath(dumpTruckFormState.modelPath)
        ? dumpTruckServerDefaults?.defaultModelPath || dumpTruckFormState.modelPath.trim()
        : dumpTruckFormState.modelPath.trim();

    const response = await startDumpTruckBedOpenAnalysis({
      mediaSourceId: selectedSource.id,
      videoPath: formState.videoPath.trim(),
      modelPath: resolvedModelPath,
      roiConfigPath: dumpTruckFormState.roiConfigPath.trim() || undefined,
      roiId: dumpTruckFormState.roiId.trim() || "dump-truck-bed-open-zone",
      roiNormalized: true,
      roiPolygon:
        hasValidDumpTruckArea && !dumpTruckFormState.roiConfigPath.trim() ? dumpTruckAreaPoints : undefined,
      confidenceThreshold: Number(dumpTruckFormState.confidenceThreshold),
      iouThreshold: Number(dumpTruckFormState.iouThreshold),
      frameStep: Number(dumpTruckFormState.frameStep),
      imageSize: Number(dumpTruckFormState.imageSize),
      truckLabels: parseCommaSeparated(dumpTruckFormState.truckLabels),
      bedOpenLabels: parseCommaSeparated(dumpTruckFormState.bedOpenLabels),
      bedClosedLabels: parseCommaSeparated(dumpTruckFormState.bedClosedLabels),
      movementThreshold: Number(dumpTruckFormState.movementThreshold),
      minimumMovingSeconds: Number(dumpTruckFormState.minimumMovingSeconds),
    });

    setOperationsJob({
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
    setStdout("Job Operations • Dump Truck Bed Open dibuat. Worker akan memproses source aktif di background.");
    toast({
      title: "Operations • Dump Truck Bed Open dimulai",
      description: response.message,
    });
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
        } else if (activePpeModule === "ppe.no-life-vest") {
          setNoLifeVestSummary(job.summary as NoLifeVestAnalysisSummary | null);
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
        } else if (activePpeModule === "ppe.no-life-vest") {
          setNoLifeVestSummary(null);
        } else {
          setSummary(null);
        }
        setIsAnalyzing(false);
        setPendingPpeModules([]);
        setQueuedHseModules([]);
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
            : activePpeModule === "ppe.no-life-vest"
              ? await getNoLifeVestAnalysisJob(analysisJob.id)
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
        setQueuedHseModules([]);
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
    setHasSessionResults(true);
    if (pendingHseModulesRef.current.length > 0) {
      runNextQueuedHseModule();
      return;
    }
    if (pendingOperationsModulesRef.current.length > 0) {
      runNextQueuedOperationsModule();
      return;
    }
    setIsAnalyzing(false);
  }, [analysisJob, pendingPpeModules]);

  useEffect(() => {
    if (!workingAtHeightJob || (workingAtHeightJob.status !== "queued" && workingAtHeightJob.status !== "running")) {
      return;
    }

    let cancelled = false;
    let intervalId: number | null = null;

    const syncJobState = (job: WorkingAtHeightAnalysisJob) => {
      setWorkingAtHeightJob(job);
      setOutputDir(job.outputDir || "");
      setStdout(job.stdout || "");
      setStderr(job.stderr || "");

      if (job.status === "completed") {
        setWorkingAtHeightSummary(job.summary as WorkingAtHeightAnalysisSummary | null);
        if (terminalJobToastRef.current !== job.id) {
          terminalJobToastRef.current = job.id;
          toast({
            title: "HSE • Working at Height selesai",
            description: `${job.summary?.event_count ?? 0} event ditemukan.`,
          });
        }
      } else if (job.status === "failed") {
        setWorkingAtHeightSummary(null);
        setQueuedHseModules([]);
        setIsAnalyzing(false);
        if (terminalJobToastRef.current !== job.id) {
          terminalJobToastRef.current = job.id;
          toast({
            title: "HSE • Working at Height gagal",
            description: job.message || job.stderr || "Job analisis gagal diproses.",
            variant: "destructive",
          });
        }
      }
    };

    const pollJob = async () => {
      try {
        const response = await getWorkingAtHeightAnalysisJob(workingAtHeightJob.id);
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
        setQueuedHseModules([]);
        setIsAnalyzing(false);
        setStderr(message);
        if (terminalJobToastRef.current !== `poll:${workingAtHeightJob.id}`) {
          terminalJobToastRef.current = `poll:${workingAtHeightJob.id}`;
          toast({
            title: "Status Working at Height gagal diperbarui",
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
  }, [toast, workingAtHeightJob?.id]);

  useEffect(() => {
    if (
      !workingAtHeightJob ||
      workingAtHeightJob.status !== "completed" ||
      processedWorkingAtHeightJobRef.current === workingAtHeightJob.id
    ) {
      return;
    }

    processedWorkingAtHeightJobRef.current = workingAtHeightJob.id;
    setHasSessionResults(true);
    setActiveHseModule(null);
    if (pendingHseModulesRef.current.length > 0) {
      runNextQueuedHseModule();
      return;
    }
    if (pendingOperationsModulesRef.current.length > 0) {
      runNextQueuedOperationsModule();
      return;
    }
    setIsAnalyzing(false);
  }, [workingAtHeightJob]);

  useEffect(() => {
    if (!operationsJob || (operationsJob.status !== "queued" && operationsJob.status !== "running")) {
      return;
    }

    let cancelled = false;
    let intervalId: number | null = null;

    const syncJobState = (job: OperationsAnalysisJob) => {
      setOperationsJob(job);
      setOutputDir(job.outputDir || "");
      setStdout(job.stdout || "");
      setStderr(job.stderr || "");

      if (job.status === "completed") {
        if (job.analysisType === "dump_truck_bed_open") {
          setDumpTruckSummary(job.summary as DumpTruckBedOpenAnalysisSummary | null);
        } else {
          setRedLightSummary(job.summary as RedLightViolationAnalysisSummary | null);
        }
        if (terminalJobToastRef.current !== job.id) {
          terminalJobToastRef.current = job.id;
          toast({
            title:
              job.analysisType === "dump_truck_bed_open"
                ? "Operations • Dump Truck Bed Open selesai"
                : "Operations • Red Light Violation selesai",
            description: `${job.summary?.event_count ?? 0} event ditemukan.`,
          });
        }
      } else if (job.status === "failed") {
        if (job.analysisType === "dump_truck_bed_open") {
          setDumpTruckSummary(null);
        } else {
          setRedLightSummary(null);
        }
        setQueuedOperationsModules([]);
        setIsAnalyzing(false);
        if (terminalJobToastRef.current !== job.id) {
          terminalJobToastRef.current = job.id;
          toast({
            title:
              job.analysisType === "dump_truck_bed_open"
                ? "Operations • Dump Truck Bed Open gagal"
                : "Operations • Red Light Violation gagal",
            description: job.message || job.stderr || "Job analisis gagal diproses.",
            variant: "destructive",
          });
        }
      }
    };

    const pollJob = async () => {
      try {
        const response =
          operationsJob.analysisType === "dump_truck_bed_open"
            ? await getDumpTruckBedOpenAnalysisJob(operationsJob.id)
            : await getRedLightViolationAnalysisJob(operationsJob.id);
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
        setQueuedOperationsModules([]);
        setIsAnalyzing(false);
        setStderr(message);
        if (terminalJobToastRef.current !== `poll:${operationsJob.id}`) {
          terminalJobToastRef.current = `poll:${operationsJob.id}`;
          toast({
            title:
              operationsJob.analysisType === "dump_truck_bed_open"
                ? "Status Dump Truck Bed Open gagal diperbarui"
                : "Status Red Light Violation gagal diperbarui",
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
  }, [operationsJob?.id, toast]);

  useEffect(() => {
    if (
      !operationsJob ||
      operationsJob.status !== "completed" ||
      processedOperationsJobRef.current === operationsJob.id
    ) {
      return;
    }

    processedOperationsJobRef.current = operationsJob.id;
    setHasSessionResults(true);
    setActiveOperationsModule(null);
    if (pendingOperationsModulesRef.current.length > 0) {
      runNextQueuedOperationsModule();
      return;
    }
    setIsAnalyzing(false);
  }, [operationsJob]);

  useEffect(() => {
    if (
      !selectedSourceId ||
      !sourceSupportsHse ||
      !isHseReportStale ||
      !selectedHseModules.includes("hse.safety-rules") ||
      !hasSessionResults ||
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
  }, [hasSessionResults, isAnalyzing, isHseReportStale, isRunningHse, latestPpeEvidenceAt, selectedHseModules, selectedSourceId, sourceSupportsHse]);

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
    const isLifeVestModule = moduleKey === "ppe.no-life-vest";
    const resolvedNoSafetyVestModelPath =
      !vestFormState.modelPath.trim() || isLegacyContainerModelPath(vestFormState.modelPath)
        ? noSafetyVestServerDefaults?.defaultModelPath || vestFormState.modelPath.trim()
        : vestFormState.modelPath.trim();
    const resolvedNoLifeVestModelPath =
      !lifeVestFormState.modelPath.trim() || isLegacyContainerModelPath(lifeVestFormState.modelPath)
        ? noLifeVestServerDefaults?.defaultModelPath || lifeVestFormState.modelPath.trim()
        : lifeVestFormState.modelPath.trim();
    const resolvedNoHelmetModelPath =
      !formState.modelPath.trim() || isLegacyContainerModelPath(formState.modelPath)
        ? serverDefaults?.defaultModelPath || formState.modelPath.trim()
        : formState.modelPath.trim();
    const response = isVestModule
      ? await startNoSafetyVestAnalysis({
          mediaSourceId: selectedSource.id,
          videoPath: formState.videoPath.trim(),
          modelPath: resolvedNoSafetyVestModelPath,
          roiConfigPath: vestFormState.roiConfigPath.trim() || undefined,
          roiId: vestFormState.roiId.trim() || "roi-dashboard",
          roiNormalized: true,
          roiPolygon: hasValidVestArea ? vestAreaPoints : undefined,
          confidenceThreshold: Number(vestFormState.confidenceThreshold),
          iouThreshold: Number(vestFormState.iouThreshold),
          violationOnFrames: Number(vestFormState.violationOnFrames),
          cleanOffFrames: Number(vestFormState.cleanOffFrames),
          frameStep: Number(vestFormState.frameStep),
          imageSize: Number(vestFormState.imageSize),
          personLabels: ["person"],
          vestLabels: parseCommaSeparated(vestFormState.vestLabels),
          violationLabels: parseCommaSeparated(vestFormState.violationLabels),
        })
      : isLifeVestModule
        ? await startNoLifeVestAnalysis({
            mediaSourceId: selectedSource.id,
            videoPath: formState.videoPath.trim(),
            modelPath: resolvedNoLifeVestModelPath,
            roiConfigPath: lifeVestFormState.roiConfigPath.trim() || undefined,
            roiId: lifeVestFormState.roiId.trim() || "roi-dashboard",
            roiNormalized: true,
            roiPolygon: hasValidLifeVestArea ? lifeVestAreaPoints : undefined,
            confidenceThreshold: Number(lifeVestFormState.confidenceThreshold),
            iouThreshold: Number(lifeVestFormState.iouThreshold),
            violationOnFrames: Number(lifeVestFormState.violationOnFrames),
            cleanOffFrames: Number(lifeVestFormState.cleanOffFrames),
            frameStep: Number(lifeVestFormState.frameStep),
            imageSize: Number(lifeVestFormState.imageSize),
            personLabels: ["person"],
            vestLabels: parseCommaSeparated(lifeVestFormState.lifeVestLabels),
            violationLabels: parseCommaSeparated(lifeVestFormState.violationLabels),
          })
      : await startNoHelmetAnalysis({
          mediaSourceId: selectedSource.id,
          videoPath: formState.videoPath.trim(),
          modelPath: resolvedNoHelmetModelPath,
          roiConfigPath: formState.roiConfigPath.trim() || undefined,
          roiId: formState.roiId.trim() || "roi-dashboard",
          roiNormalized: true,
          roiPolygon: hasValidHelmetArea ? helmetAreaPoints : undefined,
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

  const startPpeAnalysis = async (queuedHseModules: HseModuleKey[]) => {
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
    setQueuedHseModules(queuedHseModules);
    setPendingPpeModules(selectedPpeModules.slice(1));

    try {
      await startPpeModule(selectedPpeModules[0]);
    } catch (error) {
      setIsAnalyzing(false);
      setPendingPpeModules([]);
      setQueuedHseModules([]);
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
    const wantsOperations = selectedRunCategories.includes("Operations");

    if (!wantsPpe && !wantsHse && !wantsOperations) {
      toast({
        title: "Pilih modul yang akan dijalankan",
        description: "Pilih minimal satu modul aktif, misalnya PPE, HSE, atau Operations.",
        variant: "destructive",
      });
      return;
    }

    if (wantsHse && !hasSelectedHseModule) {
      toast({
        title: "Pilih modul HSE terlebih dulu",
        description: "Centang minimal satu sub-modul HSE yang ingin dijalankan.",
        variant: "destructive",
      });
      return;
    }

    if (wantsOperations && !hasSelectedOperationsModule) {
      toast({
        title: "Pilih modul Operations terlebih dulu",
        description: "Centang minimal satu sub-modul Operations yang ingin dijalankan.",
        variant: "destructive",
      });
      return;
    }

    if (wantsPpe) {
      setQueuedOperationsModules(wantsOperations && sourceSupportsOperations ? selectedOperationsModules : []);
      await startPpeAnalysis(wantsHse && sourceSupportsHse ? selectedHseModules : []);
      return;
    }

    if (wantsHse) {
      setIsAnalyzing(true);
      setQueuedOperationsModules(wantsOperations && sourceSupportsOperations ? selectedOperationsModules : []);
      setQueuedHseModules(selectedHseModules);
      runNextQueuedHseModule();
      return;
    }

    if (wantsOperations) {
      setIsAnalyzing(true);
      setQueuedOperationsModules(sourceSupportsOperations ? selectedOperationsModules : []);
      runNextQueuedOperationsModule();
    }
  };

  return (
    <DashboardLayout>
      <Header title="Run Analysis" />

      {!selectedSource ? (
        <Card className="mb-6 border-border/60 bg-secondary/10">
          <CardHeader>
            <CardTitle className="text-xl">Source Tidak Ditemukan</CardTitle>
            <CardDescription>
              Halaman ini harus dibuka dari action <code>Run Analysis</code> pada halaman <code>Media Sources</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Source tidak dipilih atau parameter <code>sourceId</code> tidak valid. Halaman ini tidak memakai pemilihan source manual agar konteks analisis tetap spesifik ke resource yang Anda pilih dari daftar source.
            </p>
            <Button asChild>
              <Link to="/">Kembali ke Media Sources</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl">Source & Preview</CardTitle>
          <CardDescription>
            Tinjau source aktif, lihat preview video, lalu siapkan area analisis yang akan dipakai modul yang relevan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[1.35fr,repeat(4,minmax(0,1fr))]">
            <div className="space-y-1">
              <p className="text-lg font-semibold text-foreground">{selectedSource?.name || "--"}</p>
              <p className="text-sm text-muted-foreground">
                {selectedSource
                  ? `${selectedSource.location}${selectedSource.note ? ` • ${selectedSource.note}` : ""}`
                  : "Belum ada source yang dipilih."}
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
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr,180px,auto]">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Source Path</label>
              <Input value={formState.videoPath} readOnly placeholder="Source aktif dari Media Sources" />
              <p className="text-xs text-muted-foreground">
                Upload video baru dan perubahan source tetap dilakukan dari halaman <code>Media Sources</code>.
              </p>
            </div>
            {selectedSource?.type === "upload" ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Frame Time (s)</label>
                  <Input
                    value={formState.previewTimestampSeconds}
                    onChange={(event) => handleChange("previewTimestampSeconds", event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Isi waktu tertentu jika Anda ingin mengambil frame dari timestamp manual, bukan dari posisi player.
                  </p>
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={() => loadPreview(formState.videoPath)}
                    disabled={isPreviewLoading || !selectedSource || !formState.videoPath.trim()}
                    variant="outline"
                    className="gap-2 w-full md:w-auto"
                  >
                    {isPreviewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {isPreviewLoading ? "Memuat..." : "Ambil Frame Dari Waktu"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Snapshot Camera</label>
                  <Input value="Gunakan tombol di kanan untuk mengambil snapshot terbaru." readOnly />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={() => loadPreview(formState.videoPath)}
                    disabled={isPreviewLoading || !selectedSource || !formState.videoPath.trim()}
                    variant="outline"
                    className="gap-2 w-full md:w-auto"
                  >
                    {isPreviewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {isPreviewLoading ? "Memuat..." : "Ambil Snapshot Preview"}
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Preview Video</p>
                <p className="text-xs text-muted-foreground">
                  Gunakan player ini untuk memahami konteks source. Untuk source upload, tombol <span className="text-foreground">Gunakan Frame Saat Ini Untuk Editor</span> menjadi alur tercepat ke editor area.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedSource?.type === "upload" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleUseCurrentVideoFrame}
                    disabled={!sourceVideoUrl || isPreviewLoading}
                  >
                    Gunakan Frame Saat Ini Untuk Editor
                  </Button>
                ) : null}
                {sourceVideoUrl ? (
                  <Badge variant="outline">
                    {selectedSource?.type === "camera" ? "Stream source" : "Video source"}
                  </Badge>
                ) : (
                  <Badge variant="outline">Preview player belum tersedia</Badge>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-slate-950/70 p-3">
              {sourceVideoUrl ? (
                <video
                  ref={videoPreviewRef}
                  src={sourceVideoUrl}
                  controls
                  muted
                  playsInline
                  preload="metadata"
                  className="block max-h-[420px] w-full rounded-xl bg-black"
                />
              ) : (
                <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-border bg-background/40 px-6 text-center text-sm text-muted-foreground">
                  Preview video belum tersedia untuk source ini. Anda tetap bisa memuat frame snapshot di bawah untuk menyiapkan area analisis.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={hasValidCurrentArea || hasRelevantAreaOverride ? "default" : "destructive"}>
                {hasValidCurrentArea
                  ? areaEditorContext.readyLabel
                  : hasRelevantAreaOverride
                    ? areaEditorContext.overrideLabel
                    : areaEditorContext.missingLabel}
              </Badge>
              {preview && <Badge variant="outline">{preview.metadata.width} x {preview.metadata.height}</Badge>}
              {preview && <Badge variant="outline">{formatSeconds(preview.metadata.durationSeconds)}</Badge>}
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{areaEditorContext.title}</p>
              <p className="text-xs text-muted-foreground">{areaEditorContext.instruction}</p>
            </div>

            {areaEditorTabs.length > 1 ? (
              <Tabs value={activeAreaEditorKey} onValueChange={(value) => setActiveAreaEditorKey(value as AreaEditorModuleKey)}>
                <TabsList className="flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
                  {areaEditorTabs.map((tab) => (
                    <TabsTrigger
                      key={tab.key}
                      value={tab.key}
                      className="rounded-full border border-border/70 bg-background/50 px-3 py-1.5 text-xs data-[state=active]:border-primary/40 data-[state=active]:bg-primary/10"
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setCurrentAreaPoints(DEFAULT_ROI_POINTS)}>
                Gunakan Full Frame
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setCurrentAreaPoints((current) => current.slice(0, -1))} disabled={currentAreaPoints.length === 0}>
                <Undo2 className="w-4 h-4 mr-2" />
                Undo Titik
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setCurrentAreaPoints([])} disabled={currentAreaPoints.length === 0}>
                <Trash2 className="w-4 h-4 mr-2" />
                Reset Area
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
                    {currentAreaPoints.length >= 2 && (
                      <polyline
                        points={asPercentPoints(currentAreaPoints)}
                        fill="rgba(34,211,238,0.18)"
                        stroke="rgb(34,211,238)"
                        strokeWidth="0.45"
                      />
                    )}
                    {currentAreaPoints.length >= 3 && (
                      <polygon
                        points={asPercentPoints(currentAreaPoints)}
                        fill="rgba(34,211,238,0.16)"
                        stroke="rgb(56,189,248)"
                        strokeWidth="0.45"
                      />
                    )}
                    {currentAreaPoints.map(([x, y], index) => (
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
                  Load preview dari source aktif untuk mulai menggambar ROI.
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              Klik pada frame editor untuk menambah titik area analisis. Drag titik untuk memindahkan. Double click titik untuk menghapus.
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
                  Yang ditampilkan di bawah ini hanya kategori analysis yang memang ada di <code>Kategori Output</code> source aktif, agar workspace tidak menampilkan modul yang tidak relevan.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={selectAllActiveCategories} disabled={!selectedSource}>
                  Aktifkan Semua Kategori Source
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedRunCategories([])}>
                  Reset Pilihan
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {supportedRunCategoryOptions.map((option) => {
                const isChecked = selectedRunCategories.includes(option.key);
                return (
                  <label
                    key={option.key}
                    className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/50 p-4"
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(checked) => handleRunCategoryChange(option.key, Boolean(checked))}
                    />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{option.label}</span>
                        <Badge variant={option.engineStatus === "active" ? "default" : "secondary"}>
                          {option.engineStatus === "active" ? "Ready" : "Planned"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{option.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>

            {selectedSource && supportedRunCategoryOptions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 bg-background/40 p-4 text-sm text-muted-foreground">
                Source ini belum memiliki <code>Kategori Output</code> yang bisa dianalisis. Atur dulu kategorinya dari{" "}
                <code>Media Sources</code> atau <code>Setup Analysis</code>.
              </div>
            ) : null}

            {selectedRunCategories.includes("PPE") ? (
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Sub-modul PPE</p>
                  <p className="text-xs text-muted-foreground">
                    Pilih detector PPE yang ingin dijalankan. Semua sub-modul bisa dijalankan berurutan pada source yang sama.
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

            {selectedRunCategories.includes("HSE") ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Sub-modul HSE</p>
                  <p className="text-xs text-muted-foreground">
                    Pilih assessment HSE yang ingin dijalankan. Semua sub-modul HSE bisa dijalankan berurutan setelah PPE selesai atau dijalankan langsung jika hanya kategori HSE yang dipilih.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {HSE_MODULE_OPTIONS.map((option) => (
                    <label
                      key={option.key}
                      className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/50 p-4"
                    >
                      <Checkbox
                        checked={selectedHseModules.includes(option.key)}
                        onCheckedChange={(checked) =>
                          setSelectedHseModules((current) =>
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

            {selectedRunCategories.includes("Operations") ? (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Sub-modul Operations</p>
                  <p className="text-xs text-muted-foreground">
                    Pilih modul vehicle safety yang ingin dijalankan. Semua sub-modul operations bisa dijalankan berurutan pada source yang sama.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {OPERATIONS_MODULE_OPTIONS.map((option) => {
                    const enabled = option.engineStatus === "active";
                    return (
                      <label
                        key={option.key}
                        className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/50 p-4"
                      >
                        <Checkbox
                          checked={selectedOperationsModules.includes(option.key)}
                          disabled={!enabled}
                          onCheckedChange={(checked) =>
                            setSelectedOperationsModules((current) =>
                              checked
                                ? current.includes(option.key)
                                  ? current
                                  : [...current, option.key]
                                : current.filter((item) => item !== option.key)
                            )
                          }
                        />
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-foreground">{option.label}</p>
                            <Badge variant={enabled ? "default" : "secondary"}>
                              {enabled ? "Ready" : "Planned"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{option.description}</p>
                          <Button asChild type="button" variant="outline" size="sm">
                            <Link to={option.setupPath}>Buka Setup Modul</Link>
                          </Button>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
            <div className="space-y-6">
              {selectedPpeModules.includes("ppe.no-helmet") ? (
                <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">PPE • No Helmet</p>
                      <p className="text-xs text-muted-foreground">
                        Konfigurasi helmet dipindah ke modal agar workspace run tetap fokus ke source, preview, status, dan hasil sesi.
                      </p>
                    </div>
                    <Dialog open={isHelmetConfigOpen} onOpenChange={setIsHelmetConfigOpen}>
                      <DialogTrigger asChild>
                        <Button type="button" variant="outline">Buka Konfigurasi Helmet</Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>PPE • No Helmet Configuration</DialogTitle>
                          <DialogDescription>
                            Pengaturan ini hanya dipakai saat sub-modul <code>No Helmet</code> dijalankan pada sesi analisis aktif.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-medium text-foreground">Community Demo Preset</p>
                                <p className="text-xs text-muted-foreground">Baseline awal untuk detector PPE no helmet.</p>
                              </div>
                              <Button type="button" variant="outline" onClick={applyCommunityDemoPreset}>Gunakan Preset Demo</Button>
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
                                <p className="text-xs text-muted-foreground">Baseline konservatif untuk objek kecil, kamera jauh, dan scene rawan false positive.</p>
                              </div>
                              <Button type="button" variant="outline" onClick={applyStrictDistancePreset}>Gunakan Preset Strict</Button>
                            </div>
                            <p className="text-xs break-all text-muted-foreground">
                              Conf {STRICT_DISTANCE_PRESET.confidenceThreshold} • Step {STRICT_DISTANCE_PRESET.frameStep} • On {STRICT_DISTANCE_PRESET.violationOnFrames} • Off {STRICT_DISTANCE_PRESET.cleanOffFrames} • ImgSz {STRICT_DISTANCE_PRESET.imageSize}
                            </p>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2 md:col-span-2">
                              <label className="text-sm font-medium text-foreground">Model Path Helmet</label>
                              <Input value={formState.modelPath} onChange={(event) => handleChange("modelPath", event.target.value)} placeholder={serverDefaults?.defaultModelPath || "/app/models/detect-construction-safety-best.pt"} />
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
                              <Input value={formState.violationLabels} onChange={(event) => handleChange("violationLabels", event.target.value)} placeholder="Opsional. Kosongkan untuk hanya memakai person + hardhat matching" />
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
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Model</p>
                      <p className="mt-1 text-sm font-medium break-all">{formState.modelPath || "--"}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Ringkasan Config</p>
                      <p className="mt-1 text-sm text-muted-foreground">{helmetConfigSummary}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedPpeModules.includes("ppe.no-safety-vest") ? (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">PPE • No Safety Vest</p>
                      <p className="text-xs text-muted-foreground">
                        Konfigurasi rompi dipindah ke modal agar halaman utama tetap ringkas. Ini juga mencegah kebingungan antara parameter vest dan helmet.
                      </p>
                    </div>
                    <Dialog open={isVestConfigOpen} onOpenChange={setIsVestConfigOpen}>
                      <DialogTrigger asChild>
                        <Button type="button" variant="outline">Buka Konfigurasi Vest</Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>PPE • No Safety Vest Configuration</DialogTitle>
                          <DialogDescription>
                            Pengaturan ini hanya dipakai saat sub-modul <code>No Safety Vest</code> dijalankan pada sesi analisis aktif.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-medium text-foreground">Baseline Positive Vest</p>
                                <p className="text-xs text-muted-foreground">Strategy default untuk mengandalkan positive vest lalu fallback missing vest.</p>
                              </div>
                              <Button type="button" variant="outline" onClick={applyPositiveVestBaseline}>Gunakan Baseline Positive Vest</Button>
                            </div>
                            <p className="text-xs text-muted-foreground">Dipakai untuk mengurangi false positive saat detector rompi belum cukup stabil pada kamera jauh.</p>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2 md:col-span-2">
                              <label className="text-sm font-medium text-foreground">Model Path Vest</label>
                              <Input value={vestFormState.modelPath} onChange={(event) => handleVestChange("modelPath", event.target.value)} placeholder={noSafetyVestServerDefaults?.defaultModelPath || "/app/models/detect-construction-safety-best.pt"} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-foreground">ROI ID</label>
                              <Input value={vestFormState.roiId} onChange={(event) => handleVestChange("roiId", event.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-foreground">Custom ROI Path</label>
                              <Input value={vestFormState.roiConfigPath} onChange={(event) => handleVestChange("roiConfigPath", event.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-foreground">Vest Labels</label>
                              <Input value={vestFormState.vestLabels} onChange={(event) => handleVestChange("vestLabels", event.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-foreground">Violation Labels</label>
                              <Input value={vestFormState.violationLabels} onChange={(event) => handleVestChange("violationLabels", event.target.value)} placeholder="Opsional. Kosongkan untuk positive vest + fallback missing vest" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-foreground">Confidence</label>
                              <Input value={vestFormState.confidenceThreshold} onChange={(event) => handleVestChange("confidenceThreshold", event.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-foreground">IoU Tracker</label>
                              <Input value={vestFormState.iouThreshold} onChange={(event) => handleVestChange("iouThreshold", event.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-foreground">On Frames</label>
                              <Input value={vestFormState.violationOnFrames} onChange={(event) => handleVestChange("violationOnFrames", event.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-foreground">Off Frames</label>
                              <Input value={vestFormState.cleanOffFrames} onChange={(event) => handleVestChange("cleanOffFrames", event.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-foreground">Frame Step</label>
                              <Input value={vestFormState.frameStep} onChange={(event) => handleVestChange("frameStep", event.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-foreground">Image Size</label>
                              <Input value={vestFormState.imageSize} onChange={(event) => handleVestChange("imageSize", event.target.value)} />
                            </div>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Model</p>
                      <p className="mt-1 text-sm font-medium break-all">{vestFormState.modelPath || "--"}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Ringkasan Config</p>
                      <p className="mt-1 text-sm text-muted-foreground">{vestConfigSummary}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedPpeModules.includes("ppe.no-life-vest") ? (
                <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-4 space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">PPE • No Life Vest</p>
                      <p className="text-xs text-muted-foreground">
                        Konfigurasi pelampung dipindah ke modal agar halaman utama tetap ringkas. Modul ini ditujukan untuk area air, dermaga, ponton, atau kerja dekat perairan.
                      </p>
                    </div>
                    <Dialog open={isLifeVestConfigOpen} onOpenChange={setIsLifeVestConfigOpen}>
                      <DialogTrigger asChild>
                        <Button type="button" variant="outline">Buka Konfigurasi Life Vest</Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>PPE • No Life Vest Configuration</DialogTitle>
                          <DialogDescription>
                            Pengaturan ini hanya dipakai saat sub-modul <code>No Life Vest</code> dijalankan pada sesi analisis aktif.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-4 space-y-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-medium text-foreground">Baseline Positive Life Vest</p>
                                <p className="text-xs text-muted-foreground">Strategy default untuk mengandalkan deteksi positive life vest lalu fallback missing life vest.</p>
                              </div>
                              <Button type="button" variant="outline" onClick={applyPositiveLifeVestBaseline}>Gunakan Baseline Positive Life Vest</Button>
                            </div>
                            <p className="text-xs text-muted-foreground">Dipakai untuk area kerja dekat air dan untuk mengurangi false positive saat pelampung terlihat kecil/jauh.</p>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2 md:col-span-2">
                              <label className="text-sm font-medium text-foreground">Model Path Life Vest</label>
                              <Input value={lifeVestFormState.modelPath} onChange={(event) => handleLifeVestChange("modelPath", event.target.value)} placeholder={noLifeVestServerDefaults?.defaultModelPath || "/app/models/detect-construction-safety-best.pt"} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-foreground">ROI ID</label>
                              <Input value={lifeVestFormState.roiId} onChange={(event) => handleLifeVestChange("roiId", event.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-foreground">Custom ROI Path</label>
                              <Input value={lifeVestFormState.roiConfigPath} onChange={(event) => handleLifeVestChange("roiConfigPath", event.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-foreground">Life Vest Labels</label>
                              <Input value={lifeVestFormState.lifeVestLabels} onChange={(event) => handleLifeVestChange("lifeVestLabels", event.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-foreground">Violation Labels</label>
                              <Input value={lifeVestFormState.violationLabels} onChange={(event) => handleLifeVestChange("violationLabels", event.target.value)} placeholder="Opsional. Kosongkan untuk positive life vest + fallback missing life vest" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-foreground">Confidence</label>
                              <Input value={lifeVestFormState.confidenceThreshold} onChange={(event) => handleLifeVestChange("confidenceThreshold", event.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-foreground">IoU Tracker</label>
                              <Input value={lifeVestFormState.iouThreshold} onChange={(event) => handleLifeVestChange("iouThreshold", event.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-foreground">On Frames</label>
                              <Input value={lifeVestFormState.violationOnFrames} onChange={(event) => handleLifeVestChange("violationOnFrames", event.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-foreground">Off Frames</label>
                              <Input value={lifeVestFormState.cleanOffFrames} onChange={(event) => handleLifeVestChange("cleanOffFrames", event.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-foreground">Frame Step</label>
                              <Input value={lifeVestFormState.frameStep} onChange={(event) => handleLifeVestChange("frameStep", event.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-foreground">Image Size</label>
                              <Input value={lifeVestFormState.imageSize} onChange={(event) => handleLifeVestChange("imageSize", event.target.value)} />
                            </div>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Model</p>
                      <p className="mt-1 text-sm font-medium break-all">{lifeVestFormState.modelPath || "--"}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Ringkasan Config</p>
                      <p className="mt-1 text-sm text-muted-foreground">{lifeVestConfigSummary}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedRunCategories.includes("HSE") && selectedHseModules.includes("hse.working-at-height") ? (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">HSE • Working at Height</p>
                      <p className="text-xs text-muted-foreground">
                        Konfigurasi zone-based untuk mendeteksi aktivitas person pada area elevasi atau pekerjaan di ketinggian. ROI editor di atas juga bisa dipakai sebagai zone fallback jika path zone tidak diisi.
                      </p>
                    </div>
                    <Dialog open={isWorkingAtHeightConfigOpen} onOpenChange={setIsWorkingAtHeightConfigOpen}>
                      <DialogTrigger asChild>
                        <Button type="button" variant="outline">Buka Konfigurasi Working at Height</Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>HSE • Working at Height Configuration</DialogTitle>
                          <DialogDescription>
                            Pengaturan ini dipakai saat sub-modul <code>Working at Height</code> dijalankan pada sesi analisis aktif.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-medium text-foreground">Model Path Working at Height</label>
                            <Input
                              value={workingAtHeightFormState.modelPath}
                              onChange={(event) => handleWorkingAtHeightChange("modelPath", event.target.value)}
                              placeholder={workingAtHeightServerDefaults?.defaultModelPath || "/app/models/detect-construction-safety-best.pt"}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Zone ID</label>
                            <Input
                              value={workingAtHeightFormState.zoneId}
                              onChange={(event) => handleWorkingAtHeightChange("zoneId", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Custom Zone Path</label>
                            <Input
                              value={workingAtHeightFormState.zoneConfigPath}
                              onChange={(event) => handleWorkingAtHeightChange("zoneConfigPath", event.target.value)}
                              placeholder={workingAtHeightServerDefaults?.defaultZoneConfigPath || ""}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Person Labels</label>
                            <Input
                              value={workingAtHeightFormState.personLabels}
                              onChange={(event) => handleWorkingAtHeightChange("personLabels", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Minimum Presence (s)</label>
                            <Input
                              value={workingAtHeightFormState.minimumPresenceSeconds}
                              onChange={(event) => handleWorkingAtHeightChange("minimumPresenceSeconds", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Confidence</label>
                            <Input
                              value={workingAtHeightFormState.confidenceThreshold}
                              onChange={(event) => handleWorkingAtHeightChange("confidenceThreshold", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">IoU Tracker</label>
                            <Input
                              value={workingAtHeightFormState.iouThreshold}
                              onChange={(event) => handleWorkingAtHeightChange("iouThreshold", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Frame Step</label>
                            <Input
                              value={workingAtHeightFormState.frameStep}
                              onChange={(event) => handleWorkingAtHeightChange("frameStep", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Image Size</label>
                            <Input
                              value={workingAtHeightFormState.imageSize}
                              onChange={(event) => handleWorkingAtHeightChange("imageSize", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Required PPE at Height</label>
                            <Input
                              value={workingAtHeightFormState.requiredPpeAtHeight}
                              onChange={(event) => handleWorkingAtHeightChange("requiredPpeAtHeight", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Alert Cooldown (s)</label>
                            <Input
                              value={workingAtHeightFormState.alertCooldownSeconds}
                              onChange={(event) => handleWorkingAtHeightChange("alertCooldownSeconds", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-medium text-foreground">Operational Notes</label>
                            <Textarea
                              value={workingAtHeightFormState.operationalNotes}
                              onChange={(event) => handleWorkingAtHeightChange("operationalNotes", event.target.value)}
                              className="min-h-[100px]"
                            />
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Model</p>
                      <p className="mt-1 text-sm font-medium break-all">{workingAtHeightFormState.modelPath || "--"}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Ringkasan Config</p>
                      <p className="mt-1 text-sm text-muted-foreground">{workingAtHeightConfigSummary}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Zone Source</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {hasWorkingAtHeightCustomZonePath
                          ? "Menggunakan file zone custom."
                          : hasValidWorkingAtHeightArea
                            ? "Menggunakan editor area Working at Height sebagai zone fallback."
                            : "Belum ada zone valid."}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Required PPE</p>
                      <p className="mt-1 text-sm text-muted-foreground">{workingAtHeightFormState.requiredPpeAtHeight || "--"}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedRunCategories.includes("Operations") && selectedOperationsModules.includes("operations.red-light-violation") ? (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Operations • Red Light Violation</p>
                      <p className="text-xs text-muted-foreground">
                        Konfigurasi vehicle safety untuk persimpangan tambang. Editor area modul Red Light di atas bisa dipakai sebagai fallback stop line saat path config belum diisi.
                      </p>
                    </div>
                    <Dialog open={isRedLightConfigOpen} onOpenChange={setIsRedLightConfigOpen}>
                      <DialogTrigger asChild>
                        <Button type="button" variant="outline">Buka Konfigurasi Red Light</Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Operations • Red Light Violation Configuration</DialogTitle>
                          <DialogDescription>
                            Pengaturan ini dipakai saat sub-modul <code>Red Light Violation</code> dijalankan pada sesi analisis aktif.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-medium text-foreground">Vehicle Model Path</label>
                            <Input
                              value={redLightFormState.vehicleModelPath}
                              onChange={(event) => handleRedLightChange("vehicleModelPath", event.target.value)}
                              placeholder={redLightServerDefaults?.defaultVehicleModelPath || ""}
                            />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-medium text-foreground">Traffic Light Model Path</label>
                            <Input
                              value={redLightFormState.trafficLightModelPath}
                              onChange={(event) => handleRedLightChange("trafficLightModelPath", event.target.value)}
                              placeholder={redLightServerDefaults?.defaultTrafficLightModelPath || ""}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Intersection ID</label>
                            <Input
                              value={redLightFormState.intersectionId}
                              onChange={(event) => handleRedLightChange("intersectionId", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Custom Stop Line Path</label>
                            <Input
                              value={redLightFormState.stopLineConfigPath}
                              onChange={(event) => handleRedLightChange("stopLineConfigPath", event.target.value)}
                              placeholder={redLightServerDefaults?.defaultStopLineConfigPath || ""}
                            />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-medium text-foreground">Vehicle Labels</label>
                            <Input
                              value={redLightFormState.vehicleLabels}
                              onChange={(event) => handleRedLightChange("vehicleLabels", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Red Light Labels</label>
                            <Input
                              value={redLightFormState.redLightLabels}
                              onChange={(event) => handleRedLightChange("redLightLabels", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Green Light Labels</label>
                            <Input
                              value={redLightFormState.greenLightLabels}
                              onChange={(event) => handleRedLightChange("greenLightLabels", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Confidence</label>
                            <Input
                              value={redLightFormState.confidenceThreshold}
                              onChange={(event) => handleRedLightChange("confidenceThreshold", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">IoU Tracker</label>
                            <Input
                              value={redLightFormState.iouThreshold}
                              onChange={(event) => handleRedLightChange("iouThreshold", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Frame Step</label>
                            <Input
                              value={redLightFormState.frameStep}
                              onChange={(event) => handleRedLightChange("frameStep", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Image Size</label>
                            <Input
                              value={redLightFormState.imageSize}
                              onChange={(event) => handleRedLightChange("imageSize", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Crossing Window (s)</label>
                            <Input
                              value={redLightFormState.crossingWindowSeconds}
                              onChange={(event) => handleRedLightChange("crossingWindowSeconds", event.target.value)}
                            />
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Vehicle Model</p>
                      <p className="mt-1 text-sm font-medium break-all">{redLightFormState.vehicleModelPath || "--"}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Traffic Light Model</p>
                      <p className="mt-1 text-sm font-medium break-all">{redLightFormState.trafficLightModelPath || "--"}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Intersection</p>
                      <p className="mt-1 text-sm text-muted-foreground">{redLightFormState.intersectionId || "--"}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Ringkasan Config</p>
                      <p className="mt-1 text-sm text-muted-foreground">{redLightConfigSummary}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/50 p-3 md:col-span-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Stop Line Source</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {hasRedLightCustomStopLinePath
                          ? "Menggunakan file stop line custom."
                          : hasValidRedLightArea
                            ? "Menggunakan editor area Red Light sebagai fallback stop line."
                            : "Belum ada stop line valid."}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedRunCategories.includes("Operations") && selectedOperationsModules.includes("operations.dump-truck-bed-open") ? (
                <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4 space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Operations • Dump Truck Bed Open</p>
                      <p className="text-xs text-muted-foreground">
                        Konfigurasi vehicle safety untuk hauling road atau area perpindahan dump truck. ROI editor di atas bisa dipakai sebagai fallback zone saat path config belum diisi.
                      </p>
                    </div>
                    <Dialog open={isDumpTruckConfigOpen} onOpenChange={setIsDumpTruckConfigOpen}>
                      <DialogTrigger asChild>
                        <Button type="button" variant="outline">Buka Konfigurasi Dump Truck</Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Operations • Dump Truck Bed Open Configuration</DialogTitle>
                          <DialogDescription>
                            Pengaturan ini dipakai saat sub-modul <code>Dump Truck Bed Open</code> dijalankan pada sesi analisis aktif.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-medium text-foreground">Model Path Dump Truck</label>
                            <Input
                              value={dumpTruckFormState.modelPath}
                              onChange={(event) => handleDumpTruckChange("modelPath", event.target.value)}
                              placeholder={dumpTruckServerDefaults?.defaultModelPath || ""}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">ROI ID</label>
                            <Input
                              value={dumpTruckFormState.roiId}
                              onChange={(event) => handleDumpTruckChange("roiId", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Custom ROI Path</label>
                            <Input
                              value={dumpTruckFormState.roiConfigPath}
                              onChange={(event) => handleDumpTruckChange("roiConfigPath", event.target.value)}
                              placeholder={dumpTruckServerDefaults?.defaultRoiConfigPath || ""}
                            />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-medium text-foreground">Truck Labels</label>
                            <Input
                              value={dumpTruckFormState.truckLabels}
                              onChange={(event) => handleDumpTruckChange("truckLabels", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Bed Open Labels</label>
                            <Input
                              value={dumpTruckFormState.bedOpenLabels}
                              onChange={(event) => handleDumpTruckChange("bedOpenLabels", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Bed Closed Labels</label>
                            <Input
                              value={dumpTruckFormState.bedClosedLabels}
                              onChange={(event) => handleDumpTruckChange("bedClosedLabels", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Confidence</label>
                            <Input
                              value={dumpTruckFormState.confidenceThreshold}
                              onChange={(event) => handleDumpTruckChange("confidenceThreshold", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">IoU Tracker</label>
                            <Input
                              value={dumpTruckFormState.iouThreshold}
                              onChange={(event) => handleDumpTruckChange("iouThreshold", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Frame Step</label>
                            <Input
                              value={dumpTruckFormState.frameStep}
                              onChange={(event) => handleDumpTruckChange("frameStep", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Image Size</label>
                            <Input
                              value={dumpTruckFormState.imageSize}
                              onChange={(event) => handleDumpTruckChange("imageSize", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Movement Threshold</label>
                            <Input
                              value={dumpTruckFormState.movementThreshold}
                              onChange={(event) => handleDumpTruckChange("movementThreshold", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Minimum Moving Seconds</label>
                            <Input
                              value={dumpTruckFormState.minimumMovingSeconds}
                              onChange={(event) => handleDumpTruckChange("minimumMovingSeconds", event.target.value)}
                            />
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Model</p>
                      <p className="mt-1 text-sm font-medium break-all">{dumpTruckFormState.modelPath || "--"}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Ringkasan Config</p>
                      <p className="mt-1 text-sm text-muted-foreground">{dumpTruckConfigSummary}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">ROI Source</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {hasDumpTruckCustomRoiPath
                          ? "Menggunakan file ROI custom."
                          : hasValidDumpTruckArea
                            ? "Menggunakan editor area Dump Truck sebagai fallback zone."
                            : "Belum ada ROI valid."}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Truck Labels</p>
                      <p className="mt-1 text-sm text-muted-foreground">{dumpTruckFormState.truckLabels || "--"}</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-5">
              <div className="rounded-lg border bg-secondary/20 p-4 space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Status Run Aktif</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      (analysisJob?.status === "completed" ||
                        workingAtHeightJob?.status === "completed" ||
                        operationsJob?.status === "completed")
                        ? "default"
                        : (analysisJob?.status === "failed" ||
                            workingAtHeightJob?.status === "failed" ||
                            operationsJob?.status === "failed")
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {activeOperationsModule
                      ? operationsJob?.status === "queued"
                        ? "Queued"
                        : operationsJob?.status === "running"
                          ? "Running"
                          : operationsJob?.status === "completed"
                            ? "Completed"
                            : operationsJob?.status === "failed"
                              ? "Failed"
                              : analysisJobStatusLabel
                      : activeHseModule === "hse.working-at-height"
                      ? workingAtHeightJob?.status === "queued"
                        ? "Queued"
                        : workingAtHeightJob?.status === "running"
                          ? "Running"
                          : workingAtHeightJob?.status === "completed"
                            ? "Completed"
                            : workingAtHeightJob?.status === "failed"
                              ? "Failed"
                              : analysisJobStatusLabel
                      : analysisJobStatusLabel}
                  </Badge>
                  {(analysisJob || workingAtHeightJob || activeRunModuleLabel !== "--") ? (
                    <Badge variant="outline">{activeRunModuleLabel}</Badge>
                  ) : null}
                  {analysisJob?.runId ? <Badge variant="outline">{analysisJob.runId}</Badge> : null}
                  {workingAtHeightJob?.runId ? <Badge variant="outline">{workingAtHeightJob.runId}</Badge> : null}
                  {operationsJob?.runId ? <Badge variant="outline">{operationsJob.runId}</Badge> : null}
                </div>
                <p className="text-sm font-medium break-all">
                  {outputDir ||
                    workingAtHeightServerDefaults?.analysisOutputRoot ||
                    serverDefaults?.analysisOutputRoot ||
                    "-"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {workingAtHeightJob?.message ||
                    operationsJob?.message ||
                    analysisJob?.message ||
                    "Job PPE/HSE/Operations memakai background worker. Hasil sesi akan tampil setelah worker selesai. Jika beberapa sub-modul dipilih, semuanya dijalankan berurutan."}
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
                  onClick={() => {
                    if (!hasSelectedHseModule) {
                      toast({
                        title: "Pilih modul HSE terlebih dulu",
                        description: "Centang minimal satu sub-modul HSE sebelum menjalankan ulang assessment.",
                        variant: "destructive",
                      });
                      return;
                    }
                    setIsAnalyzing(true);
                    setQueuedHseModules(selectedHseModules);
                    runNextQueuedHseModule();
                  }}
                  disabled={!canRunHse || isRunningHse}
                  className="gap-2"
                >
                  {isRunningHse ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  Jalankan Ulang Modul HSE
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
                  {groupedReviewFindings.length > 0 ? (
                    <Badge variant="outline">{groupedReviewFindings.length} needs review</Badge>
                  ) : null}
                </div>
                <p className="text-sm leading-7 text-foreground">
                  Source ini saat ini memiliki {unifiedSummary.totalFindings} finding gabungan dari modul yang dijalankan.
                  Severity tertinggi adalah {unifiedSummary.highSeverityCount > 0 ? "high" : unifiedSummary.mediumSeverityCount > 0 ? "medium" : "low"}.
                </p>
                {groupedReviewFindings.length > 0 ? (
                  <p className="text-xs leading-6 text-muted-foreground">
                    {groupedReviewFindings.length} indikasi tambahan masih berstatus <span className="text-foreground">needs review</span> dan tidak dihitung sebagai violation final di summary maupun HSE.
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
                  <p className="text-2xl font-semibold">{groupedReviewFindings.length}</p>
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
              {(sourceSupportsHse || hseReport) && hasSessionResults ? (
                <div className="rounded-lg border bg-secondary/20 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">AI HSE Narrative Assistant</p>
                      <p className="text-sm text-muted-foreground">
                        Gunakan Gemma 4 untuk menyusun narasi supervisor dari evidence PPE/HSE pada sesi aktif.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      disabled={!aiAssistEnabled || isGeneratingAiHseNarrative}
                      onClick={handleGenerateHseNarrative}
                    >
                      {isGeneratingAiHseNarrative ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ClipboardCheck className="w-4 h-4" />
                      )}
                      Buat Narasi AI
                    </Button>
                  </div>
                  {!aiAssistEnabled ? (
                    <p className="text-xs text-muted-foreground">
                      AI assist belum aktif. Aktifkan provider Gemma 4 dari halaman <code>Settings</code>.
                    </p>
                  ) : null}
                  {aiHseNarrative ? (
                    <div className="rounded-lg border border-border bg-background/50 p-4 text-sm leading-7 text-foreground">
                      {aiHseNarrative}
                    </div>
                  ) : null}
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
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              disabled={!aiAssistEnabled || aiSummarizingFindingIds[finding.id]}
                              onClick={() => void handleGenerateOperatorSummary(finding)}
                            >
                              {aiSummarizingFindingIds[finding.id] ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <ClipboardCheck className="w-4 h-4" />
                              )}
                              Ringkas Incident
                            </Button>
                            {!aiAssistEnabled ? (
                              <span className="text-xs text-muted-foreground">
                                Aktifkan AI assist di <code>Settings</code>.
                              </span>
                            ) : null}
                          </div>
                          {aiIncidentSummaries[finding.id] ? (
                            <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">AI Operator Summary</p>
                              <p className="text-sm text-foreground">{aiIncidentSummaries[finding.id].summary}</p>
                              {aiIncidentSummaries[finding.id].actions.length > 0 ? (
                                <div className="text-xs text-muted-foreground">
                                  Tindak lanjut:{" "}
                                  <span className="text-foreground">
                                    {aiIncidentSummaries[finding.id].actions.join(" • ")}
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
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

      {hasSessionResults && groupedReviewFindings.length > 0 ? (
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
                  {groupedReviewFindings.map((finding) => (
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
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              disabled={!aiAssistEnabled || aiVerifyingFindingIds[finding.id]}
                              onClick={() => void handleVerifyNeedsReview(finding)}
                            >
                              {aiVerifyingFindingIds[finding.id] ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <ClipboardCheck className="w-4 h-4" />
                              )}
                              AI Verify
                            </Button>
                            {!aiAssistEnabled ? (
                              <span className="text-xs text-muted-foreground">
                                Aktifkan AI assist di <code>Settings</code>.
                              </span>
                            ) : null}
                          </div>
                          {aiNeedsReviewResults[finding.id] ? (
                            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">AI: {aiNeedsReviewResults[finding.id].verdict}</Badge>
                                <Badge variant="outline">
                                  Confidence {aiNeedsReviewResults[finding.id].confidence}
                                </Badge>
                              </div>
                              <p className="text-sm text-foreground">{aiNeedsReviewResults[finding.id].rationale}</p>
                              <p className="text-xs text-muted-foreground">
                                Saran AI:{" "}
                                <span className="text-foreground">
                                  {aiNeedsReviewResults[finding.id].recommendedAction}
                                </span>
                              </p>
                            </div>
                          ) : null}
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
        </div>
      )}

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
