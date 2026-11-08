---
source: src/modules/users/tests/integration/purchase-hold.test.ts
sha256: f4c651568a2e4da60ed6a9d5daeda3dd15d0c725070bce5cad817f9d068af3e7
generated_at: 2026-11-08T08:55:42.404002+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/purchase-hold.test.ts

## Purpose

Integration tests for the purchase-hold lifecycle on user records: placing a manual hold, lifting it, the review-flag state machine, audit event emission, buyer email queueing, and outbox announcements. Runs against a real database with infrastructure ports (mailer, audit) mocked, so it exercises the service layer end-to-end without network calls.

## Key elements

- **`describe('setPurchaseHold')`** — verifies manual hold creation (note trimming, `setBy`, `reason: 'staff'`), 422 on past `until`, 404 on missing user, role-gating (`ROLE_MANAGEMENT_REQUIRED`), and audit emission.
- **`describe('liftPurchaseHold')`** — verifies hold removal, `purchaseHoldCountingSince` reset, 409 when no hold/flag exists, audit `inForce` metadata, idempotency (second lift → 409, single audit row), flag clearing, and 404.
- **`describe('the review flag announced')`** — asserts outbox rows (`user.review_flagged`, `user.review_cleared`) are written correctly, including a race-condition test (two concurrent `flagPurchaseHoldReview` calls → exactly one row).
- **`describe('the review flag')`** — covers flag set/clear semantics and system audit attribution (file content truncated here).
- **`holdMails()`** — helper: filters `mockEnqueueEmail.mock.calls` for the `'users.purchase-hold-placed'` template.
- **`announced()`** — helper: queries `outboxEventModel` for `user.review_flagged` / `user.review_cleared` rows, returns names oldest-first.
- **`auditedAction(action)`** — wraps `expect.objectContaining({ action })` for readable audit assertions.
- **`inDays(days)`** / **`DAY`** / **`AUTOMATIC_BASIS`** — date and rule constants for test fixtures.
- **`reapExpiredPurchaseHolds`** — imported from the service; used for nightly-sweep scenarios (visible in truncated portion).

## Relationships

- **`src/modules/users/services/index.ts`** — the system under test; all assertions call `userService.setPurchaseHold`, `liftPurchaseHold`, `purchaseHoldOf`, `purchaseHoldCountingSince`, `flagPurchaseHoldReview`.
- **`src/modules/users/services/purchase-hold.ts`** — provides `reapExpiredPurchaseHolds` for sweep-related tests.
- **`src/modules/users/tests/factories.ts`** — `createUser` builds users (optionally with pre-set `purchaseHold` or `purchaseHoldFlaggedAt`).
- **`src/modules/users/repository.ts`** — `userRepository.findById` used to assert persisted state (note trimming, flag clearing, `setBy`).
- **`src/modules/users/audit.ts`** — `usersAuditActions` constants name the expected audit actions.
- **`src/infrastructure/observability/audit.ts`** — replaced wholesale via `jest.mock` + `auditPortMock()`; `observePort` captures emitted events for assertions.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is a `jest.fn()` mock; tests assert it was called with the hold template and that it resolves (buyer code chains `.catch`).
- **`src/infrastructure/http/response.ts`** — `ResponseReject` type used to shape 404/422/409 assertions.
- **`src/kernel/outbox.ts`** — `outboxEventModel` queried directly in `announced()` to verify event rows.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the real test database.
- **`tests/support/ports.ts`** — `observePort` and `auditPortMock` implement the port-replacement pattern for audit.
- **`tests/support/callers.ts`** — `callerContextAs(role, id?)` and `testCallerContext` build caller identity for role-gating tests.

## Notes

- **Port replacement, not spying.** The audit module is `jest.mock`-ed at module scope using `auditPortMock()` from `tests/support/ports.ts`. Assertions go through `observePort(auditPort.emitAuditEvent)`, not `jest.spyOn`.
- **Mailer mock resolves `undefined`.** The production buyer-mail path chains a `.catch` on the queue promise (same pattern as the contact form); the mock must return a settled promise or that `.catch` will fire unhandled.
- **Real DB, not a mocked repository.** `setupTestDb()` provisions a real database; `userRepository.findById` is the actual Mongoose repository, making these true integration tests.
- **`announced()` reads the outbox collection directly** via `outboxEventModel.find(...).lean()`, bypassing any service-level read API.
- **Race test** (`Promise.all` on two `flagPurchaseHoldReview` calls) is the only concurrency scenario in the file; it guards the "once even when two calls race" invariant.
