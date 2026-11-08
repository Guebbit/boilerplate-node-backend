---
source: src/modules/users/services/purchase-hold.ts
sha256: 870f8d1c99c68da4e89254e73a7d130b9de448e7a6bae7f17d6ea36e28717af2
generated_at: 2026-11-08T08:50:45.449368+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/purchase-hold.ts

## Purpose

Implements the purchase-hold mechanism: a time-boxed pause on checkout for one account. It provides pure read helpers (is the hold in force?), staff actions (set / lift a manual hold), the automatic hold triggered by repeated buyer cancellations, a nightly sweep of expired records, and the buyer-notification email. It exists so that a bot loop or a single runaway buyer cannot keep damaging the shop without a human stepping in.

## Key elements

- **`ActivePurchaseHold`** (type) — the four fields a checkout gate or UI banner needs (`until`, `reason`, `note`, `setAt`).
- **`activeHoldOf(user, now)`** — pure; returns the active hold or `undefined`. No I/O.
- **`hasPurchaseHoldToClear(user)`** — pure; true if a hold *or* a review flag is present (drives the 409 in `liftPurchaseHold`).
- **`countingSinceOf(user)`** — pure; the later of `purchaseHold.setAt` and `purchaseHoldResetAt`, i.e. when cancellation counting restarts.
- **`purchaseHoldOf(userId, now?)`** — async read; loads the user document and applies `activeHoldOf`.
- **`purchaseHoldCountingSince(userId)`** — async read; loads the user and applies `countingSinceOf`. Used by the `orders` module.
- **`PurchaseHoldBasis`** (interface) — `{ cancelCount, windowDays }` passed into the buyer email for automatic holds.
- **`setPurchaseHold(id, input, context)`** — staff action. Validates RBAC, rejects past `until`, stores the hold, clears `purchaseHoldFlaggedAt`, announces `USER_REVIEW_CLEARED` in-transaction, notifies the buyer, and writes an audit row.
- **`liftPurchaseHold(id, context)`** — staff action. 409 if nothing to clear; otherwise clears hold + flag, sets `purchaseHoldResetAt` to now, announces `USER_REVIEW_CLEARED` if the flag was set, and audits with `inForce` metadata.
- **`reapExpiredPurchaseHolds(now?)`** — nightly sweep; delegates to `userRepository.reduceExpiredPurchaseHolds`. Idempotent; never touches a hold still in force.
- **`takeAutomaticPurchaseHold(id, until, context, basis)`** — called by `orders` when the cancellation count hits the limit. Atomic (one winner on race), stores the hold, notifies, and audits. *(Signature truncated in source.)*
- **`notifyBuyer(user, hold, basis?)`** — internal. Builds a localized email via `purchaseHoldPlacedEmail`, enqueues it, and logs (never throws) on failure.
- **`saveAnnouncingReview(user, wasFlagged)`** — internal. Saves via `announceInTransaction` so that `USER_REVIEW_CLEARED` is emitted in the same write as the mutation.

## Relationships

- **`@infrastructure/adapters/logger`** — `notifyBuyer` logs email-delivery failures.
- **`@infrastructure/adapters/mailer`** — `enqueueEmail` delivers the buyer notification.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` / `fieldError` shape every HTTP reply.
- **`@infrastructure/i18n`** (`catalog`, `context`, `index`) — `t()` localizes error messages; `getDefaultLocale()` supplies the fallback locale for the email.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the audit trail on set / lift.
- **`@kernel/outbox`** — `announceInTransaction` emits `USER_REVIEW_CLEARED` atomically with the save.
- **`@modules/access`** — `accessService.roleProtectedRefusal` enforces RBAC before any mutation.
- **`../audit`** — `usersAuditActions` provides the stable action identifiers for audit rows.
- **`../config`** — `contactFrontendLink` / `privacyFrontendLink` build the URLs embedded in the buyer email.
- **`../emails`** — `purchaseHoldPlacedEmail` is the template builder for the notification mail.
- **`../events`** — `USER_REVIEW_CLEARED` (emitted on lift/set) and `USER_REVIEW_FLAGGED` (referenced for context) are the domain events tied to this flow.

## Notes

- **No background worker is required for expiry.** `activeHoldOf` simply compares `until` to `now`; an expired hold is a no-op on read. `reapExpiredPurchaseHolds` is a hygiene job that rewrites the document (drops note / `setBy`, records the reset mark), not a correctness gate.
- **`notifyBuyer` is fire-and-forget.** The `Promise` is intentionally not awaited by callers; the hold is already persisted, so a mail failure must not roll back the action. Errors are logged only.
- **Setting a hold clears `purchaseHoldFlaggedAt`.** The flag's job is to alert staff; once a human acts, the flag is retired in the same write.
- **`liftPurchaseHold` is the only place that sets `purchaseHoldResetAt`.** This is what restarts the cancellation counter for the `orders` module, and it is also the "reset" half of `countingSinceOf`.
- **The file is a `@module`** (no default export); all public surface is via named exports.
