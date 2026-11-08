---
source: tests/support/drain.ts
sha256: d7ba2aaae247fb02d6fbe9cbb9b7aa55dca2c567fc04b0a44cb806ae3415b829
generated_at: 2026-11-08T09:53:58.934764+00:00
model: ollama:qwen3.8:27b
---

# tests/support/drain.ts

## Purpose

Test-support helper that flushes the "background half" of a request–response cycle in integration tests: delivers pending outbox rows and runs scheduled jobs (sweeps, reconciliation, etc.) in-process, so journey tests can assert on end states that are written *after* the HTTP response.

## Key elements

- **`JOBS`** (module-private) — A `Map<string, job>` built once at import time from `appJobs` plus `resolveJobs(enabledModules)`. Lookup key is `job.name`.
- **`runJob(name: string): Promise<unknown>`** — Looks up a job by name in `JOBS` and calls `job.run()`. Throws a descriptive `Error` if the name is unknown. Equivalent to what `POST /__test/jobs/:name` invokes.
- **`drain(...jobs: string[]): Promise<void>`** — Orchestrates the full background drain: `settleOutboxNudges()` → each named job in order → `settleOutboxNudges()` again (to deliver anything the jobs announced).

## Relationships

- **`src/app/jobs.ts`** — Supplies `appJobs`, the application-level job declarations merged into the `JOBS` map.
- **`src/kernel/registry.ts`** — `resolveJobs` turns each enabled module's job declarations into concrete job objects for the map.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` is called before and after job execution to deliver outbox rows to their listeners.
- **`src/modules.ts`** — Provides `enabledModules`, the list of modules whose jobs are resolved and made available.
- **Journey test files** (e.g. `bought-returned-refunded.test.ts`, `quiet-for-three-years.test.ts`) — Consumers that call `drain('sweep:reservations')` (or similar) to flush background work before asserting final state.

## Notes

- `JOBS` is constructed **at module load**, not per call. If a test conditionally registers a job after import, it won't be visible here.
- `drain` always wraps the job list with a settle on both sides, even if called with zero arguments (`drain()` still settles outbox twice).
- The ordering inside `drain` (settle → jobs → settle) is intentional: the first settle delivers rows that jobs may depend on; the second delivers rows the jobs announce.
