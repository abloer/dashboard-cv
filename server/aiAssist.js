const express = require("express");
const fs = require("fs");
const path = require("path");
const { z } = require("zod");

const DEFAULT_AI_ASSIST_CONFIG = {
  enabled: false,
  mode: "local",
  baseUrl: "http://127.0.0.1:11434/v1",
  apiKey: "",
  gemmaModel: "gemma-4",
  requestTimeoutMs: 30000,
  localOllamaBaseUrl: "http://127.0.0.1:11434",
  localGemmaModel: "gemma4:e2b",
};

const aiAssistConfigSchema = z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(["remote-openai", "local"]).default("local"),
  baseUrl: z.string().trim().min(1),
  apiKey: z.string().default(""),
  gemmaModel: z.string().trim().min(1),
  requestTimeoutMs: z.number().int().min(1000).max(120000).default(30000),
  localOllamaBaseUrl: z.string().trim().min(1).default("http://127.0.0.1:11434"),
  localGemmaModel: z.string().trim().min(1).default("gemma4:e2b"),
});

const updateAiAssistConfigPayloadSchema = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(["remote-openai", "local"]).optional(),
  baseUrl: z.string().trim().min(1).optional(),
  apiKey: z.string().optional(),
  gemmaModel: z.string().trim().min(1).optional(),
  requestTimeoutMs: z.number().int().min(1000).max(120000).optional(),
  localOllamaBaseUrl: z.string().trim().min(1).optional(),
  localGemmaModel: z.string().trim().min(1).optional(),
});

const aiNeedsReviewPayloadSchema = z.object({
  finding: z.object({
    id: z.string().trim().min(1).optional(),
    moduleKey: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1),
    detail: z.string().trim().min(1),
    recommendation: z.string().trim().min(1).optional().default(""),
    metric: z.string().nullable().optional().default(null),
    snapshotUrl: z.string().trim().min(1).nullable().optional().default(null),
    sourceName: z.string().trim().min(1).optional().default(""),
    sourceLocation: z.string().trim().min(1).optional().default(""),
  }),
});

const aiHseNarrativePayloadSchema = z.object({
  source: z
    .object({
      name: z.string().trim().min(1).optional().default(""),
      location: z.string().trim().min(1).optional().default(""),
      analytics: z.array(z.string()).optional().default([]),
    })
    .optional()
    .default({}),
  report: z.unknown().optional().default(null),
  findings: z.array(z.unknown()).optional().default([]),
});

const aiOperatorSummaryPayloadSchema = z.object({
  source: z
    .object({
      name: z.string().trim().min(1).optional().default(""),
      location: z.string().trim().min(1).optional().default(""),
      type: z.string().trim().min(1).optional().default(""),
    })
    .optional()
    .default({}),
  finding: z.object({
    id: z.string().trim().min(1).optional(),
    moduleKey: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1),
    detail: z.string().trim().min(1),
    recommendation: z.string().trim().min(1).optional().default(""),
    metric: z.string().nullable().optional().default(null),
    severity: z.string().trim().min(1).optional().default("medium"),
    snapshotUrl: z.string().trim().min(1).nullable().optional().default(null),
  }),
});

const safeJsonStringify = (value) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch (_error) {
    return String(value);
  }
};

const inferMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
};

const extractAssistantText = (payload) => {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item?.type === "text" && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .join("\n")
      .trim();
  }
  return "";
};

const parseJsonFromAssistantText = (text) => {
  if (!text) {
    throw new Error("AI model returned an empty response.");
  }

  const direct = (() => {
    try {
      return JSON.parse(text);
    } catch (_error) {
      return null;
    }
  })();
  if (direct) {
    return direct;
  }

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("AI model response is not valid JSON.");
  }

  return JSON.parse(match[0]);
};

