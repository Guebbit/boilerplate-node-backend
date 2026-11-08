---
source: src/modules/account/tests/integration/erasure-ledger.test.ts
sha256: 32e2a57569c0b2c27a14596db0ccbf4df468ffab68272266686a05bd68863a85
generated_at: 2026-11-08T04:36:18.414634+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/erasure-ledger.test.ts

## Purpose
Integration tests for the erasure-ledger subsystem. Verifies that ledger rows are written atomically inside the erasure transaction (and vanish on rollback), that `reapplyErasures` correctly replays erasures after a snapshot restore (latest event wins, idempotent, failure-tolerant), and that deletion-lock states (canceled, purgeAt-expired) are reconciled by the same replay path.

## Key elements
- **`setupTestDb` / `registerCheckoutModules`** — one-time DB bootstrap and module registration before each test.
- **`ledger()` / `rowsOf(userId)`** — query helpers that read raw ledger documents (oldest-first) for assertions.
- **`backdate(userId, kind, at)`** — rewrites a row's `at` timestamp to simulate a row that existed before a snapshot.
- **`restoreFromSnapshot(id, email)`** — recreates a user document to stand in for a snapshot-restore bringing an account back.
- **`plantRow(userId, kind, at, purgeAt?)`** — inserts a ledger row directly (bypassing the service) for scenario setup.
- **`lockedInSnapshot(email, purgeAt)`** — creates a user in the "owner-deleted, awaiting purge" state.
- **Suite: "the ledger is written with the erasure"** — asserts row shape (exactly `_id`, `at`, `expiresAt`, `kind`, `userId`), 220-day expiry, rollback safety, admin hard-delete, and cancel-once semantics.
- **Suite: `reapplyErasures`** — covers replay scope (only rows since snapshot), date preservation, idempotency, `alreadyGone`/`failed` bookkeeping, audit-log emission, and ledger immutability.
- **Suite: "reapplyErasures — deletion locks"** — exercises `unscheduled` (lock cleared) and interaction with expired `purgeAt`.
- **Mocks** — `@infrastructure/observability/audit` replaced by `auditPortMock`; mailer `enqueueEmail` stubbed.

## Relationships
- **`services/erasure-ledger.ts`** — under test: `reapplyErasures`, `recordSchedule`, `countsOf`.
- **`services/account-deletion.ts`** — provides `handleRestoredByStaff`, `restoreAccount` used in lock-reconciliation tests.
- **`services/index.ts`** — `accountService.restoreAccountByLink` exercised for the cancel flow.
- **`repository.ts` / `model.ts`** — `erasureLedgerRepository` and `erasureLedgerModel` are queried directly for assertions and row manipulation.
- **`audit.ts`** (module) — `accountAuditActions.AUTH_ERASURES_REAPPLIED` used in the audit-log assertion.
- **`@infrastructure/observability/audit.ts`** — mocked; `observePort(auditPort.emitAuditEvent)` captures emitted events.
- **`@kernel/events.ts`** — `resetDomainEvents` called in `afterEach`.
- **`@kernel/permissions.ts`** — `systemCallerContext('User')` passed to `userService.eraseAgain`.
- **`@modules/users/index.ts` / `repository.ts`** — `userService.eraseAgain`, `userService.removeById`, `userRepository.findById`/`deleteOne` spied or asserted against.
- **`@modules/users/tests/factories.ts`** — `createUser`, `eraseAsScheduled` build test fixtures.
- **`tests/factories.ts`** (account) — `plantToken` seeds the restore-link token.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity for service calls.

## Notes
- The 220-day expiry (`220 * DAY`) is asserted as a hard invariant; it represents the retention window past the oldest backup.
- `jest.spyOn(userRepository, 'deleteOne').mockRejectedValueOnce` is used to simulate a mid-transaction failure and verify the ledger row is rolled back — the test relies on the user delete being the *last* write in the cascade.
- `resetDomainEvents()` in `afterEach` prevents event-listener leakage between tests; forgetting it causes cross-test interference.
- The audit port is fully mocked, so no real audit infrastructure is needed; assertions use `observePort` from the test-ports helper rather than inspecting a DB.
- Ledger rows are asserted to contain **only** `userId`, `kind`, `at`, `expiresAt` (plus Mongo `_id`) — no email, IP, or user-agent. Any schema drift will break the `Object.keys` assertion.
