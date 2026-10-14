---
source: scripts/ops/sweep-outbox.ts
sha256: 3ad843be0910acefc99373a57b19b5dbb38d9af2bd671891f182d00fdb7887ce
generated_at: 2026-10-14T07:27:44.925093+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/sweep-outbox.ts

## Purpose

Scheduled cron job (runs every minute) that publishes every transactional-outbox event whose due time has arrived. It is the **backstop**, not the fast path: it recovers events left behind by crashed/unreachable processes and retries that have waited out their backoff. Lease-based claiming in `relayOutbox` makes it safe to overlap with the nudge or a previous run.

## Key elements

- **`main()`** — `startJob()` → `registerModules(enabledModules)` → `relayOutbox()` → log result. Resolves `void`; no return value.
- **`runScript('sweep:outbox', main, stopDatabase)`** — entry-point call; records the outcome under the `sweep:outbox` key for `/observability/health` and closes DB connections on both success and failure paths.
- **`enabledModules`** (from `src/modules.ts`) — the concrete module list passed to `registerModules`; publishing an event means invoking its subscribers, and `relayOutbox` refuses to run in a process with none registered.

## Relationships

- **`scripts/run-script.ts`** — provides the `runScript` wrapper that handles health reporting and guaranteed connection teardown.
- **`src/kernel/outbox.ts`** — provides `relayOutbox`, the actual publish engine (lease-claims rows, invokes subscribers).
- **`src/kernel/registry.ts`** — provides `registerModules`, which installs event subscribers before `relayOutbox` can run.
- **`src/modules.ts`** — exports the `enabledModules` array consumed by the script.
- **`src/infrastructure/runtime/database.ts`** — provides `startJob` (DB connect) and `stopDatabase` (cleanup passed to `runScript`).
- **`src/infrastructure/runtime/mongoose-boot.ts`** — must load before any Mongoose model is touched; sets Mongoose defaults at schema-build time.
- **`src/infrastructure/config/dotenv.ts`** — loads environment variables; must be the very first import.
- **`src/infrastructure/adapters/logger.ts`** — provides `logger` for the single "sweep finished" info line.

## Notes

- **Import order is load-bearing.** `dotenv` → `mongoose-boot` → everything else. Mongoose reads its defaults at schema-build time, so any import that touches a model before `mongoose-boot` will silently pick up wrong defaults.
- **`registerModules` is not optional.** `relayOutbox` hard-refuses to run in a subscriber-less process; don't "simplify" by removing the registration step.
- **Stryker mutation-testing** is disabled on the `logger.info` line (`// Stryker disable next-line all`) to avoid a false-positive mutation report.
- The script is idempotent by design (lease + backoff), so a missed or overlapping cron tick costs nothing extra.
- Lives under `scripts/ops/` alongside other scheduled jobs; see `docs/reference/ops.md#scheduled-jobs` for the cron schedule and `docs/tools/outbox.md` for the outbox contract.
