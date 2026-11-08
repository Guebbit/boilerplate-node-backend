---
source: tests/cross-cutting/scheduled-jobs.test.ts
sha256: 2c59727cf6fa9b8b08bf0f3e191a3957f7503f4f5ec54c05e14da45b5eb08cf8
generated_at: 2026-11-08T09:31:37.739904+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/scheduled-jobs.test.ts

## Purpose

Cross-cutting guard that validates every scheduled job in the codebase is well-formed and consistently declared. It enforces naming conventions, schedule shape, lease constraints, and that the production image's job runner is wired correctly—replacing the old "two files must agree" checks now that `docker/crontab` and the ops jobs table are generated from a single set of declarations.

## Key elements

- **`JOBS`** — concatenated list of `appJobs` (foundation jobs) and `resolveJobs(enabledModules)` (module-declared jobs), in crontab order. All assertions run against this single array.
- **`describe('the declared jobs')`** — suite of invariant checks:
  - Canary: `JOBS.length >= 8` (catches a moved/empty registry rather than passing silently).
  - Name uniqueness: no two jobs share a `name`.
  - Per-job shape: name matches `^(?:reap|sweep):[\w-]+$`, `schedule` passes `looksLikeCron`, `summary` is > 10 chars.
  - Lease: any job with a `lease` field must have `ttlMs > 0`.
- **`describe('every scheduled job ships in the production image')`** — verifies `package.json` script `job` points to `tsx scripts/ops/run-job.ts`, and that every non-comment line in `docker/crontab` invokes `node --import tsx scripts/ops/run-job.ts` without referencing `npm`.

## Relationships

- **`src/app/jobs.ts`** — source of foundation-level job definitions (`appJobs`).
- **`src/kernel/registry.ts`** — provides `resolveJobs()`, which pulls job declarations out of each module's manifest.
- **`src/modules.ts`** — provides the `enabledModules` list passed into `resolveJobs`.
- **`scripts/docs/jobs-render.ts`** — provides `looksLikeCron()`, the shared schedule-shape predicate also used by the docs generator.
- **`tests/support/paths.ts`** — provides `REPO_ROOT` so the test can resolve `package.json` and `docker/crontab` by absolute path regardless of CWD.

## Notes

- The canary threshold (8) is an *exact floor* for foundation + known module jobs; if the registry is restructured, update the number intentionally rather than letting the test pass vacuously.
- The production-image assertions encode a real deployment constraint: the Docker image copies only `scripts/ops/` and `scripts/db/`, and does not install `npm`. Any future change to the runner path or invocation method will break this suite before it reaches CI.
- `looksLikeCron` is imported from the *docs* generator script, not from a shared utility. If that script's heuristics change, this test's expectations change with it.
