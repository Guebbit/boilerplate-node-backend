---
source: scripts/ops/reap-quarantine.ts
sha256: 5a91c99beb3e5d76f1b9a20e87458c3e74da40d448ab16fdc5b22ad0cf337cee
generated_at: 2026-10-14T07:26:11.556851+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-quarantine.ts

## Purpose

Nightly cleanup job (scheduled via `docker/crontab`) that deletes quarantined upload files in `NODE_QUARANTINE_PATH` older than the configured retention window. It exists to remove orphaned quarantine files left behind by crashes after `imageStore.quarantine()` or lost deliveries—every normal pipeline run cleans up its own file, so a lingering one signals a failure.

## Key elements

- **`retentionMs()`** — Derives the cutoff timestamp from `imageConfig().NODE_QUARANTINE_RETENTION_HOURS` (default 24 h).
- **`main()`** — Resolves the quarantine directory via `quarantineRoot()`, calls `reapDirectory` with the cutoff, logs the checked/reaped counts, then calls `startJob()` to open the Mongo connection solely for recording the outcome.
- **`runScript('reap:quarantine', main, stopDatabase)`** — Top-level entry point; wraps execution, records the result under the `reap:quarantine` key in `leases` for `/observability/health`, and ensures `stopDatabase` runs on both success and failure paths.

## Relationships

- **`scripts/run-script.ts`** — Supplies `runScript`, which orchestrates the job lifecycle (invoke → record outcome in Mongo `leases` → cleanup).
- **`src/infrastructure/adapters/filesystem.ts`** — Provides `reapDirectory`, the actual file-deletion primitive operating on the quarantine path.
- **`src/infrastructure/adapters/image-store.ts`** — Provides `quarantineRoot()` to resolve the directory (respects `NODE_QUARANTINE_PATH`).
- **`src/infrastructure/adapters/config.ts`** — Provides `imageConfig()` which exposes `NODE_QUARANTINE_RETENTION_HOURS`.
- **`src/infrastructure/adapters/logger.ts`** — Structured logging of the sweep result.
- **`src/infrastructure/runtime/database.ts`** — `startJob` opens the Mongo connection (only after the sweep completes); `stopDatabase` is passed to `runScript` as the teardown callback.
- **`src/infrastructure/config/dotenv.ts`** — Side-effect import that populates process env before any other module reads config.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Side-effect import that sets Mongoose defaults before any schema is built.

## Notes

- **Sweep-before-connect ordering is intentional.** `reapDirectory` runs before `startJob()`, so a Mongo outage cannot block a filesystem-only cleanup. The DB connection is opened *only* to write the `leases` record.
- **Import order is load-bearing.** `dotenv` and `mongoose-boot` are bare side-effect imports; they must execute before `config`, `database`, or any schema-dependent module. Do not reorder.
- **Retention default (24 h) is a floor, not a target.** It is chosen to outlast a normal broker-maintenance window so a transient outage never triggers premature deletion.
- **Safety invariant:** only the digest pipeline reads the quarantine directory, so no other consumer can be relying on a file past the retention window.
- Invoked as `npm run reap:quarantine`; the shebang targets `tsx` for direct `ts` execution.
