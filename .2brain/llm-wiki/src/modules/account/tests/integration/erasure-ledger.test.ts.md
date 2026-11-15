---
source: src/modules/account/tests/integration/erasure-ledger.test.ts
sha256: 3362774331e7142a0540c5cf6b0cc195da5bf04698f8a8eddfbbee84abbd5413
generated_at: 2026-11-14T19:03:14.274545+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/erasure-ledger.test.ts

## Purpose

Integration tests for the erasure-ledger subsystem. Verifies that ledger rows are written transactionally with account erasure, that `reapplyErasures` correctly replays (or skips) erasures after a snapshot restore, and that deletion-lock edge cases (late cancellations, expired purge dates) are handled. Also asserts audit-event emission and idempotency.

## Key elements

- **`reapplyErasures`** (from `../../services/erasure-ledger`) — the primary SUT; replays erasures since a snapshot date, returns a report with `erased`, `unchanged`, `alreadyGone`, `rescheduled`, `unscheduled`, `failed` arrays.
- **`countsOf`** (same module) — summary helper asserted against the report.
- **`recordSchedule`** (same module) — imported but exercised indirectly through the deletion-lock tests.
- **`erasureLedgerModel`** (from `../../model`) — queried directly for row-shape assertions (keys, `kind`, `at`, `expiresAt`) and setup via `plantRow` / `backdate` helpers.
- **`erasureLedgerRepository`** (from `../../repository`) — imported for completeness; assertions go through the Mongoose model directly.
- **`eraseAsScheduled`** (from `@modules/users/tests/factories`) — factory helper that drives the full erasure cascade.
- **`accountUserService`** (from `@modules/users/friends/account`) — spied on to simulate a failed re-erase.
- **`userService`** (from `@modules/users`) — drives the admin hard-delete path.
- **Audit assertions** — `observePort(auditPort.emitAuditEvent)` with `jest.mock('@infrastructure/observability/audit', …)` to capture the reapply audit event.
- **`setupTestDb` / `registerCheckoutModules` / `resetDomainEvents`** — test harness; `resetDomainEvents` from `@kernel/events` runs in `afterEach`.

## Relationships

- **`src/modules/account/services/erasure-ledger.ts`** — primary unit under test; the file exports `reapplyErasures`, `countsOf`, and `recordSchedule`.
- **`src/modules/account/services/account-deletion.ts`** — provides the restore/cancel entry points that write `canceled` ledger rows.
- **`src/modules/account/model.ts`** — source of `erasureLedgerModel`, used for direct DB reads and setup mutations.
- **`src/modules/account/repository.ts`** — source of `erasureLedgerRepository`; the service-layer repository the SUT writes through.
- **`src/modules/account/audit.ts`** — source of the audit action constants referenced in event assertions.
- **`src/infrastructure/observability/audit.ts`** — mocked at module level so the audit emit function becomes an observable spy.
- **`src/kernel/permissions.ts`** — source of `systemCallerContext`, the privileged caller used for staff/erase operations.
- **`src/kernel/events.ts`** — source of `resetDomainEvents`, clearing queued domain events between tests.
- **`src/modules/users/tests/factories.ts`** — source of `createUser`, `eraseAsScheduled`, and `userRepository` for setup and assertions.
- **`src/modules/users/friends/account.ts`** — source of `accountUserService`; spied on to simulate a failed re-erase.
- **`src/modules/users/index.ts`** — source of `userService`; drives the admin hard-delete path.
- **`src/modules/users/repository.ts`** — source of `userRepository`; spied on to force rollback and asserted for existence/null.
- **`src/modules/account/tests/factories.ts`** — source of `plantToken` and `tokenRowsOf`, setting up restore-link tokens for cancel tests.
- **`src/modules/account/services/index.ts`** — source of `accountService`; the cancel-notation test calls through it.
- **`src/modules/users/services/index.ts`** — part of the users service barrel re-exported by the module entry point.

## Notes

- The 220-day expiry constant is asserted literally (`220 * DAY`); it is a business rule (past the oldest backup), not a config read.
- Rollback test relies on `userRepository.deleteOne` being the **last** write in the cascade; if write ordering changes, the "no ledger row" expectation still holds only if the ledger write precedes it.
- `reapplyErasures` is tested for idempotency: calling it twice with the same `since` must produce identical reports and mutate nothing on the second run.
- The test asserts the ledger collection is **read-only** during reapply (row count and contents unchanged after the call).
- `jest.mock` for the mailer prevents real email side-effects during the full cascade.
- The `backdate` helper rewrites an existing row's `at` field to simulate a row that predates the snapshot cutoff — it does not create a new row.