const createAiAssistBoundary = ({
  aiAssistConfigPath,
  analysisOutputRoot,
  fileExists = fs.existsSync,
  fetchImpl = fetch,
} = {}) => {
  const router = express.Router();
  const analysisOutputRealRoot = fs.realpathSync.native(analysisOutputRoot);
  const isPathInsideAnalysisOutputRoot = (candidatePath) => {
    const relativePath = path.relative(analysisOutputRealRoot, candidatePath);
    return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
  };

  const readAiAssistConfig = () => {
    if (!fileExists(aiAssistConfigPath)) {
      fs.writeFileSync(aiAssistConfigPath, JSON.stringify(DEFAULT_AI_ASSIST_CONFIG, null, 2));
      return DEFAULT_AI_ASSIST_CONFIG;
    }

    const raw = fs.readFileSync(aiAssistConfigPath, "utf8");
    const parsed = aiAssistConfigSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      fs.writeFileSync(aiAssistConfigPath, JSON.stringify(DEFAULT_AI_ASSIST_CONFIG, null, 2));
      return DEFAULT_AI_ASSIST_CONFIG;
    }

    return parsed.data;
  };

  const writeAiAssistConfig = (config) => {
    const parsed = aiAssistConfigSchema.parse(config);
    fs.writeFileSync(aiAssistConfigPath, JSON.stringify(parsed, null, 2));
    return parsed;
  };

  const resolveAnalysisOutputFilePath = (candidate) => {
    if (!candidate || typeof candidate !== "string") {
      return null;
    }

    const trimmed = candidate.trim();
    if (!trimmed) {
      return null;
    }

    try {
      let relativePath = null;
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        const url = new URL(trimmed);
        if (!url.pathname.startsWith("/analysis-output/")) {
          return null;
        }
        relativePath = decodeURIComponent(url.pathname.replace(/^\/analysis-output\//, ""));
      }

      if (relativePath === null && trimmed.startsWith("/analysis-output/")) {
        relativePath = decodeURIComponent(trimmed.replace(/^\/analysis-output\//, ""));
      }

      if (relativePath === null || path.isAbsolute(relativePath)) {
        return null;
      }

      const absolutePath = path.resolve(analysisOutputRealRoot, relativePath);
      const realPath = fs.realpathSync.native(absolutePath);
      if (!isPathInsideAnalysisOutputRoot(realPath) || !fileExists(realPath)) {
        return null;
      }
      return realPath;
    } catch (_error) {
      return null;
    }

    return null;
  };

  const buildImageDataUrl = (candidate) => {
    const resolvedPath = resolveAnalysisOutputFilePath(candidate);
    if (!resolvedPath || !fileExists(resolvedPath)) {
      return null;
    }

    const fileBuffer = fs.readFileSync(resolvedPath);
    return `data:${inferMimeType(resolvedPath)};base64,${fileBuffer.toString("base64")}`;
  };

  const callAiAssistChatCompletion = async ({ config, model, systemPrompt, userPrompt, imageDataUrl = null }) => {
    const baseUrl = config.baseUrl.replace(/\/$/, "");
    const headers = {
      "Content-Type": "application/json",
    };
    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    const messages = [{ role: "system", content: systemPrompt }];
    if (imageDataUrl) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      });
    } else {
      messages.push({ role: "user", content: userPrompt });
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), config.requestTimeoutMs);

    try {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          temperature: 0.1,
          messages,
        }),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error?.message || payload?.message || "AI assist request failed.");
      }

      const assistantText = extractAssistantText(payload);
      return {
        rawText: assistantText,
        parsed: parseJsonFromAssistantText(assistantText),
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  };

  const callLocalOllamaChat = async ({ config, model, systemPrompt, userPrompt, imageDataUrl = null }) => {
    const baseUrl = config.localOllamaBaseUrl.replace(/\/$/, "");
    const imageBase64 = imageDataUrl
      ? imageDataUrl.replace(/^data:[^;]+;base64,/, "")
      : null;

    const response = await fetchImpl(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: systemPrompt },
          imageBase64
            ? {
                role: "user",
                content: userPrompt,
                images: [imageBase64],
              }
            : {
                role: "user",
                content: userPrompt,
              },
        ],
        options: {
          temperature: 0.1,
        },
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || payload?.message || "Local Ollama request failed.");
    }

    const assistantText = payload?.message?.content?.trim?.() || "";
    return {
      rawText: assistantText,
      parsed: parseJsonFromAssistantText(assistantText),
    };
  };

  const getAiAssistLocalRuntimeStatus = async (config) => {
    const baseUrl = (config.localOllamaBaseUrl || "http://127.0.0.1:11434").replace(/\/$/, "");

    let ollamaReachable = false;
    let installedModels = [];
    let gemmaInstalled = false;
    let ollamaError = "";

    try {
      const response = await fetchImpl(`${baseUrl}/api/tags`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || payload?.message || "Ollama runtime tidak merespons.");
      }

      ollamaReachable = true;
      installedModels = Array.isArray(payload?.models) ? payload.models.map((item) => item?.name).filter(Boolean) : [];
      gemmaInstalled = installedModels.includes(config.localGemmaModel);
    } catch (error) {
      ollamaError = error instanceof Error ? error.message : "Ollama runtime tidak tersedia.";
    }

    return {
      mode: config.mode,
      ollamaReachable,
      ollamaError,
      localGemmaModel: config.localGemmaModel,
      localGemmaInstalled: gemmaInstalled,
      localVisionRuntime: "Gemma 4 via Ollama",
      installedModels,
    };
  };

  router.get("/ai-assist/config", (_req, res) => {
    return res.json({
      ok: true,
      config: readAiAssistConfig(),
    });
  });

  router.get("/ai-assist/status", async (_req, res) => {
    try {
      const config = readAiAssistConfig();
      const status = await getAiAssistLocalRuntimeStatus(config);
      return res.json({
        ok: true,
        status,
      });
    } catch (error) {
      return res.status(502).json({
        ok: false,
        message: error instanceof Error ? error.message : "Gagal memuat status AI assist.",
      });
    }
  });

  router.patch("/ai-assist/config", (req, res) => {
    const parsed = updateAiAssistConfigPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid AI assist config payload.",
        errors: parsed.error.flatten(),
      });
    }

    const current = readAiAssistConfig();
    const next = writeAiAssistConfig({
      ...current,
      ...parsed.data,
    });

    return res.json({
      ok: true,
      config: next,
    });
  });

  router.post("/ai-assist/needs-review-verdict", async (req, res) => {
    const parsed = aiNeedsReviewPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid needs review payload.",
        errors: parsed.error.flatten(),
      });
    }

    const config = readAiAssistConfig();
    if (!config.enabled) {
      return res.status(400).json({ ok: false, message: "AI assist belum diaktifkan di Settings." });
    }

    const { finding } = parsed.data;
    const imageDataUrl = buildImageDataUrl(finding.snapshotUrl);

    try {
      const systemPrompt =
        "Anda adalah verifier visual untuk sistem surveillance keselamatan. Balas JSON saja dengan field: verdict (violation|compliant|needs_review), confidence (low|medium|high), rationale, recommendedAction. Jangan mengarang detail di luar bukti visual dan detail finding.";
      const userPrompt = [
        "Verifikasi finding needs review berikut.",
        `Source: ${finding.sourceName || "-"}`,
        `Lokasi: ${finding.sourceLocation || "-"}`,
        `Modul: ${finding.moduleKey || "-"}`,
        `Judul: ${finding.title}`,
        `Detail: ${finding.detail}`,
        `Metric: ${finding.metric || "-"}`,
        `Rekomendasi sistem: ${finding.recommendation || "-"}`,
        "Tentukan apakah ini lebih tepat dianggap violation final, compliant, atau tetap needs_review.",
      ].join("\n");

      const aiResponse =
        config.mode === "local"
          ? await callLocalOllamaChat({
              config,
              model: config.localGemmaModel,
              systemPrompt,
              userPrompt,
              imageDataUrl,
            })
          : await callAiAssistChatCompletion({
              config,
              model: config.gemmaModel,
              systemPrompt,
              userPrompt,
              imageDataUrl,
            });

      const { parsed: result, rawText } = aiResponse;

      return res.json({
        ok: true,
        result: {
          verdict: result?.verdict || "needs_review",
          confidence: result?.confidence || "medium",
          rationale: result?.rationale || rawText,
          recommendedAction: result?.recommendedAction || finding.recommendation || "Verifikasi operator.",
        },
      });
    } catch (error) {
      return res.status(502).json({
        ok: false,
        message: error instanceof Error ? error.message : "AI verifier request failed.",
      });
    }
  });

  router.post("/ai-assist/hse-narrative", async (req, res) => {
    const parsed = aiHseNarrativePayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid HSE narrative payload.",
        errors: parsed.error.flatten(),
      });
    }

    const config = readAiAssistConfig();
    if (!config.enabled) {
      return res.status(400).json({ ok: false, message: "AI assist belum diaktifkan di Settings." });
    }

    try {
      const systemPrompt =
        "Anda adalah asisten HSE. Balas JSON saja dengan field: narrative. Narasi harus ringkas, operasional, dan cocok dibaca supervisor lapangan.";
      const userPrompt = [
        "Buat narasi HSE dari report berikut.",
        `Source: ${parsed.data.source.name || "-"}`,
        `Lokasi: ${parsed.data.source.location || "-"}`,
        `Kategori: ${(parsed.data.source.analytics || []).join(", ") || "-"}`,
        "Report HSE:",
        safeJsonStringify(parsed.data.report),
        "Findings sesi:",
        safeJsonStringify(parsed.data.findings),
      ].join("\n");

      const { parsed: result, rawText } =
        config.mode === "local"
          ? await callLocalOllamaChat({
              config,
              model: config.localGemmaModel,
              systemPrompt,
              userPrompt,
            })
          : await callAiAssistChatCompletion({
              config,
              model: config.gemmaModel,
              systemPrompt,
              userPrompt,
            });

      return res.json({
        ok: true,
        result: {
          narrative: result?.narrative || rawText,
        },
      });
    } catch (error) {
      return res.status(502).json({
        ok: false,
        message: error instanceof Error ? error.message : "AI HSE narrative request failed.",
      });
    }
  });

  router.post("/ai-assist/operator-summary", async (req, res) => {
    const parsed = aiOperatorSummaryPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid operator summary payload.",
        errors: parsed.error.flatten(),
      });
    }

    const config = readAiAssistConfig();
    if (!config.enabled) {
      return res.status(400).json({ ok: false, message: "AI assist belum diaktifkan di Settings." });
    }

    try {
      const systemPrompt =
        "Anda adalah asisten operator incident surveillance. Balas JSON saja dengan field: summary dan actions (array string). Ringkas, praktis, dan berorientasi tindak lanjut.";
      const userPrompt = [
        "Ringkas incident berikut untuk operator.",
        `Source: ${parsed.data.source.name || "-"}`,
        `Lokasi: ${parsed.data.source.location || "-"}`,
        `Tipe source: ${parsed.data.source.type || "-"}`,
        `Modul: ${parsed.data.finding.moduleKey || "-"}`,
        `Judul: ${parsed.data.finding.title}`,
        `Detail: ${parsed.data.finding.detail}`,
        `Severity: ${parsed.data.finding.severity || "-"}`,
        `Metric: ${parsed.data.finding.metric || "-"}`,
        `Rekomendasi sistem: ${parsed.data.finding.recommendation || "-"}`,
      ].join("\n");

      const { parsed: result, rawText } =
        config.mode === "local"
          ? await callLocalOllamaChat({
              config,
              model: config.localGemmaModel,
              systemPrompt,
              userPrompt,
            })
          : await callAiAssistChatCompletion({
              config,
              model: config.gemmaModel,
              systemPrompt,
              userPrompt,
            });

      return res.json({
        ok: true,
        result: {
          summary: result?.summary || rawText,
          actions: Array.isArray(result?.actions) ? result.actions : [],
        },
      });
    } catch (error) {
      return res.status(502).json({
        ok: false,
        message: error instanceof Error ? error.message : "AI operator summary request failed.",
      });
    }
  });

  return {
    buildImageDataUrl,
    callAiAssistChatCompletion,
    callLocalOllamaChat,
    getAiAssistLocalRuntimeStatus,
    readAiAssistConfig,
    resolveAnalysisOutputFilePath,
    router,
    writeAiAssistConfig,
  };
};

module.exports = {
  DEFAULT_AI_ASSIST_CONFIG,
  aiAssistConfigSchema,
  createAiAssistBoundary,
  parseJsonFromAssistantText,
};
