---
source: src/modules/users/services/purchase-hold.ts
sha256: 95581fe7d57dda7a71b14055e9401295e163864744ca5e42d22b6fcf816c92ed
generated_at: 2026-11-14T22:29:55.572592+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/purchase-hold.ts

## Purpose

Implements the **purchase hold** on a user account: a time-boxed block on checkout only (payments, cancellations, withdrawals, and data-rights requests are unaffected). Holds are set either manually by staff or automatically by the orders module after repeated buyer cancellations. The file owns reading, setting, lifting, sweeping, and notifying.

## Key elements

- **`activeHoldOf(user, now)`** – Pure predicate; returns an `ActivePurchaseHold` snapshot if `purchaseHold.until` is still in the future, else `undefined`.
- **`hasPurchaseHoldToClear(user)`** – True when there is a stored hold (in-force or expired-but-unswept) *or* a review flag. Gates the 409 in `liftPurchaseHold`.
- **`purchaseHoldOf(userId, now)`** – Async read; fetches the user and applies `activeHoldOf`. Called by checkout / cart banner.
- **`purchaseHoldCountingSince(userId)`** – Returns the timestamp from which orders should start counting cancellations (later of last hold `setAt` and last staff lift `purchaseHoldResetAt`). Consumed by the orders module.
- **`setPurchaseHold(id, input, context)`** – Staff action. Validates `until` is future, rejects duplicate (409), stores the record, clears any review flag, announces `USER_REVIEW_CLEARED` via outbox, notifies the buyer by email, and writes an audit row.
- **`liftPurchaseHold(id, context)`** – Staff action. Clears hold + flag, stamps `purchaseHoldResetAt` to restart the cancellation count, announces `USER_REVIEW_CLEARED`, audits with an `inForce` metadata flag distinguishing "lifted" from "reviewed, no active hold."
- **`reapExpiredPurchaseHolds(now)`** – Nightly sweep; reduces expired holds to just the `purchaseHoldResetAt` mark (drops note/staff id). Idempotent.
- **`takeAutomaticPurchaseHold(…)`** – `@internal`, friend-only to `orders`. Atomic CAS so racing cancellations produce at most one hold + mail + audit row.
- **`notifyBuyer(…)`** – Internal; builds a localized email via `purchaseHoldPlacedEmail` and enqueues it. Failures are logged, never thrown.
- **`ActivePurchaseHold`** (type) – The minimal shape checkout needs: `until`, `reason`, `note`, `setAt`.
- **`PurchaseHoldBasis`** (interface) – `cancelCount` + `windowDays` passed into the buyer email for automatic holds.

## Relationships

- **`src/infrastructure/http/response.ts`** – All success/reject responses use `generateSuccess`, `generateReject`, and `fieldError` from this adapter.
- **`src/infrastructure/i18n/index.ts`** – `t()` for user-facing error messages; `getDefaultLocale()` as fallback in `notifyBuyer`.
- **`src/infrastructure/adapters/mailer.ts`** – `enqueueEmail` is the sole delivery path for the buyer notification.
- **`src/infrastructure/observability/audit.ts`** – `recordAudit` writes the staff-action audit rows in both set and lift.
- **`src/kernel/outbox.ts`** – `announceInTransaction` co-publishes `USER_REVIEW_CLEARED` / `USER_REVIEW_FLAGGED` events in the same DB transaction as the save, closing the dependent review task atomically.
- **`src/modules/users/audit.ts`** – Supplies the `usersAuditActions` enum values (`ADMIN_USER_PURCHASE_HOLD_SET`, `ADMIN_USER_PURCHASE_HOLD_LIFTED`).
- **`src/modules/users/config.ts`** – Provides `contactFrontendLink` and `privacyFrontendLink` used in the buyer email.
- **`src/modules/orders/services/purchase-hold.ts`** – The orders-side caller: owns the cancellation count, calls `purchaseHoldCountingSince` and `takeAutomaticPurchaseHold`.
- **`src/modules/cart/tests/integration/service.test.ts`** – Exercises the checkout path that queries `purchaseHoldOf`.
- **`src/modules/access/tests/unit/protection.test.ts`** – Verifies access-control rules around staff management of the account.
- **`src/modules/tasks/tests/integration/idempotent-note.test.ts`** – Exercises the outbox event that closes a pending review task.

## Notes

- **Checkout-only gate.** The hold blocks *starting a new checkout* but never blocks paying for an existing order, cancelling, withdrawing, returning, or exercising data-rights. The only caller that "asks" is the checkout flow.
- **No sweep required for expiry.** `activeHoldOf` is a pure time comparison; an expired hold simply reads as absent. The nightly `reapExpiredPurchaseHolds` is housekeeping (frees the note/staff id) and is safe to re-run.
- **409 idempotency guard.** `setPurchaseHold` compares `reason === 'staff'`, `until`, and `note` against the current in-force hold *before* any mail, audit, or save, so a duplicate staff click is a no-op.
- **`withClearedAccount` wrapper.** Both `setPurchaseHold` and `liftPurchaseHold` run inside `withClearedAccount` (from `./cleared-account`), which resolves the user, enforces the 403 `ROLE_MANAGEMENT_REQUIRED` check for staff-on-staff, and provides the in-memory document.
- **Email failure is non-fatal.** By the time `notifyBuyer` runs the hold is already persisted and the cart will surface it; a mail-queue error is logged and swallowed.
- **`takeAutomaticPurchaseHold` is `@internal`.** It is exposed to `orders` via a friend barrel (`friends/orders.ts`), not as a public API of the users module.
- **Counting-since semantics.** Cancellations at or before the later of `purchaseHold.setAt` / `purchaseHoldResetAt` are excluded from the automatic-hold count, preventing a second hold from triggers that were already "answered."
