---
source: scripts/ops/reencrypt.ts
sha256: a10f2b489bfa2bb63893f3f409ee75321fd15bd57c4d8123e7cc69e75a07dbba
generated_at: 2026-10-14T07:26:49.403501+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reencrypt.ts

## Purpose

Manual one-shot script (`npm run reencrypt`) that migrates every stored secret—PII in addresses, phones, orders, invoices, TOTP secrets, and webhook signing secrets—onto the newest key in its key ring. It exists because a key rotation prepends a new key while keeping the old one; without this script the old key can never be retired. Run once after a rotation deploy, then drop the old key entry.

## Key elements

- **`dryRun`** – `true` when the process is invoked with `--dry-run`; suppresses all writes and reports per-field, per-key-version counts instead.
- **`walks`** – ordered readonly array of six re-encryption functions (one per module) that each own their collection traversal.
- **`runAll(remaining, total)`** – recursive sequential runner; chains the walks one-at-a-time (never in parallel) and accumulates a merged `ReencryptReport`.
- **`main()`** – top-level flow: `startJob()` → `runAll(walks)` → log the merged report via `logger.info`.
- **Entry point** – `runScript(undefined, main, stopDatabase)`; `undefined` job name signals a hand-run, non-scheduled operation.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scripts/run-script.ts` | Provides `runScript`, the standard wrapper for one-off script lifecycle (DB connect/disconnect, error handling). |
| `src/infrastructure/config/dotenv.ts` | Imported first to load environment variables before any other module reads `process.env`. |
| `src/infrastructure/runtime/mongoose-boot.ts` | Imported before any Mongoose model; sets global Mongoose defaults that are baked in at schema-build time. |
| `src/infrastructure/runtime/database.ts` | Supplies `startJob` (connect) and `stopDatabase` (disconnect passed to `runScript`). |
| `src/infrastructure/adapters/logger.ts` | `logger.info` emits the final per-field report. |
| `src/infrastructure/security/reencrypt.ts` | Defines the shared `ReencryptReport` type plus `emptyReport` / `mergeReports` helpers used to aggregate results. |
| `src/modules/addresses/index.ts` | Exports `reencryptAddressBooks`. |
| `src/modules/account/index.ts` | Exports `reencryptTotpSecrets`. |
| `src/modules/orders/index.ts` | Exports `reencryptOrders`. |
| `src/modules/invoicing/index.ts` | Exports `reencryptInvoices`. |

*(The script also imports `reencryptUserPhones` from `@modules/users` and `reencryptWebhookSecrets` from `@modules/webhooks`; those modules are not listed in the current graph neighbor set.)*

## Notes

- **Idempotent by design.** A value already encrypted with the newest key is detected and skipped, so a second run writes nothing.
- **Sequential execution is intentional.** `runAll` walks one module at a time so no two walks contend for the same MongoDB collection.
- **Import order matters.** `mongoose-boot` must load before any model/schema import; moving it later would change runtime behaviour silently.
- **No cron / schedule.** A key rotation is a discrete event, not a cadence, so there is deliberately no `docker/crontab` entry for this script.
- **`--dry-run` is the safe first pass.** It reports counts per field and key version without touching the database, useful for verifying which rows still sit on an old key.
