---
source: scripts/ops/check-config.ts
sha256: e497b6acf89f6b0d53fa523841c7bfd405fab4a070003eb80cab4f3dc09978f5
generated_at: 2026-10-29T01:40:02.109597+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/check-config.ts

## Purpose

A startup gate that validates the environment (`.env` / process env) *before* supercronic launches. Because supercronic's own healthcheck only confirms the process is alive, a broken configuration would otherwise surface as a "healthy" container whose every scheduled job silently fails. Running this script first makes the container exit non-zero at boot, surfacing the misconfiguration immediately.

## Key elements

- **Side-effect import `@infrastructure/config/dotenv`** – Loading this module performs the actual configuration validation. No explicit function call is made here; the import itself triggers the check.
- **`runScript(undefined, noop, noop)`** – Wraps execution in the shared script-lifecycle helper. The `undefined` first argument signals "not a scheduled job," so no job outcome is recorded. The two `Promise.resolve()` callbacks are intentionally empty: no work is performed and nothing is opened/closed.
- **`void` + eslint disable** – `runScript` never rejects (it reports failure via `process.exitCode`), so the floating-promise lint rule is suppressed explicitly.

## Relationships

- **`src/infrastructure/config/dotenv.ts`** – Imported for side effects; this file's entire validation behavior depends on that module's import-time logic.
- **`scripts/run-script.ts`** – Provides the `runScript` lifecycle wrapper. Here it is used in its "standalone script" mode (no job context), contributing only process-exit semantics.

## Notes

- This script does **no I/O, opens no connections, and performs no computation** beyond what the dotenv import does. If you're debugging a "config check failed" container, the relevant code lives in `src/infrastructure/config/dotenv.ts`, not here.
- Intended to be run *before* supercronic in the container entrypoint (see `docs/tools/health-checks.md`). It is not itself a cron job.
- Invocation: `npm run config:check` (shebang is `tsx`, so no build step is required).
