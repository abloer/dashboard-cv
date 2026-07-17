const {
  createJsonAnalysisHistoryRepository,
  createJsonAnalysisJobRepository,
} = require("./analysisStateRepositories");
const { createJsonMediaSourceRepository } = require("./mediaSourceRepository");
const {
  createSupabaseAnalysisHistoryRepository,
  createSupabaseAnalysisJobRepository,
  createSupabaseMediaSourceRepository,
} = require("./supabaseOperationalRepositories");

const OPERATIONAL_REPOSITORY_BACKENDS = new Set(["json", "supabase"]);

class OperationalRepositoryConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "OperationalRepositoryConfigError";
    this.code = "OPERATIONAL_REPOSITORY_CONFIG_ERROR";
    this.statusCode = 500;
  }
}

const getSupabaseCredential = (env = {}) => env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || "";

const resolveOperationalRepositoryBackend = (env = {}) => {
  const backend = String(env.OPERATIONAL_REPOSITORY_BACKEND || "json").trim().toLowerCase();
  if (!OPERATIONAL_REPOSITORY_BACKENDS.has(backend)) {
    throw new OperationalRepositoryConfigError("Invalid OPERATIONAL_REPOSITORY_BACKEND.");
  }

  if (backend !== "supabase") {
    return "json";
  }

  if (String(env.OPERATIONAL_REPOSITORY_SUPABASE_ENABLED || "").toLowerCase() !== "true") {
    throw new OperationalRepositoryConfigError(
      "Supabase operational repository backend requires OPERATIONAL_REPOSITORY_SUPABASE_ENABLED=true."
    );
  }
  if (!env.SUPABASE_URL || !getSupabaseCredential(env)) {
    throw new OperationalRepositoryConfigError(
      "Supabase operational repository backend requires SUPABASE_URL and a Supabase service or anon key."
    );
  }

  return "supabase";
};

const createOperationalRepositories = ({
  env = process.env,
  supabase = null,
  json = {},
  normalizers = {},
} = {}) => {
  const backend = resolveOperationalRepositoryBackend(env);

  if (backend === "supabase") {
    if (!supabase || typeof supabase.from !== "function") {
      throw new OperationalRepositoryConfigError("Supabase operational repository backend requires a Supabase client.");
    }
    return {
      backend,
      mediaSourceRepository: createSupabaseMediaSourceRepository({
        supabase,
        normalizeItem: normalizers.normalizeMediaSource,
      }),
      analysisHistoryRepository: createSupabaseAnalysisHistoryRepository({
        supabase,
        normalizeEntry: normalizers.normalizeAnalysisHistoryEntry,
      }),
      analysisJobRepository: createSupabaseAnalysisJobRepository({
        supabase,
        normalizeJob: normalizers.normalizeAnalysisJob,
      }),
    };
  }

  return {
    backend,
    mediaSourceRepository: createJsonMediaSourceRepository({
      filePath: json.mediaSourcesPath,
      defaultItems: json.defaultMediaSources || [],
      normalizeItem: normalizers.normalizeMediaSource,
    }),
    analysisHistoryRepository: createJsonAnalysisHistoryRepository({
      filePath: json.analysisHistoryPath,
      normalizeEntry: normalizers.normalizeAnalysisHistoryEntry,
    }),
    analysisJobRepository: createJsonAnalysisJobRepository({
      filePath: json.analysisJobsPath,
      normalizeJob: normalizers.normalizeAnalysisJob,
    }),
  };
};

module.exports = {
  OperationalRepositoryConfigError,
  createOperationalRepositories,
  resolveOperationalRepositoryBackend,
};
