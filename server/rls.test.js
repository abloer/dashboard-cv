const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const migrationPath = path.resolve(
  __dirname,
  "../supabase/migrations/20260519090000_harden_legacy_rls_write_policies.sql"
);
const migrationSql = fs.readFileSync(migrationPath, "utf8");
const normalizedMigrationPath = path.resolve(
  __dirname,
  "../supabase/migrations/20260624090000_normalize_operational_data_model.sql"
);
const normalizedMigrationSql = fs.readFileSync(normalizedMigrationPath, "utf8");

const legacyTables = [
  "VIDEO_ANALITYC",
  "EXCAVATOR_TYPE",
  "DUMP_TRUCK_TYPE",
  "EXCAVATOR_DATA",
  "DUMP_TRUCK_DATA",
];

describe("Supabase RLS write hardening migration", () => {
  it("removes legacy public write policies for production tables", () => {
    for (const table of legacyTables) {
      assert.match(migrationSql, new RegExp(`DROP POLICY IF EXISTS "Allow public insert on ${table}"`));
      assert.match(migrationSql, new RegExp(`DROP POLICY IF EXISTS "Allow public update on ${table}"`));
    }
  });

  it("does not create unrestricted write policies", () => {
    assert.doesNotMatch(migrationSql, /FOR\s+INSERT[\s\S]*WITH CHECK\s*\(\s*true\s*\)/i);
    assert.doesNotMatch(migrationSql, /FOR\s+UPDATE[\s\S]*USING\s*\(\s*true\s*\)/i);
    assert.doesNotMatch(migrationSql, /TO\s+(?:public|anon)\b/i);
  });

  it("requires authenticated operator or admin role claims for direct writes", () => {
    assert.match(migrationSql, /CREATE OR REPLACE FUNCTION public\.has_dashboard_write_role\(\)/);
    assert.match(migrationSql, /IN\s*\('operator',\s*'admin'\)/);

    for (const table of legacyTables) {
      assert.match(
        migrationSql,
        new RegExp(
          `CREATE POLICY "Allow operator insert on ${table}"[\\s\\S]*?FOR INSERT[\\s\\S]*?TO authenticated[\\s\\S]*?WITH CHECK \\(public\\.has_dashboard_write_role\\(\\)\\);`
        )
      );
      assert.match(
        migrationSql,
        new RegExp(
          `CREATE POLICY "Allow operator update on ${table}"[\\s\\S]*?FOR UPDATE[\\s\\S]*?TO authenticated[\\s\\S]*?USING \\(public\\.has_dashboard_write_role\\(\\)\\)[\\s\\S]*?WITH CHECK \\(public\\.has_dashboard_write_role\\(\\)\\);`
        )
      );
    }
  });
});

