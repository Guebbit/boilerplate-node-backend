---
source: src/modules/users/tests/integration/purchase-hold.test.ts
sha256: f4c651568a2e4da60ed6a9d5daeda3dd15d0c725070bce5cad817f9d068af3e7
generated_at: 2026-10-29T06:21:51.692101+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/purchase-hold.test.ts

## Purpose

Integration tests for the purchase-hold feature on user records. Covers the two staff actions (set and lift a hold), the system's automatic/nightly sweep entry point, the review-flag outbox announcements, staff permission gating, and the audit rows each write produces. Runs against a real test database rather than in-memory fakes.

## Key elements

- **`setPurchaseHold` block** — Verifies manual hold placement: note trimming, `reason: 'staff'`, `setBy` persistence, 422 on past `until`, 404 on missing account, `ROLE_MANAGEMENT_REQUIRED` on cross-role targets, and the `ADMIN_USER_PURCHASE_HOLD_SET` audit row.
- **`liftPurchaseHold` block** — Verifies hold removal, 409 when no hold/flag exists, audit `metadata.inForce` true/false, review-flag clearing, idempotency (second lift returns 409, single audit row), and 404.
- **`the review flag announced` block** — Reads `outboxEventModel` rows to confirm `user.review_flagged` (idempotent under concurrent calls) and `user.review_cleared` (on set or lift of a flagged account) are written exactly once per transition.
- **`the review flag` block** — Confirms `flagPurchaseHoldReview` sets the flag without a hold and audits as the system; placing a hold clears the flag.
- **`reapExpiredPurchaseHolds`** — Imported from the service; the nightly sweep that expires holds (tests presumably in the truncated portion).
- **Helpers** — `holdMails()` filters queued emails by template; `announced()` sorts outbox rows by `_id`; `inDays(n)` offsets `Date.now()`; `auditedAction(a)` wraps `expect.objectContaining`.

## Relationships

- **`src/modules/users/services/purchase-hold.ts`** — Primary subject: `setPurchaseHold`, `liftPurchaseHold`, `flagPurchaseHoldReview`, `reapExpiredPurchaseHolds`.
- **`src/modules/users/services/index.ts`** — Provides the `userService` facade under test.
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds records; `userRepository.findById` reads stored state for assertions.
- **`src/modules/users/audit.ts`** — `usersAuditActions` constants used in every audit assertion.
- **`src/infrastructure/observability/audit.ts`** — Replaced (not spied) via `jest.mock` → `ports.ts` `auditPortMock`; captured with `observePort`.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` mocked as `jest.fn()`; assertions filter on template name.
- **`src/infrastructure/http/response.ts`** — `ResponseReject` type for status/error-shape assertions.
- **`src/kernel/outbox.ts`** — `outboxEventModel` queried directly to verify outbox rows.
- **`tests/support/callers.ts`** — `callerContextAs`, `testCallerContext` build caller identities.
- **`tests/support/ports.ts`** — `observePort` and `auditPortMock` replace the real audit port.
- **`tests/support/setup-test-db.ts`** — Provisions and tears down the test database for the whole suite.

## Notes

- The audit port is **replaced** (module-level `jest.mock` pointing at `ports.ts`), not wrapped with `jest.spyOn`. This means no real `emitAuditEvent` code runs; all audit assertions go through `observePort`.
- `enqueueEmail` must resolve to `undefined` (not reject) because the production code chains a `.catch` on the returned promise; an unhandled rejection would fail the test run.
- Tests use `expect.objectContaining` for audit events and `toMatchObject` for response shapes — partial matching is intentional; extra fields on the wire are not asserted here.
- The `announced()` helper sorts by `_id` (insertion order in the real DB), so outbox assertions are order-sensitive.
- `reapExpiredPurchaseHolds` is imported at the top; its `describe` block is in the truncated tail of the file.
