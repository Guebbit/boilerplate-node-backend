---
source: src/modules/account/services/erasure-ledger.ts
sha256: 12646df0a4d2f683d6b44dd36fc42477fca155295d29742b7ea70df31d308a25
generated_at: 2026-11-14T18:43:47.656109+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/erasure-ledger.ts

## Purpose

Records account erasures, deletion schedules, and cancellations in a durable ledger that outlives the oldest backup snapshot. After a database restore brings erased or locked accounts back, `reapplyErasures` replays the ledger so the operator can re-erase or re-lock them before the app opens.

## Key elements

- **`writeRow`** (private) — Inserts/upserts one `erasureledgers` row via `erasureLedgerRepository.upsert`, setting the expiry to `event date + erasureLedgerRetentionMs()`. Accepts an optional Mongoose `session` and a `purgeAt` for `scheduled` rows.
- **`recordErasure`** — Called inside the erasure's own transaction. Writes an `erased` row stamped with the subject's `erasedAt` (or now). A transaction rollback removes the row atomically.
- **`recordSchedule`** — Writes a `scheduled` row with the owner's requested date and the promised `purgeAt`. Joins the lock's transaction so both commit or roll back together.
- **`recordCancellation`** — Writes a `canceled` row. Joins the cancel's transaction when one exists; the staff-cancel path calls this from an outbox handler that retries on rejection.
- **`reapplyErasures(options: ReapplyOptions)`** — The main replay. Fetches all ledger rows since the snapshot time, groups them by user, reconciles each account (erase / re-lock / unlock), collects a `ReapplyReport`, and writes a single `recordAudit` row. Idempotent; per-account failures are logged and bucketed without halting the loop.
- **`reapplyOne`** (private) — Reconciles one user: `erased` row → erasure via `accountUserService`; otherwise the later of `scheduled`/`canceled` decides lock vs. unlock via `accountUserService`.
- **`ReapplyReport`** / **`ReapplyBucket`** — Type for the six outcome buckets (`erased`, `alreadyGone`, `rescheduled`, `unscheduled`, `unchanged`, `failed`), each mapping to a list of user IDs.
- **`countsOf`** — Shorthand that converts the report's ID arrays to numeric counts for a readable log line.

## Relationships

- **`src/modules/account/repository.ts`** — `erasureLedgerRepository` (upsert, findSince) and the `ErasureLedgerRow` shape are the sole persistence layer for this file.
- **`src/modules/account/config.ts`** — Provides `erasureLedgerRetentionMs`, the TTL applied to every row.
- **`src/modules/account/model.ts`** — Defines the `ErasureLedgerKind` union (`'erased' | 'scheduled' | 'canceled'`).
- **`src/modules/account/audit.ts`** — Supplies the audit action constant used in the restoration audit record.
- **`src/modules/users/friends/account.ts`** — Provides the account user service consumed during replay to erase or restore deletion state.
- **`src/kernel/permissions.ts`** — `systemCallerContext('User')` builds the operator identity passed to all replay mutations.
- **`src/kernel/registry.ts`** — Source of the `PersonalDataSubject` type consumed by `recordErasure`.
- **`src/infrastructure/adapters/logger.ts`** — Emits the per-account error log inside `reapplyErasures`.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` writes the single restoration-log row at the end of a replay.
- **`src/types/index.ts`** — Provides the `CallerContext` type.
- **`scripts/ops/reapply-erasures.ts`** — The CLI operator that calls `reapplyErasures` and `countsOf` after a snapshot restore.
- **`src/modules/account/services/account-deletion.ts`** — The deletion flow that calls `recordErasure`, `recordSchedule`, and `recordCancellation` within its transactions.
- **`src/modules/account/tests/integration/erasure-ledger.test.ts`** — Integration tests covering this module's behaviour.

## Notes

- **Transactional coupling is mandatory for `recordErasure`.** It must be called with the same `ClientSession` as the erasure; if the transaction rolls back, the ledger row disappears with it. `recordSchedule` and `recordCancellation` follow the same pattern when a session is supplied.
- **`purgeAt` is persisted, not recomputed.** Storing the promised deadline in the row means a later change to the grace-period config cannot shift an already-scheduled erasure.
- **Replay priority:** an `erased` row always wins. When both `scheduled` and `canceled` exist, the later timestamp decides — so "cancel, then re-request" correctly stays scheduled.
- **Per-account fault isolation in `reapplyErasures`:** a thrown error for one user is caught, logged, bucketed as `failed`, and the loop continues. A rerun retries only the failed accounts (idempotent for the rest).
- **Retention is row-relative:** each row's `expiresAt` is `event date + retentionMs`, not a global cutoff. Older rows expire naturally even if the account is still referenced.
