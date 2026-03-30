import { analysisServerBaseUrl } from "@/lib/noHelmetAnalysis";
import type { ModelDatasetDomain, ModelTargetModule } from "@/lib/models";

interface ModuleConfigResponse<T> {
  ok: boolean;
  moduleKey: string;
  config: T;
  resolvedModelPath?: string;
  modelSource?: "deployment-gate" | "manual";
  activeModel?: ModuleConfigActiveModel | null;
}

export interface ModuleConfigActiveModel {
  id: string;
  name: string;
  moduleKey: ModelTargetModule;
  domain: ModelDatasetDomain;
  labels: string[];
  modelPath: string;
  status: "candidate" | "approved" | "active" | "rejected";
  updatedAt: string;
}

export interface ModuleConfigEnvelope<T> {
  moduleKey: string;
  config: T;
  resolvedModelPath: string | null;
  modelSource: "deployment-gate" | "manual";
  activeModel: ModuleConfigActiveModel | null;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "Request failed.");
  }
  return payload as T;
}

export async function getModuleConfig<T>(moduleKey: string): Promise<T> {
  const payload = await getModuleConfigEnvelope<T>(moduleKey);
  return payload.config;
}

export async function getModuleConfigEnvelope<T>(moduleKey: string): Promise<ModuleConfigEnvelope<T>> {
  const response = await fetch(`${analysisServerBaseUrl}/module-configs/${encodeURIComponent(moduleKey)}`);
  const payload = await parseResponse<ModuleConfigResponse<T>>(response);
  return {
    moduleKey: payload.moduleKey,
    config: payload.config,
    resolvedModelPath: payload.resolvedModelPath ?? null,
    modelSource: payload.modelSource ?? "manual",
    activeModel: payload.activeModel ?? null,
  };
}

export async function updateModuleConfig<T>(moduleKey: string, config: T): Promise<T> {
  const response = await fetch(`${analysisServerBaseUrl}/module-configs/${encodeURIComponent(moduleKey)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(config),
  });
  const payload = await parseResponse<ModuleConfigResponse<T>>(response);
  return payload.config;
}
