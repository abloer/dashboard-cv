import { analysisServerBaseUrl, apiFetch } from "@/lib/noHelmetAnalysis";
import type { components } from "@/lib/apiContract";
import type { ModelDatasetDomain, ModelTargetModule } from "@/lib/models";

type ApiModuleConfigResponse = components["schemas"]["ModuleConfigResponse"];
type ApiModuleConfigMutation = components["schemas"]["ModuleConfigMutation"];

interface ModuleConfigResponse<T> extends Omit<ApiModuleConfigResponse, "config" | "activeModel"> {
  ok: boolean;
  config: T;
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
  version: number;
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
  const response = await apiFetch(`${analysisServerBaseUrl}/module-configs/${encodeURIComponent(moduleKey)}`);
  const payload = await parseResponse<ModuleConfigResponse<T>>(response);
  return {
    moduleKey: payload.moduleKey,
    version: payload.version,
    config: payload.config,
    resolvedModelPath: payload.resolvedModelPath ?? null,
    modelSource: payload.modelSource ?? "manual",
    activeModel: payload.activeModel ?? null,
  };
}

export async function updateModuleConfig<T>(moduleKey: string, config: T, expectedVersion: number): Promise<ModuleConfigEnvelope<T>> {
  const requestBody = { config, expectedVersion } satisfies ApiModuleConfigMutation;
  const response = await apiFetch(`${analysisServerBaseUrl}/module-configs/${encodeURIComponent(moduleKey)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const payload = await parseResponse<ModuleConfigResponse<T>>(response);
  return {
    moduleKey: payload.moduleKey,
    version: payload.version,
    config: payload.config,
    resolvedModelPath: payload.resolvedModelPath ?? null,
    modelSource: payload.modelSource ?? "manual",
    activeModel: payload.activeModel ?? null,
  };
}
