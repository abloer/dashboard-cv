-- Normalize operational data model stage 1.
-- This migration creates parallel production-grade tables for the runtime
-- entities currently persisted through JSON repository adapters. It does not
-- change application read/write behavior yet; repository DB adapters and
-- backfill from legacy/prototype tables should be introduced in a later step.

CREATE OR REPLACE FUNCTION public.has_dashboard_read_role()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() ->> 'role',
    ''
  ) IN ('viewer', 'operator', 'admin');
$$;

CREATE OR REPLACE FUNCTION public.set_dashboard_updated_at_and_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.version = OLD.version + 1;
  NEW.updated_by = COALESCE(auth.uid(), NEW.updated_by, OLD.updated_by);
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.media_sources (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  location text NOT NULL DEFAULT '',
  source_uri text NOT NULL CHECK (length(trim(source_uri)) > 0),
  source_kind text NOT NULL CHECK (source_kind IN ('upload', 'camera')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  analytics text[] NOT NULL DEFAULT '{}',
  execution_mode text NOT NULL DEFAULT 'manual' CHECK (execution_mode IN ('manual', 'scheduled', 'continuous')),
  monitoring_status text NOT NULL DEFAULT 'idle' CHECK (monitoring_status IN ('idle', 'running', 'paused')),
  monitoring_interval_seconds integer CHECK (monitoring_interval_seconds IS NULL OR monitoring_interval_seconds > 0),
  note text NOT NULL DEFAULT '',
  last_seen_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT media_sources_scheduled_interval_required
    CHECK (execution_mode <> 'scheduled' OR monitoring_interval_seconds IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.analysis_jobs (
  id text PRIMARY KEY,
  run_id text NOT NULL UNIQUE,
  media_source_id text REFERENCES public.media_sources(id) ON DELETE SET NULL,
  module_key text NOT NULL CHECK (length(trim(module_key)) > 0),
  analysis_type text NOT NULL CHECK (length(trim(analysis_type)) > 0),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'retrying')),
  message text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  summary jsonb,
  artifact_prefix text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  max_retries integer NOT NULL DEFAULT 1 CHECK (max_retries >= 0),
  timeout_ms integer NOT NULL DEFAULT 1800000 CHECK (timeout_ms > 0),
  last_error_code text,
  last_error_message text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.analysis_history (
  id text PRIMARY KEY,
  run_id text NOT NULL,
  analysis_job_id text REFERENCES public.analysis_jobs(id) ON DELETE SET NULL,
  media_source_id text REFERENCES public.media_sources(id) ON DELETE SET NULL,
  module_key text,
  analysis_type text NOT NULL CHECK (length(trim(analysis_type)) > 0),
  source_name text,
  location text,
  event_count integer NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  violator_count integer NOT NULL DEFAULT 0 CHECK (violator_count >= 0),
  stable_detected_track_count integer NOT NULL DEFAULT 0 CHECK (stable_detected_track_count >= 0),
  raw_detected_track_count integer NOT NULL DEFAULT 0 CHECK (raw_detected_track_count >= 0),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(summary) = 'object'),
  findings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(findings) = 'array'),
  artifact_prefix text,
  output_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(output_metadata) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS media_sources_set_updated_at_and_version
  ON public.media_sources;
CREATE TRIGGER media_sources_set_updated_at_and_version
  BEFORE UPDATE ON public.media_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.set_dashboard_updated_at_and_version();

DROP TRIGGER IF EXISTS analysis_jobs_set_updated_at_and_version
  ON public.analysis_jobs;
CREATE TRIGGER analysis_jobs_set_updated_at_and_version
  BEFORE UPDATE ON public.analysis_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_dashboard_updated_at_and_version();

DROP TRIGGER IF EXISTS analysis_history_set_updated_at_and_version
  ON public.analysis_history;
CREATE TRIGGER analysis_history_set_updated_at_and_version
  BEFORE UPDATE ON public.analysis_history
  FOR EACH ROW
  EXECUTE FUNCTION public.set_dashboard_updated_at_and_version();

CREATE INDEX IF NOT EXISTS idx_media_sources_status
  ON public.media_sources (status);
CREATE INDEX IF NOT EXISTS idx_media_sources_kind_status
  ON public.media_sources (source_kind, status);
CREATE INDEX IF NOT EXISTS idx_media_sources_monitoring
  ON public.media_sources (execution_mode, monitoring_status);
CREATE INDEX IF NOT EXISTS idx_media_sources_analytics
  ON public.media_sources USING gin (analytics);
CREATE INDEX IF NOT EXISTS idx_media_sources_updated_at
  ON public.media_sources (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status_next_attempt
  ON public.analysis_jobs (status, next_attempt_at, queued_at);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_module_status
  ON public.analysis_jobs (module_key, status);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_media_source_created
  ON public.analysis_jobs (media_source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_created_at
  ON public.analysis_jobs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_history_media_source_created
  ON public.analysis_history (media_source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_history_type_created
  ON public.analysis_history (analysis_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_history_job
  ON public.analysis_history (analysis_job_id);
CREATE INDEX IF NOT EXISTS idx_analysis_history_run_id
  ON public.analysis_history (run_id);

ALTER TABLE public.media_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow dashboard read on media_sources"
  ON public.media_sources;
DROP POLICY IF EXISTS "Allow dashboard write on media_sources"
  ON public.media_sources;
DROP POLICY IF EXISTS "Allow dashboard update on media_sources"
  ON public.media_sources;
DROP POLICY IF EXISTS "Allow dashboard delete on media_sources"
  ON public.media_sources;

DROP POLICY IF EXISTS "Allow dashboard read on analysis_jobs"
  ON public.analysis_jobs;
DROP POLICY IF EXISTS "Allow dashboard write on analysis_jobs"
  ON public.analysis_jobs;
DROP POLICY IF EXISTS "Allow dashboard update on analysis_jobs"
  ON public.analysis_jobs;
DROP POLICY IF EXISTS "Allow dashboard delete on analysis_jobs"
  ON public.analysis_jobs;

DROP POLICY IF EXISTS "Allow dashboard read on analysis_history"
  ON public.analysis_history;
DROP POLICY IF EXISTS "Allow dashboard write on analysis_history"
  ON public.analysis_history;
DROP POLICY IF EXISTS "Allow dashboard update on analysis_history"
  ON public.analysis_history;
DROP POLICY IF EXISTS "Allow dashboard delete on analysis_history"
  ON public.analysis_history;

CREATE POLICY "Allow dashboard read on media_sources"
  ON public.media_sources
  FOR SELECT
  TO authenticated
  USING (public.has_dashboard_read_role());

CREATE POLICY "Allow dashboard write on media_sources"
  ON public.media_sources
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_dashboard_write_role());

CREATE POLICY "Allow dashboard update on media_sources"
  ON public.media_sources
  FOR UPDATE
  TO authenticated
  USING (public.has_dashboard_write_role())
  WITH CHECK (public.has_dashboard_write_role());

CREATE POLICY "Allow dashboard delete on media_sources"
  ON public.media_sources
  FOR DELETE
  TO authenticated
  USING (public.has_dashboard_write_role());

CREATE POLICY "Allow dashboard read on analysis_jobs"
  ON public.analysis_jobs
  FOR SELECT
  TO authenticated
  USING (public.has_dashboard_read_role());

CREATE POLICY "Allow dashboard write on analysis_jobs"
  ON public.analysis_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_dashboard_write_role());

CREATE POLICY "Allow dashboard update on analysis_jobs"
  ON public.analysis_jobs
  FOR UPDATE
  TO authenticated
  USING (public.has_dashboard_write_role())
  WITH CHECK (public.has_dashboard_write_role());

CREATE POLICY "Allow dashboard delete on analysis_jobs"
  ON public.analysis_jobs
  FOR DELETE
  TO authenticated
  USING (public.has_dashboard_write_role());

CREATE POLICY "Allow dashboard read on analysis_history"
  ON public.analysis_history
  FOR SELECT
  TO authenticated
  USING (public.has_dashboard_read_role());

CREATE POLICY "Allow dashboard write on analysis_history"
  ON public.analysis_history
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_dashboard_write_role());

CREATE POLICY "Allow dashboard update on analysis_history"
  ON public.analysis_history
  FOR UPDATE
  TO authenticated
  USING (public.has_dashboard_write_role())
  WITH CHECK (public.has_dashboard_write_role());

CREATE POLICY "Allow dashboard delete on analysis_history"
  ON public.analysis_history
  FOR DELETE
  TO authenticated
  USING (public.has_dashboard_write_role());

COMMENT ON TABLE public.media_sources IS
  'Normalized operational media source registry. Stage 1 foundation; JSON repository adapter remains active until DB adapter migration.';
COMMENT ON TABLE public.analysis_jobs IS
  'Normalized durable analysis job metadata with retry, timeout, status, and optimistic concurrency version.';
COMMENT ON TABLE public.analysis_history IS
  'Normalized analysis history/events generated from completed runs and HSE reports.';
