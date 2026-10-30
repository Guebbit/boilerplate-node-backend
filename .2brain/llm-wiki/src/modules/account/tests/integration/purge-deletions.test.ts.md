---
source: src/modules/account/tests/integration/purge-deletions.test.ts
sha256: 5d9f9fdebbee55bbce3d569bdad8bfb443057fc9c9cc6787a27b829e58b367d7
generated_at: 2026-10-29T02:58:51.841960+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/purge-deletions.test.ts

## Purpose

Integration tests for `accountService.purgeScheduledDeletions()`. Verifies that the purge erases only owner-initiated deletions that are past their `purgeAt` date, cascades to sessions and restore tokens, leaves not-yet-due / admin-deleted / reaper rows untouched, is idempotent on re-run, sends a single goodbye email, and emits the correct audit events — all against a real database.

## Key elements

- **`describe('purgeScheduledDeletions')`** — four test cases:
  - *erases a due account with its sessions and links, and leaves the rest alone* — the happy path with four fixtures (due, early, admin-deleted, reaper).
  - *does nothing on a second run* — idempotency.
  - *says goodbye to the address… and records who erased it* — asserts the mail envelope/template and both audit actions (`system.user.erased`, `AUTH_ACCOUNT_DELETE_COMPLETED`), and the absence of `admin.user.erased`.
  - *skips an account restored after the job read it* — simulates a concurrent `purgeAt` update between read and write.
- **`scheduled(email, purgeAt)`** — helper that creates a verified, owner-deleted user with one planted session and one `account-restore` token.
- **`daysFromNow(days)`** — returns a `Date` offset from now (negative = past).
- **`jest.mock('@infrastructure/observability/audit', …)`** — replaces the entire audit module with `auditPortMock()` from `tests/support/ports.ts`.
- **`jest.mock('@infrastructure/adapters/mailer', …)`** — stubs only `enqueueEmail`; all other mailer exports pass through via `requireActual`.
- **`beforeEach`** — calls `registerCheckoutModules()` (registers every module's erase hook, mirroring boot) and clears the mailer mock.
- **`afterEach`** — calls `resetDomainEvents()` from the kernel to prevent cross-test event leakage.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/services/index.ts` | The system under test: `accountService.purgeScheduledDeletions()`. |
| `src/modules/users/repository.ts` | `userRepository.findById` (assertions) and `updateMany` (race-condition fixture). |
| `src/modules/users/tests/factories.ts` | `createUser` to seed user rows. |
| `src/modules/account/tests/factories.ts` | `plantSession`, `plantToken`, `sessionRowsOf`, `tokenRowsOf` to set up and assert cascade data. |
| `src/modules/account/audit.ts` | `accountAuditActions` enum used in audit assertions. |
| `src/infrastructure/observability/audit.ts` | Fully replaced by `auditPortMock()`; `observePort(auditPort.emitAuditEvent)` captures calls. |
| `src/infrastructure/adapters/mailer.ts` | `enqueueEmail` mocked to capture sent envelopes. |
| `src/kernel/events.ts` | `resetDomainEvents()` in `afterEach`. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` connects Jest to a real (temporary) database. |
| `tests/support/checkout-modules.ts` | `registerCheckoutModules()` wires all module erase hooks into the cascade. |
| `tests/support/ports.ts` | `observePort` helper and `auditPortMock()` factory. |

## Notes

- The audit module is **replaced**, not spied on. This is the convention documented in `tests/support/ports.ts`; use `observePort` to read captured calls rather than calling the real implementation.
- `registerCheckoutModules()` must run in `beforeEach` because the cascade erase hooks are registered at application boot; without it the purge would skip child rows and the test would pass for the wrong reason.
- The mailer mock uses `requireActual` spread so non-email exports (types, helpers) remain available if other code in the chain touches them.
- The race-condition test mutates `purgeAt` *after* the user is created but *before* the purge call, simulating the window where a user restores their account between the query and the delete.
