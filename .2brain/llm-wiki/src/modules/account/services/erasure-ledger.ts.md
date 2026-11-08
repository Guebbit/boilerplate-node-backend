---
source: src/modules/account/services/erasure-ledger.ts
sha256: 075beab89a32f8a39ebb3f4038c00bc1eb8ddba4b4346ca3287ff20aa873f044
generated_at: 2026-11-08T04:17:19.305261+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/erasure-ledger.ts

## Purpose

Durable record of account erasures, scheduled deletions, and their cancellations, retained longer than the oldest backup. When an old snapshot is restored, `reapplyErasures` replays the ledger to re-erase or re-lock accounts that the restore brought back, ensuring the `auditlogs` (90 days) and Loki (7 days) gaps don't leave erased accounts resurrected.

## Key elements

- **`writeRow`** (private) — Writes a single `erasureledgers` row via the repository, setting `expiresAt = at + erasureLedgerRetentionMs()`.
- **`recordErasure`** (exported) — The `personalData.erase` hook; writes an `'erased'` row inside the erasure's transaction so a rollback removes it atomically.
- **`recordSchedule`** (exported) — Writes a `'scheduled'` row with the promised `purgeAt`, joined to the lock's transaction.
- **`recordCancellation`** (exported) — Writes a `'canceled'` row with the cancellation timestamp, joined to the cancel's transaction when one exists.
- **`ReapplyOptions`** (exported interface) — `{ since, by?, snapshot? }` parameters for a replay run.
- **`ReapplyReport`** (exported type) — `Record<ReapplyBucket, string[]>`; every affected account lands in exactly one of `erased | alreadyGone | rescheduled | unscheduled | unchanged | failed`.
- **`groupByUser`** (private) — Collapses rows per user into one row-per-kind map.
- **`reapplyOne`** (private) — Applies the correct state for one account: `erased` wins; otherwise the later of `scheduled`/`canceled` decides lock vs. unlock.
- **`reapplyErasures`** (exported) — Main replay entry point; iterates all users with rows since `since`, calls `reapplyOne`, collects the report, and writes a `recordAudit` row. Idempotent; per-account failures are logged and counted without halting the run.
- **`countsOf`** (exported) — Converts a `ReapplyReport` to per-bucket counts for log-line readability.

## Relationships

- **`src/modules/account/repository.ts`** — All persistence goes through `erasureLedgerRepository.upsert` and `.findSince`; `ErasureLedgerRow` is the row shape.
- **`src/modules/account/config.ts`** — Provides `erasureLedgerRetentionMs()` to compute each row's expiry.
- **`src/modules/account/model.ts`** — Source of the `ErasureLedgerKind` discriminated type (`'erased' | 'scheduled' | 'canceled'`).
- **`src/modules/account/audit.ts`** — Supplies `accountAuditActions.AUTH_ERASURES_REAPPLIED` for the restoration audit entry.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` writes the operator-visible restoration log row.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` on per-account replay failures.
- **`src/kernel/permissions.ts`** — `systemCallerContext('User')` produces the `CallerContext` used for replay calls.
- **`src/kernel/registry.ts`** — `PersonalDataSubject` type passed into `recordErasure`.
- **`src/modules/users/index.ts`** — `userService.eraseAgain` and `userService.restoreDeletionState` are the actual state-mutation calls during replay.
- **`src/types/auth-context.ts`** — `CallerContext` type used throughout.
- **`scripts/ops/reapply-erasures.ts`** — Operator script that invokes `reapplyErasures` after a snapshot restore.
- **`src/modules/account/services/account-deletion.ts`** — Caller of `recordErasure`, `recordSchedule`, and `recordCancellation` during normal deletion flows.
- **`src/modules/account/tests/integration/erasure-ledger.test.ts`** — Integration tests for this module.

## Notes

- **Transaction coupling**: `recordErasure` and `recordSchedule` require the caller's `Mongoose` session; if the caller rolls back, the ledger row disappears. `recordCancellation` accepts an optional session (staff-cancel path has none).
- **`purgeAt` is stored, not derived**: A later change to the grace-period setting cannot shift an already-scheduled deletion date.
- **Precedence in replay**: `erased` always wins. Among `scheduled`/`canceled`, the one with the later `at` wins, so cancel-then-re-ask still results in a lock.
- **Self-expiry**: Rows are soft-deleted after `erasureLedgerRetentionMs()` elapses from the event time — no explicit cleanup job needed.
- **`by` defaults to OS username**: If the operator doesn't pass a name, `os.userInfo().username` is recorded in the audit metadata.
- **Idempotency contract**: Running `reapplyErasures` a second time after a successful first run should yield all accounts in `unchanged` or `alreadyGone`; `failed` entries are the only ones a rerun would still act on.
