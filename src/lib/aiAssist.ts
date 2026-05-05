import { analysisServerBaseUrl } from "@/lib/noHelmetAnalysis";

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "Request failed.");
  }
  return payload as T;
}

export interface AiAssistConfig {
  enabled: boolean;
  mode: "remote-openai" | "local";
  baseUrl: string;
  apiKey: string;
  gemmaModel: string;
  requestTimeoutMs: number;
  localOllamaBaseUrl: string;
  localGemmaModel: string;
}

export interface NeedsReviewAiVerdict {
  verdict: "violation" | "compliant" | "needs_review";
  confidence: "low" | "medium" | "high";
  rationale: string;
  recommendedAction: string;
}

export interface OperatorIncidentAiSummary {
  summary: string;
  actions: string[];
}

export interface AiAssistLocalStatus {
  mode: "remote-openai" | "local";
  ollamaReachable: boolean;
  ollamaError: string;
  localGemmaModel: string;
  localGemmaInstalled: boolean;
  localVisionRuntime: string;
  installedModels: string[];
}

export async function getAiAssistConfig(): Promise<{ ok: true; config: AiAssistConfig }> {
  const response = await fetch(`${analysisServerBaseUrl}/ai-assist/config`);
  return parseResponse<{ ok: true; config: AiAssistConfig }>(response);
}

export async function updateAiAssistConfig(
  payload: Partial<AiAssistConfig>
): Promise<{ ok: true; config: AiAssistConfig }> {
  const response = await fetch(`${analysisServerBaseUrl}/ai-assist/config`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ ok: true; config: AiAssistConfig }>(response);
}

export async function getAiAssistLocalStatus(): Promise<{ ok: true; status: AiAssistLocalStatus }> {
  const response = await fetch(`${analysisServerBaseUrl}/ai-assist/status`);
  return parseResponse<{ ok: true; status: AiAssistLocalStatus }>(response);
}

export async function verifyNeedsReviewFinding(payload: {
  finding: {
    id?: string;
    moduleKey?: string;
    title: string;
    detail: string;
    recommendation?: string;
    metric?: string | null;
    snapshotUrl?: string | null;
    sourceName?: string;
    sourceLocation?: string;
  };
}): Promise<{ ok: true; result: NeedsReviewAiVerdict }> {
  const response = await fetch(`${analysisServerBaseUrl}/ai-assist/needs-review-verdict`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ ok: true; result: NeedsReviewAiVerdict }>(response);
}

export async function generateHseNarrative(payload: {
  source?: {
    name?: string;
    location?: string;
    analytics?: string[];
  };
  report?: unknown;
  findings?: unknown[];
}): Promise<{ ok: true; result: { narrative: string } }> {
  const response = await fetch(`${analysisServerBaseUrl}/ai-assist/hse-narrative`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ ok: true; result: { narrative: string } }>(response);
}

export async function generateOperatorIncidentSummary(payload: {
  source?: {
    name?: string;
    location?: string;
    type?: string;
  };
  finding: {
    id?: string;
    moduleKey?: string;
    title: string;
    detail: string;
    recommendation?: string;
    metric?: string | null;
    severity?: string;
    snapshotUrl?: string | null;
  };
}): Promise<{ ok: true; result: OperatorIncidentAiSummary }> {
  const response = await fetch(`${analysisServerBaseUrl}/ai-assist/operator-summary`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ ok: true; result: OperatorIncidentAiSummary }>(response);
}
