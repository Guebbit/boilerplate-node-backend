---
source: tests/support/drain.ts
sha256: d7ba2aaae247fb02d6fbe9cbb9b7aa55dca2c567fc04b0a44cb806ae3415b829
generated_at: 2026-10-29T07:07:23.240670+00:00
model: ollama:qwen3.8:27b
---

# tests/support/drain.ts

## Purpose

Test-support helper that lets the "background half" of a journey step complete before assertions run. In production, outbox rows are delivered to listeners asynchronously and scheduled jobs (sweeps) fire on a timer; in tests neither happens on its own. This module gives integration tests a single call to flush outbox delivery and execute named jobs deterministically, in-process.

## Key elements

- **`JOBS`** (module-private `Map<string, Job>`) — every declared job indexed by name, built once at import time from `appJobs` + `resolveJobs(enabledModules)`.
- **`runJob(name: string): Promise<unknown>`** — looks up a job by name and calls its `run()`. Throws a plain `Error` if the name is unknown.
- **`drain(...jobs: string[]): Promise<void>`** — the main entry point used by tests. Sequence: `settleOutboxNudges()` → each named job in order → `settleOutboxNudges()` again. The second settle picks up outbox rows announced *by* the jobs themselves.

## Relationships

- **`src/app/jobs.ts`** — provides `appJobs`, the static array of application-level jobs included in the `JOBS` map.
- **`src/modules.ts`** — provides `enabledModules`, the set of modules whose jobs are resolved into the map.
- **`src/kernel/registry.ts`** — provides `resolveJobs`, which turns the enabled-module list into concrete job descriptors.
- **`src/kernel/outbox.ts`** — provides `settleOutboxNudges`, the in-process function that delivers all pending outbox rows to their registered listeners.
- **`tests/integration/journeys/*.test.ts`** (e.g. `a-receiver-that-stays-down`, `an-accounts-whole-security-life`, `bought-returned-refunded`, etc.) — consumers; they call `drain` (and sometimes `runJob` directly) after triggering a request, then assert on the resulting end state.

## Notes

- The `JOBS` map is frozen at module-load time. If a test dynamically enables a module *after* importing `drain`, its jobs won't be available.
- `drain` takes an *ordered* list of job names; jobs run sequentially, not in parallel. Pass them in the order you expect them to fire.
- The double `settleOutboxNudges` call is intentional: the first delivers rows that existed before the jobs ran, the second delivers rows the jobs themselves announced. Skipping the second will leave rows undelivered.
- `runJob` throws a generic `Error` (not a domain-specific type) on unknown names, so test failure messages are a plain string like `"no job named sweep:reservations"`.
