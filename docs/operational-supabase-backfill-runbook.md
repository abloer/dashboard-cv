# Operational Supabase Backfill Dry-Run Runbook

Use this runbook before any production cutover of `media_sources`, `analysis_jobs`, and `analysis_history` from JSON repositories to Supabase repositories.

## Safety Rules

- Do not set Supabase as the default runtime repository during this dry-run.
- Do not run apply mode without explicit approval, a backup, and a reviewed conflict-free dry-run report.
- Do not share command output if it contains environment names or operational identifiers that are sensitive.
- The dry-run report is intentionally limited to counts and optional checksum samples; it must not include raw payload, local paths, or secrets.

## Required Environment

Set these only for the shell running the dry-run command:

```sh
OPERATIONAL_REPOSITORY_SUPABASE_ENABLED=true
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Optional source JSON overrides:

```sh
MEDIA_REGISTRY_PATH=...
ANALYSIS_JOBS_PATH=...
ANALYSIS_HISTORY_PATH=...
```

Keep runtime default unchanged unless a separate approved cutover task says otherwise:

```sh
OPERATIONAL_REPOSITORY_BACKEND=json
```

## Dry-Run Commands

Standard dry-run:

```sh
npm run backfill:operational
```

Dry-run with safe conflict samples:

```sh
npm run backfill:operational -- --conflict-samples=5
```

Strict dry-run for CI or release gates. This exits non-zero only when `conflict > 0`:

```sh
npm run backfill:operational:dry-run:strict
```

Strict dry-run with safe conflict samples:

```sh
npm run backfill:operational:dry-run:strict -- --conflict-samples=5
```

## Reading The Summary

Each entity reports only these counters:

- `create`: source item is missing in Supabase and would be inserted.
- `update`: source item has a newer version than Supabase and would update Supabase.
- `skip`: source and Supabase canonical payloads match.
- `conflict`: Supabase is newer, same-version payload differs, or append-only history has a duplicate ID with different payload.

Optional conflict samples include only ID, reason, source/target version, and checksum. They are for triage, not for data inspection.

## Conflict Policy

If any `conflict` count is greater than zero:

1. Stop. Do not apply backfill.
2. Save the dry-run summary in the release notes or change request.
3. Investigate the conflicting IDs against controlled backend tooling or database access.
4. Decide whether JSON or Supabase is authoritative for each conflict.
5. Re-run strict dry-run after remediation.

Apply mode remains prohibited until an explicit approval task covers backup, rollback, and production cutover.
