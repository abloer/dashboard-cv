import { analysisServerBaseUrl } from "@/lib/noHelmetAnalysis";
import type { AnalysisFinding } from "@/lib/analysisFindings";
import type { MediaExecutionMode, MediaMonitoringStatus, MediaStatus, MediaType } from "@/lib/mediaRegistry";
import type { SafetyRulesModuleConfig } from "@/lib/safetyRulesConfig";

export type HseFindingSeverity = "low" | "medium" | "high";
export type HseReadinessStatus = "ready" | "warning" | "missing";
export type HseRiskLevel = "low" | "medium" | "high";

export interface HseSafetyRulesReport {
  id: string;
  analysisType: "hse_safety_rules";
  outputDir: string;
  createdAt: string;
  source: {
    id: string;
    name: string;
    location: string;
    type: MediaType;
    status: MediaStatus;
    analytics: string[];
    executionMode: MediaExecutionMode;
    monitoringStatus: MediaMonitoringStatus;
    monitoringIntervalSeconds: number | null;
  };
  configSnapshot: SafetyRulesModuleConfig;
  readiness: {
    readyCount: number;
    totalCount: number;
    items: Array<{
      id: string;
      label: string;
      status: HseReadinessStatus;
      detail: string;
    }>;
  };
  latestEvidence: null | {
    analysisType: "no_helmet";
    createdAt: string;
    eventCount: number;
    violatorCount: number;
    snapshotCount: number;
    narrative: string;
    outputDir: string;
    latestSnapshotUrl: string | null;
  };
  findings: Array<{
    id: string;
    title: string;
    severity: HseFindingSeverity;
    status: "open" | "resolved";
    detail: string;
    recommendation: string;
    metric?: string;
  }>;
  analysisFindings: AnalysisFinding[];
  summary: {
    riskLevel: HseRiskLevel;
    openFindingCount: number;
    highSeverityCount: number;
    mediumSeverityCount: number;
    lowSeverityCount: number;
    latestNoHelmetEventCount: number;
    latestNoHelmetViolatorCount: number;
    requiredPpe: string[];
    restrictedZones: string[];
    generatedAt: string;
    narrative: string;
  };
}

interface HseDefaultsResponse {
  ok: boolean;
  moduleKey: "safety-rules";
  analysisOutputRoot: string;
  config: SafetyRulesModuleConfig;
}

interface HseLatestReportResponse {
  ok: boolean;
  source: HseSafetyRulesReport["source"];
  latestReport: HseSafetyRulesReport | null;
}

interface HseRunResponse {
  ok: boolean;
  report: HseSafetyRulesReport;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "Request failed.");
  }
  return payload as T;
}

export async function getHseSafetyRulesDefaults(): Promise<HseDefaultsResponse> {
  const response = await fetch(`${analysisServerBaseUrl}/analysis/hse-safety-rules/defaults`);
  return parseResponse<HseDefaultsResponse>(response);
}

export async function getLatestHseSafetyRulesReport(
  mediaSourceId: string
): Promise<HseLatestReportResponse> {
  const response = await fetch(
    `${analysisServerBaseUrl}/analysis/hse-safety-rules/source/${encodeURIComponent(mediaSourceId)}/latest`
  );
  return parseResponse<HseLatestReportResponse>(response);
}

export async function runHseSafetyRulesAssessment(
  mediaSourceId: string
): Promise<HseRunResponse> {
  const response = await fetch(`${analysisServerBaseUrl}/analysis/hse-safety-rules`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mediaSourceId }),
  });
  return parseResponse<HseRunResponse>(response);
}
