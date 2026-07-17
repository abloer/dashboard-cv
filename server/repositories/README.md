# Repository Persistence Foundation

This backend still uses local JSON files for runtime state. The production target is a transactional repository layer so services do not read or write storage directly.

## Initial Repository Boundaries

- `mediaSourceRepository`: media sources, monitoring status, last-seen metadata. Initial JSON adapter is active for media source CRUD.
- `moduleConfigRepository`: per-module ROI/zone/model configuration envelopes. Initial JSON adapter is active for module config read/write.
- `analysisHistoryRepository`: completed run summaries and report metadata. Initial JSON adapter is active for append/list history.
- `analysisJobRepository`: analysis job metadata and lifecycle status. Initial JSON adapter is active for queued/running/completed/failed state.
- `modelRegistryRepository`: datasets, training jobs, model versions, evaluations, benchmarks. Initial JSON adapters are active for all model registry collections.

## Contract Requirements

- All writes must be atomic and return the committed row/version.
- Updates that depend on current state must use transactions or optimistic concurrency.
- Repository methods must validate tenant/role context before direct user writes; trusted backend workers should use service credentials.
- File-based JSON storage is allowed only as a temporary adapter behind the same interface, not from route handlers or services.

## Migration Order

1. Move media source reads/writes behind `mediaSourceRepository`.
2. Move module config writes behind `moduleConfigRepository`.
3. Persist analysis job metadata and history transactionally.
4. Replace temporary JSON adapters with durable database-backed repositories.
