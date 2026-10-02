---
source: scripts/ops/sweep-outbox.ts
sha256: 035b90c909c790fd846d884fcbf4ff2e2710538f2151e203c8cd47bc0461df45
generated_at: 2026-10-01T12:36:47.995332+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/sweep-outbox.ts

## Purpose

Cron backstop that publishes all transactional-outbox events that are due (crashed, unreachable, or still backing off after a failure). The fast path is the per-transaction nudge from the writer; this sweep catches what that missed. Runs every minute in the shared scheduled-jobs container and is safe to overlap.

## Key elements

- **`main`** — sequential pipeline: `start()` → `registerModules(enabledModules)` → `relayOutbox()` → log result. No return value beyond the log.
- **`runScript('sweep:outbox', main, stopDatabase)`** — top-level entry; wires the script into the shared ops-script harness (lifecycle, error handling, DB shutdown on exit). Invoked with `void` (fire-and-forget at module level).
- **`#!/usr/bin/env tsx`** shebang — the file is also directly executable as a Node script via tsx.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scripts/run-script.ts` | Provides `runScript`, the wrapper that manages process lifecycle and registers `stopDatabase` as the teardown hook. |
| `src/infrastructure/runtime/database.ts` | `start()` opens the DB connection before work begins; `stopDatabase` is passed to `runScript` for clean shutdown. |
| `src/kernel/registry.ts` | `registerModules` installs all event-subscriber handlers so that `relayOutbox` can dispatch. |
| `src/kernel/outbox.ts` | `relayOutbox` performs the actual lease-claim-and-publish of due rows. |
| `src/modules.ts` | Exports `enabledModules`, the list handed to `registerModules`. |
| `src/infrastructure/adapters/logger.ts` | `logger.info` records the sweep result (`published` / `skipped` counts) for observability. |

## Notes

- **`registerModules` is mandatory.** `relayOutbox` will refuse to run in a process with zero subscribers; this script would crash at that step if the call were removed.
- **Idempotent by design.** `relayOutbox` uses a lease per row, so overlapping runs (or a run concurrent with the writer's nudge) never double-publish.
- **Not a module.** The outbox is kernel infrastructure; there is no corresponding module to disable or remove.
- **Stryker guard.** The `// Stryker disable next-line all` comment suppresses mutation testing on the log line only—intentional, not a bug.
- Runs as `npm run sweep:outbox`; expected cadence is once per minute (see `docs/reference/ops.md#scheduled-jobs`).
