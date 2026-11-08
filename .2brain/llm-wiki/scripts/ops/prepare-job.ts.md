---
source: scripts/ops/prepare-job.ts
sha256: c99a01b293e1e7e6b53a350e2e80140ba88fd04a589d26abc3a1d6e2c259f668
generated_at: 2026-11-08T02:55:13.195167+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/prepare-job.ts

## Purpose

Installs the runtime prerequisites a scheduled job declares it needs—event subscriptions and/or i18n translations—before the job executes. It exists as the single shared bootstrap step used by both `run-job.ts` and the integration tests that exercise a job through the runner's real path.

## Key elements

- **`prepareJob(job: JobDeclaration): Promise<unknown>`** — The sole export. Conditionally performs two setup steps based on the job's `needs` field:
  - If `job.needs.subscriptions` is truthy, calls `registerModules(enabledModules)` to wire up every enabled module's event subscriptions.
  - If `job.needs.i18n` is truthy, calls `bootI18n(enabledModuleDirectories('locales'))` to load translations.
  - If neither flag is set, resolves immediately with `undefined`.

## Relationships

- **`scripts/ops/run-job.ts`** — Direct consumer; calls `prepareJob` before invoking the job's handler.
- **`src/infrastructure/i18n/index.ts`** — Re-exports `bootI18n`, imported here via the `@infrastructure/i18n` alias.
- **`src/infrastructure/i18n/boot.ts`** — Implements the `bootI18n` function actually invoked.
- **`src/kernel/registry.ts`** — Provides `registerModules` and the `JobDeclaration` type used in the signature.
- **`src/modules.ts`** — Supplies `enabledModules` (the module list passed to `registerModules`) and `enabledModuleDirectories` (used to resolve the locales path for i18n).
- **`tests/integration/ops-task-overdue-job.test.ts`** and **`tests/integration/ops-webhook-retry-job.test.ts`** — Integration tests that call `prepareJob` to replicate the production bootstrap before driving a job through the runner.

## Notes

- The two setup steps are **independent and conditional**: a job may need only subscriptions, only i18n, both, or neither. The function does not short-circuit; both branches are evaluated sequentially.
- `registerModules` is fire-and-forget (its return value is discarded), while `bootI18n` returns a promise that gates the job's execution.
- The module is deliberately placed under `scripts/ops/` rather than `src/` because it is an operational bootstrap concern, not application runtime code, yet it imports from `src/` via relative paths (`../../src/modules`).
