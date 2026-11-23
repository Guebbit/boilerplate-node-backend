---
source: src/modules/account/services/erasure-ledger.ts
source_sha256: 685d1b5c05dd03a28ee5ee9c11763a53b9b2cdda2d804a7b8606484db696cd48
context_sha256: 18c830d5468d225a832d0a61d295d6c20253e20b692e76bc88aa20fbeee214f4
generated_at: 2026-11-22T03:36:34.621517+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/erasure-ledger.ts

## Purpose
Maintains the erasure ledger: a record of which accounts were erased, scheduled for deletion, or had a deletion canceled, kept longer than the oldest backup (the `auditlogs` trail keeps 180 days and Loki 7, both shorter). After a restore of an old snapshot, `reapplyErasures` replays the ledger so erased accounts are erased again and deletion locks are restored before the app opens.

## Key elements
- `recordErasure(subject, session)`: the `personalData.erase` hook. Writes an `erased` row inside the erasure's transaction, so a rollback removes the row too. It uses `subject.erasedAt` (set only on a repeat after a restore) or the current time.
- `recordSchedule(userId, requestedAt, purgeAt, session?)`: writes a `scheduled` row with the stored `purgeAt`, so a later change to the grace setting cannot move the date. It joins the lock's transaction and rejects with it.
- `recordCancellation(userId, canceledAt, session?)`: writes a `canceled` row. It joins the cancel's transaction when there is one. A staff cancel arrives from the outbox handler, which retries a rejection until it lands.
- `reapplyErasures(options)`: the replay. It does the following:
  1. Loads ledger rows since `options.since`.
  2. Groups them by account and reapplies each one in turn.
  3. Waits for the outbox to settle.
  4. Sweeps the held jobs of erased accounts.
  5. Writes the restoration-log audit row.
- `ReapplyOptions`: `since`, plus optional `by` (defaults to the OS username) and `snapshot`.
- `ReapplyReport`: the account ids per bucket (`erased`, `alreadyGone`, `rescheduled`, `unscheduled`, `unchanged`, `failed`) and `heldJobsRemoved`.
- `countsOf(report)`: reduces a report to counts for readable log lines.
- Internal helpers:
  - `writeRow` upserts a row whose expiry is the event time plus `erasureLedgerRetentionMs()`.
  - `groupByUser` keeps one row per kind per account.
  - `reapplyOne` decides the outcome for one account.

## Relationships
- `src/modules/account/repository.ts`: its ledger repository does the persistence through `upsert` and `findSince`. `ErasureLedgerRow` is the row type.
- `src/modules/account/model.ts`: provides `ErasureLedgerKind`.
- `src/modules/account/config.ts`: provides `erasureLedgerRetentionMs`.
- `src/modules/account/audit.ts`: supplies the account audit actions. The `AUTH_ERASURES_REAPPLIED` action is recorded at the end of a replay.
- `src/infrastructure/observability/audit.ts`: provides `recordAudit`, which writes that audit row.
- `src/modules/users/friends/account.ts`: `accountUserService` supplies `eraseAgain`, `restoreDeletionState` and `purgeHeldJobsOf`, which do the work on the user side.
- `src/kernel/outbox.ts`: `settleOutboxNudges` is awaited before the held-jobs sweep.
- `src/kernel/registry.ts`: provides the `PersonalDataSubject` type.
- `src/kernel/permissions.ts`: `systemCallerContext('User')` supplies the operator context.
- `src/types/auth-context.ts`: the file imports `CallerContext` from `@types`.
- `src/infrastructure/adapters/logger.ts`: logs per-account and sweep failures.
- `scripts/ops/reapply-erasures.ts`: the `ops:reapply-erasures` entry point that calls `reapplyErasures`.
- `src/modules/account/services/account-deletion.ts`, `src/modules/account/module.ts` and `src/modules/account/tests/integration/erasure-ledger.test.ts`: listed as graph neighbors. This file does not import them, so their exact wiring is not visible here.

## Notes
- Precedence: `erased` beats everything. Otherwise the later of `scheduled` and `canceled` wins, so cancel then re-request stays scheduled.
- A scheduled row without `purgeAt` is never treated as a schedule.
- Each account lands in exactly one bucket, except that a failed held-jobs sweep also adds the account to `failed` while it stays under `erased`. A rerun cannot redo that sweep, so restore again.
- Failures are isolated. One account's failure is logged and counted, and the rest continue. The run is idempotent.
- The held-jobs sweep runs after the outbox settles. Restored pending outbox rows are re-sent, and a handler may create a new mail job for an address that was just erased.
- The audit row is written even when sweeps fail. Its outcome is `failure` if `failed` is non-empty, and its metadata holds the report ids, not addresses.
