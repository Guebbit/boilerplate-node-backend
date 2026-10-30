---
source: src/modules/users/services/purchase-hold.ts
sha256: e8cc8fffe397363ea03fc5fb6d1796fbdc464048d65382932ec315abe3d127be
generated_at: 2026-10-29T06:17:33.767790+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/purchase-hold.ts

## Purpose

Implements the "purchase hold": a time-boxed block on **new checkout** for a single account so a human can intervene before a bot or runaway loop causes damage. Can be set manually by staff or triggered automatically after repeated buyer cancellations (owned by the `orders` module). A hold is "in force" purely by clock (`until > now`), so no TTL daemon is needed for correctness. The hold never blocks paying existing orders, cancelling, withdrawals, returns, or data-rights requests—checkout is the only gate that consults it.

## Key elements

- **`activeHoldOf(user, now)`** – Pure check: returns the hold in force at `now` or `undefined`. No I/O; a caller holding the document need not re-read.
- **`hasPurchaseHoldToClear(user)`** – Whether `liftPurchaseHold` has anything to do (a stored hold *or* a review flag). Backs the 409 guard.
- **`countingSinceOf(user)`** – The instant from which cancellations begin counting toward a new automatic hold (later of last hold-set and last staff-lift).
- **`purchaseHoldOf(userId, now?)`** – Async convenience: fetches the user, delegates to `activeHoldOf`.
- **`purchaseHoldCountingSince(userId)`** – Async convenience: fetches the user, delegates to `countingSinceOf`. Consumed by `orders` before incrementing its cancel counter.
- **`setPurchaseHold(id, input, context)`** – Staff action. Validates the `until` date, checks RBAC via `accessService`, stores the hold, clears `purchaseHoldFlaggedAt`, emits `USER_REVIEW_CLEARED` if applicable, notifies the buyer, records audit.
- **`liftPurchaseHold(id, context)`** – Staff action. Clears the hold and flag, stamps `purchaseHoldResetAt` (restarts the cancellation count), emits `USER_REVIEW_CLEARED`, records audit. Returns 409 `USER_PURCHASE_HOLD_NOT_SET` when there is nothing to lift.
- **`reapExpiredPurchaseHolds(now?)`** – Nightly idempotent sweep: reduces expired holds to the reset mark, drops note/staff-id. Safe to re-run.
- **`takeAutomaticPurchaseHold(...)`** – (truncated) Atomic automatic hold after the cancel-count threshold is crossed; racing cancellations yield exactly one hold, one email, one audit row.
- **`notifyBuyer(user, hold, basis?)`** *(private)* – Builds and enqueues the buyer's localized notification email. Errors are **logged, never raised**: the hold is already persisted.
- **`saveAnnouncingReview(user, wasFlagged)`** *(private)* – Persists the user and, when the review flag was cleared, emits `USER_REVIEW_CLEARED` in the same outbox transaction.
- **`ActivePurchaseHold`** / **`PurchaseHoldBasis`** – Exported types for the hold payload and the rule numbers shown in the buyer's email.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@infrastructure/adapters/logger` | Logs email-notification failures in `notifyBuyer`. |
| `@infrastructure/adapters/mailer` | `enqueueEmail` delivers the buyer's hold notification. |
| `@infrastructure/http/response` | `generateSuccess` / `generateReject` / `fieldError` shape all API responses. |
| `@infrastructure/i18n` | `t()` localizes error messages; `getDefaultLocale()` falls back when the user has no stored locale. |
| `@infrastructure/observability/audit` | `recordAudit` writes the audit row for set/lift actions. |
| `@kernel/outbox` | `announceInTransaction` emits `USER_REVIEW_CLEARED` atomically with the document save. |
| `@modules/access` | `accessService.roleProtectedRefusal` enforces RBAC before any mutation. |
| `src/modules/users/audit.ts` | `usersAuditActions` constants identify the audit action strings. |
| `src/modules/users/config.ts` | `contactFrontendLink` / `privacyFrontendLink` supply URLs in the buyer email. |
| `src/modules/users/emails.ts` | `purchaseHoldPlacedEmail` builds the localized email subject + template. |
| `src/modules/users/events.ts` | `USER_REVIEW_CLEARED` / `USER_REVIEW_FLAGGED` event names used in outbox announcements. |
| `src/modules/access/tests/unit/protection.test.ts` | Unit tests exercising the RBAC refusal paths this service delegates to. |

## Notes

- **Pure reads, no side effects.** `activeHoldOf`, `hasPurchaseHoldToClear`, and `countingSinceOf` are synchronous and side-effect-free; the async wrappers (`purchaseHoldOf`, `purchaseHoldCountingSince`) are the only callers of `userRepository.findById`.
- **`setPurchaseHold` clears the review flag as a side effect.** Placing a hold means the flag has done its job, so `purchaseHoldFlaggedAt` is set to `undefined` in the same write.
- **`liftPurchaseHold` restarts the cancellation count** by stamping `purchaseHoldResetAt`; `orders` uses `purchaseHoldCountingSince` to know when the window reopens.
- **Email failure is non-fatal.** By the time `notifyBuyer` runs the hold is already persisted; a broken mailer is logged but never surfaces as an HTTP error to the staff caller.
- **GDPR Art. 22(3).** The `note` field is written *for the buyer to read* (reason + how to contest). The email must include a contact link and a privacy link.
- **`reapExpiredPurchaseHolds` is cleanup, not correctness.** An expired hold is already invisible to `activeHoldOf`; the sweep merely frees the stored note and staff-id.
