---
source: scripts/ops/check-config.ts
sha256: e497b6acf89f6b0d53fa523841c7bfd405fab4a070003eb80cab4f3dc09978f5
generated_at: 2026-11-08T02:55:04.816905+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/check-config.ts

## Purpose

A minimal entry-point invoked by `npm run config:check` (or before supercronic starts). Its sole job is to load the `.env` file so that a malformed or missing configuration causes the container to **fail to start** rather than appear healthy while every cron job independently fails. It opens no connection and performs no business logic.

## Key elements

- **Side-effect import `@infrastructure/config/dotenv`** — loads environment variables from `.env` into `process.env`. This import *is* the actual check; if the dotenv module throws or the file is missing, the process exits non-zero.
- **`runScript(undefined, …, …)`** — wraps the dotenv import in the shared script-runner so that any thrown error is caught and reported via `process.exitCode` instead of an unhandled rejection. The first argument is `undefined` because this is not a scheduled job (no outcome to record). The two callback arguments are no-op `Promise.resolve()` stubs, since there is nothing to do and nothing to clean up.

## Relationships

- **`src/infrastructure/config/dotenv.ts`** — imported purely for its side effect (parsing `.env` into `process.env`). Failure to load is the entire signal this script relies on.
- **`scripts/run-script.ts`** — provides `runScript`, the shared harness that converts thrown errors into a non-zero `process.exitCode`. This file never calls `process.exit` itself.

## Notes

- The `void` on the `runScript(...)` call is intentional and paired with an `eslint-disable` for `@typescript-eslint/no-floating-promises`. Per the comment, `runScript` never rejects; it signals failure exclusively through `process.exitCode`. Do not "fix" the floating promise.
- This script is designed to run **before** supercronic in the container entrypoint. Its exit code is what the health-check / orchestrator observes, so keep it free of any network I/O or side effects beyond the dotenv load.
- See `docs/tools/health-checks.md` for the broader rationale.
