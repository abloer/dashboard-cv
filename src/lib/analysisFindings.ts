export type AnalysisFindingCategory = "PPE" | "HSE" | "Operations" | "Fleet & KPI";

export type AnalysisFindingModuleKey =
  | "ppe.no-helmet"
  | "ppe.no-safety-vest"
  | "hse.safety-rules"
  | "operations.people-count"
  | "fleet.kpi";

export type AnalysisFindingSeverity = "low" | "medium" | "high";
export type AnalysisFindingStatus = "open" | "acknowledged" | "resolved" | "dismissed" | "uncertain";
export type AnalysisFindingSourceType = "upload" | "camera";

export interface AnalysisFinding {
  id: string;
  runId: string;
  sourceId: string;
  sourceName: string;
  sourceLocation: string;
  sourceType: AnalysisFindingSourceType;
  category: AnalysisFindingCategory;
  moduleKey: AnalysisFindingModuleKey;
  findingType: string;
  title: string;
  detail: string;
  recommendation: string;
  severity: AnalysisFindingSeverity;
  status: AnalysisFindingStatus;
  riskScore: number | null;
  metric: string | null;
  eventCount: number;
  violatorCount: number;
  startsAtSeconds: number | null;
  endsAtSeconds: number | null;
  durationSeconds: number | null;
  roiId: string | null;
  zoneIds: string[];
  requiredPpe: string[];
  trackIds: number[];
  labels: string[];
  snapshotUrl: string | null;
  evidenceUrls: string[];
  detectorEvidence: {
    analysisType: string | null;
    outputDir: string | null;
    createdAt: string | null;
  };
  configSnapshot: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface FindingsAggregateSummary {
  totalFindings: number;
  openFindings: number;
  highSeverityCount: number;
  mediumSeverityCount: number;
  lowSeverityCount: number;
  latestCreatedAt: string | null;
  categoryCounts: Record<AnalysisFindingCategory, number>;
  moduleCounts: Record<string, number>;
}

export const buildFindingsAggregate = (
  findings: AnalysisFinding[]
): FindingsAggregateSummary => {
  const countableFindings = findings.filter((item) => item.status !== "uncertain");
  const summary: FindingsAggregateSummary = {
    totalFindings: countableFindings.length,
    openFindings: countableFindings.filter((item) => item.status === "open").length,
    highSeverityCount: countableFindings.filter((item) => item.severity === "high").length,
    mediumSeverityCount: countableFindings.filter((item) => item.severity === "medium").length,
    lowSeverityCount: countableFindings.filter((item) => item.severity === "low").length,
    latestCreatedAt: null,
    categoryCounts: {
      PPE: 0,
      HSE: 0,
      Operations: 0,
      "Fleet & KPI": 0,
    },
    moduleCounts: {},
  };

  countableFindings.forEach((finding) => {
    summary.categoryCounts[finding.category] += 1;
    summary.moduleCounts[finding.moduleKey] = (summary.moduleCounts[finding.moduleKey] || 0) + 1;
    if (!summary.latestCreatedAt || new Date(finding.createdAt) > new Date(summary.latestCreatedAt)) {
      summary.latestCreatedAt = finding.createdAt;
    }
  });

  return summary;
};

export const moduleKeyLabel: Record<string, string> = {
  "ppe.no-helmet": "PPE • No Helmet",
  "ppe.no-safety-vest": "PPE • No Safety Vest",
  "hse.safety-rules": "HSE • Safety Rules",
  "operations.people-count": "Operations • People Count",
  "fleet.kpi": "Fleet & KPI",
};
