---
source: src/modules/account/tests/integration/purge-deletions.test.ts
sha256: 5d9f9fdebbee55bbce3d569bdad8bfb443057fc9c9cc6787a27b829e58b367d7
generated_at: 2026-11-08T04:40:27.150445+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/purge-deletions.test.ts

## Purpose

Integration test for `accountService.purgeScheduledDeletions`. Verifies the full purge cascade (user row, sessions, restore tokens) against a real test database, confirming that only owner-scheduled, due accounts are erased while not-yet-due, admin-deleted, and inactivity-reaped rows survive. Also asserts side effects: a goodbye email and the correct audit trail entries.

## Key elements

- **`scheduled(email, purgeAt)`** — local factory that creates an owner-deleted user with a session and an `account-restore` token already planted, returning the user for assertions.
- **`daysFromNow(days)`** — tiny date helper (negative = past).
- **`describe('purgeScheduledDeletions')`** — four test cases:
  - *erases a due account with its sessions and links, and leaves the rest alone* — the main happy-path + selectivity check.
  - *does nothing on a second run* — idempotency.
  - *says goodbye to the address the account had, and records who erased it* — verifies `enqueueEmail` was called with the original address and `account.deleted` template, and that audit contains `system.user.erased` (not `admin.user.erased`) plus `AUTH_ACCOUNT_DELETE_COMPLETED` with the owner's `actorUserId`.
  - *skips an account restored after the job read it* — simulates a race by pushing `purgeAt` into the future before the purge runs.
- **Module-level `jest.mock` for audit** — fully replaces `@infrastructure/observability/audit` with `auditPortMock()` from `tests/support/ports.ts` (replace, not spy).
- **Module-level `jest.mock` for mailer** — spreads real exports but stubs `enqueueEmail` as a `jest.fn()`.
- **`beforeEach`** — calls `registerCheckoutModules()` so every module's erase hook is registered (mirrors boot), then clears the mailer mock.
- **`afterEach`** — calls `resetDomainEvents()`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/services/index.ts` | SUT: calls `accountService.purgeScheduledDeletions()`. |
| `src/modules/account/audit.ts` | Imports `accountAuditActions` to assert the specific audit action constant. |
| `src/modules/account/tests/factories.ts` | Imports `plantSession`, `plantToken`, `sessionRowsOf`, `tokenRowsOf` for setup and cascade assertions. |
| `src/modules/users/tests/factories.ts` | Imports `createUser` to build fixture users. |
| `src/modules/users/repository.ts` | Imports `userRepository` for existence checks and the race-condition update. |
| `src/infrastructure/adapters/mailer.ts` | Mocked; `enqueueEmail` calls are read back to assert the goodbye mail. |
| `src/infrastructure/observability/audit.ts` | Fully replaced by `auditPortMock`; observed via `observePort` from ports support. |
| `src/kernel/events.ts` | `resetDomainEvents` in `afterEach` prevents event leakage between tests. |
| `tests/support/checkout-modules.ts` | `registerCheckoutModules()` registers all module erase hooks so the real cascade fires. |
| `tests/support/ports.ts` | Provides `auditPortMock()` (full replacement) and `observePort` (readable spy helper). |
| `tests/support/setup-test-db.ts` | `setupTestDb()` manages the shared test database lifecycle. |

## Notes

- The audit port is **replaced**, not spied — this follows the convention documented in `tests/support/ports.ts`. Use `observePort(auditPort.emitAuditEvent)` to read calls, not `jest.spyOn`.
- `registerCheckoutModules` in `beforeEach` is essential: without it the purge cascade has no registered erase hooks and will silently skip related-row cleanup, making cascade assertions pass vacuously.
- The test deliberately asserts `actions` does **not** contain `admin.user.erased` — the system purge must be distinguishable from an admin-initiated erase in the audit log.
- The race test (`skips an account restored after the job read it`) updates `purgeAt` *after* `scheduled()` but *before* calling `purgeScheduledDeletions()`, simulating a concurrent restore between the query and the delete.
