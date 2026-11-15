---
source: src/modules/users/tests/integration/purchase-hold.test.ts
sha256: 47dd3deaf159765d49f64c26d692d42c1c9db83b850fb4bf8e6611020a800d2d
generated_at: 2026-11-14T22:36:46.236462+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/purchase-hold.test.ts

## Purpose

Integration tests for the purchase-hold lifecycle on a user record: setting a manual hold (staff door), lifting it, the shop's own automatic hold path, the wire response shape while a hold is in force, and the audit row each write produces. Runs against a real test database with the audit and mail ports replaced by mocks.

## Key elements

- **`describe('setPurchaseHold')`** — validates manual hold creation: note trimming, `setBy` stamping, 422 on past `until`, 404 for missing user, `ROLE_MANAGEMENT_REQUIRED` for cross-role targets, and audit emission.
- **`describe('placing a hold that is already in force')`** — 409 on identical repeat (no mail, no audit, no re-stamp); successful replacement when the note differs (second mail); an automatic hold with the same `until` is *not* treated as a repeat.
- **`describe('liftPurchaseHold')`** — successful lift clears the hold and restarts the counting window; 409 when no hold and no flag exist; audit `inForce` metadata reflects whether the hold was actually active at lift time; flag clearing and repeat-lift 409.
- **Helpers** — `holdMails()` filters `enqueueEmail` calls by the `users.purchase-hold-placed` template; `storedUser(id)` / `storedHold(id)` read past the service via `userRepository`; `inDays(n)` builds a future/past `Date`; `auditedAction(action)` builds an `expect.objectContaining` matcher.
- **Constants** — `AUTOMATIC_BASIS` (`{ cancelCount: 3, windowDays: 7 }`) documents the rule behind automatic holds as stated in the buyer's mail; `DAY` is the ms-per-day multiplier.
- **Mocks** — audit port is fully replaced via `jest.mock` + `auditPortMock()` (not a spy); `enqueueEmail` is a bare `jest.fn()` reset in `beforeEach`.

## Relationships

- **`@modules/users/services` (`userService`)** — the system under test; every assertion targets its return values or side effects.
- **`@modules/users/services/purchase-hold` (`reapExpiredPurchaseHolds`)** — imported for the nightly-sweep scenario (flag set, hold already removed by the sweep).
- **`@modules/users/friends/account` (`accountUserService`)** — imported for role/ownership context in setup.
- **`@modules/users/friends/orders` (`takeAutomaticPurchaseHold`)** — the shop's own automatic-hold path, contrasted with the staff door.
- **`@modules/users/audit` (`usersAuditActions`)** — provides the action constants (`ADMIN_USER_PURCHASE_HOLD_SET`, `…_LIFTED`) asserted in audit calls.
- **`@infrastructure/observability/audit`** — the port under test; replaced wholesale by `auditPortMock()` so `observePort` can capture calls.
- **`@infrastructure/adapters/mailer`** — `enqueueEmail` mocked to verify buyer notifications without hitting the queue.
- **`@infrastructure/http/response`** — `ResponseReject` type used to cast `result` for structured error assertions.
- **`@kernel/outbox` (`outboxEventModel`)** — imported for outbox-related assertions (likely in the truncated section).
- **`@modules/users/tests/factories`** — `createUser` builds fixtures (optionally pre-seeding `purchaseHold`, `purchaseHoldFlaggedAt`); `userRepository.findById` provides direct DB reads to verify persisted state independently of the service.
- **`tests/support/setup-test-db`** — `setupTestDb()` initialises the shared test database once per file.
- **`tests/support/ports`** — `observePort` captures calls on the mocked audit port; `auditPortMock` supplies the replacement.
- **`tests/support/callers`** — `callerContextAs` / `testCallerContext` build the role-bearing caller envelope passed to service methods.

## Notes

- The audit port is **replaced**, not spied on. The `jest.mock` factory delegates to `auditPortMock()` from `tests/support/ports.ts`; `observePort` is the only way to read recorded calls.
- `mockEnqueueEmail.mockResolvedValue(undefined)` in `beforeEach` is required because the buyer-mail code path chains a `.catch` on the returned promise — omitting it surfaces an unhandled-rejection warning.
- `holdMails()` (helper name) filters by the template string `users.purchase-hold-placed`; tests that expect "no second mail" rely on this exact-match filter rather than call-count of `enqueueEmail` overall.
- The 409 repeat test verifies that `setAt` is unchanged (not re-stamped), confirming the guard is a no-op, not a re-write.
- Lift of an already-expired or sweep-removed hold still succeeds (200) but the audit row carries `metadata.inForce: false`, distinguishing "review completed" from "active hold terminated."
- The file is truncated in the provided content; the `reapExpiredPurchaseHolds` describe block and any `outboxEventModel` assertions are not visible here.
