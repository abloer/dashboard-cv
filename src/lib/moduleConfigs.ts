import { analysisServerBaseUrl } from "@/lib/noHelmetAnalysis";

interface ModuleConfigResponse<T> {
  ok: boolean;
  moduleKey: string;
  config: T;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "Request failed.");
  }
  return payload as T;
}

export async function getModuleConfig<T>(moduleKey: string): Promise<T> {
  const response = await fetch(`${analysisServerBaseUrl}/module-configs/${encodeURIComponent(moduleKey)}`);
  const payload = await parseResponse<ModuleConfigResponse<T>>(response);
  return payload.config;
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