describe("Supabase normalized operational schema migration", () => {
  const normalizedTables = ["media_sources", "analysis_jobs", "analysis_history"];

  it("creates snake_case operational tables with primary keys, audit timestamps, and versions", () => {
    for (const table of normalizedTables) {
      assert.match(
        normalizedMigrationSql,
        new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}[\\s\\S]*?id text PRIMARY KEY`)
      );
      assert.match(
        normalizedMigrationSql,
        new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}[\\s\\S]*?version integer NOT NULL DEFAULT 1`)
      );
      assert.match(
        normalizedMigrationSql,
        new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}[\\s\\S]*?created_at timestamptz NOT NULL DEFAULT now\\(\\)`)
      );
      assert.match(
        normalizedMigrationSql,
        new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}[\\s\\S]*?updated_at timestamptz NOT NULL DEFAULT now\\(\\)`)
      );
    }

    assert.doesNotMatch(normalizedMigrationSql, /CREATE TABLE IF NOT EXISTS public\."[A-Z_]+"/);
  });

  it("defines expected foreign keys between media sources, jobs, and history", () => {
    assert.match(
      normalizedMigrationSql,
      /media_source_id text REFERENCES public\.media_sources\(id\) ON DELETE SET NULL/
    );
    assert.match(
      normalizedMigrationSql,
      /analysis_job_id text REFERENCES public\.analysis_jobs\(id\) ON DELETE SET NULL/
    );
    assert.match(
      normalizedMigrationSql,
      /created_by uuid DEFAULT auth\.uid\(\) REFERENCES auth\.users\(id\) ON DELETE SET NULL/
    );
  });

  it("adds query-driven indexes for registry, job queue, and history lookup paths", () => {
    const expectedIndexes = [
      "idx_media_sources_status",
      "idx_media_sources_kind_status",
      "idx_media_sources_monitoring",
      "idx_media_sources_analytics",
      "idx_analysis_jobs_status_next_attempt",
      "idx_analysis_jobs_module_status",
      "idx_analysis_jobs_media_source_created",
      "idx_analysis_history_media_source_created",
      "idx_analysis_history_type_created",
      "idx_analysis_history_job",
      "idx_analysis_history_run_id",
    ];

    for (const indexName of expectedIndexes) {
      assert.match(normalizedMigrationSql, new RegExp(`CREATE INDEX IF NOT EXISTS ${indexName}`));
    }
  });

  it("increments optimistic concurrency version through update triggers", () => {
    assert.match(
      normalizedMigrationSql,
      /CREATE OR REPLACE FUNCTION public\.set_dashboard_updated_at_and_version\(\)/
    );
    assert.match(normalizedMigrationSql, /NEW\.version = OLD\.version \+ 1;/);

    for (const table of normalizedTables) {
      assert.match(
        normalizedMigrationSql,
        new RegExp(
          `CREATE TRIGGER ${table}_set_updated_at_and_version[\\s\\S]*?BEFORE UPDATE ON public\\.${table}[\\s\\S]*?EXECUTE FUNCTION public\\.set_dashboard_updated_at_and_version\\(\\);`
        )
      );
    }
  });

  it("enables RLS and avoids public or unrestricted writes on normalized tables", () => {
    assert.match(normalizedMigrationSql, /CREATE OR REPLACE FUNCTION public\.has_dashboard_read_role\(\)/);
    assert.match(normalizedMigrationSql, /IN \('viewer', 'operator', 'admin'\)/);
    assert.doesNotMatch(normalizedMigrationSql, /TO\s+(?:public|anon)\b/i);
    assert.doesNotMatch(normalizedMigrationSql, /FOR\s+INSERT[\s\S]*WITH CHECK\s*\(\s*true\s*\)/i);
    assert.doesNotMatch(normalizedMigrationSql, /FOR\s+UPDATE[\s\S]*WITH CHECK\s*\(\s*true\s*\)/i);

    for (const table of normalizedTables) {
      assert.match(normalizedMigrationSql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY;`));
      assert.match(
        normalizedMigrationSql,
        new RegExp(
          `CREATE POLICY "Allow dashboard read on ${table}"[\\s\\S]*?FOR SELECT[\\s\\S]*?TO authenticated[\\s\\S]*?USING \\(public\\.has_dashboard_read_role\\(\\)\\);`
        )
      );
      assert.match(
        normalizedMigrationSql,
        new RegExp(
          `CREATE POLICY "Allow dashboard write on ${table}"[\\s\\S]*?FOR INSERT[\\s\\S]*?TO authenticated[\\s\\S]*?WITH CHECK \\(public\\.has_dashboard_write_role\\(\\)\\);`
        )
      );
      assert.match(
        normalizedMigrationSql,
        new RegExp(
          `CREATE POLICY "Allow dashboard update on ${table}"[\\s\\S]*?FOR UPDATE[\\s\\S]*?TO authenticated[\\s\\S]*?USING \\(public\\.has_dashboard_write_role\\(\\)\\)[\\s\\S]*?WITH CHECK \\(public\\.has_dashboard_write_role\\(\\)\\);`
        )
      );
    }
  });
});
