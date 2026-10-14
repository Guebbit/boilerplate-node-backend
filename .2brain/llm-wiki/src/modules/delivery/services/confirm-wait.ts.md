---
source: src/modules/delivery/services/confirm-wait.ts
sha256: 2222128d92365a8e6c46457088a1a338fa79feca811d49fd83e3d8b5c63a1bb3
generated_at: 2026-10-14T15:27:56.979293+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/confirm-wait.ts

## Purpose

Implements the buyer's "keep waiting" action on a late preorder: it transitions the fulfillment order's consent to `confirmed` and clears the `consentDeadline`, thereby cancelling the window after which silence would trigger an automatic cancel-and-refund. Only the order's own buyer may invoke it; staff cannot consent on the buyer's behalf (FTC 16 CFR 435.2, CRD Art. 18).

## Key elements

- **`confirmWait(fulfillmentOrderId, authContext, context)`** — the sole export. Validates the caller is the buyer (404 → 403 checks), then inside `runAct` (optimistic-concurrency session) claims the order with `consent: confirmed` and `unset: ['consentDeadline']`. On success, appends a `wait_confirmed` timeline event to the parent order, records an audit entry, and returns the order-shaped view via `viewFulfillmentOrder`.
- Uses `isAwaitingAnswer` as a guard: if the order is not in the "awaiting answer" state, a 409 with `DELIVERY_NOT_AWAITING_ANSWER` is returned (prevents double-confirmation or acting on already-resolved orders).
- Uses `fulfillmentOrderRepository.claim` with the caller's `revision` for optimistic-concurrency control; a stale revision yields another 409.

## Relationships

- **`../domain`** (`isAwaitingAnswer`) — gates the state transition; the order must be in the "awaiting answer" phase before consent can be set.
- **`../audit`** (`deliveryAuditActions`) — provides the `BUYER_WAIT_CONFIRMED` action identifier for the audit log.
- **`../repository`** (`fulfillmentOrderRepository`) — `findById`, `findInSession`, and `claim` for optimistic-concurrency reads and the write.
- **`./act`** (`runAct`, `refuse`, `refuseMissing`) — wraps the transactional session and standardizes error responses.
- **`./actions`** (`viewFulfillmentOrder`) — shapes the stored order + parent order into the API response view.
- **`@modules/orders`** (`orderService`) — ownership check (`callerScope` + `userId` comparison) and `appendTimeline` for the `wait_confirmed` event.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` for the HTTP envelope.
- **`@infrastructure/i18n`** — `t()` for localized error messages.
- **`@infrastructure/observability/audit`** — `recordAudit` for the structured audit entry.
- **`@types/auth-context`** — `AuthContext`, `CallerContext`, `FulfillmentOrder`, `FulfillmentConsent`.
- **`tests/integration/preorder-late.test.ts`** — integration coverage for this flow.

## Notes

- The function performs an **initial read outside** the transaction (`findById`), then re-reads **inside** the session (`findInSession`) to detect concurrent state changes. This two-phase read is the pattern shared with other delivery services; do not remove the inner read.
- Ownership is enforced at two levels: the parent order's `userId` must match `authContext.id`, and the fulfillment order is scoped to that order. A 404 (not 403) is returned for a foreign fulfillment order, deliberately leaking no existence information.
- `unset: ['consentDeadline']` is passed alongside the consent value in a single `claim` call; the deadline is not merely nulled but removed from the document.
- The i18n key `delivery.not-awaiting-answer` is used for both the "not in awaiting state" and "stale revision" paths, so callers see the same user-facing message in both 409 cases.
