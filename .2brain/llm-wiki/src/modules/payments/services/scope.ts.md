---
source: src/modules/payments/services/scope.ts
sha256: 4696f2a6b339313b64ac86ff58dbb4f0654cf39880b278a82e05271f75ade43f
generated_at: 2026-11-08T07:29:23.081399+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/scope.ts

## Purpose

Defines the four row-scope predicates every other payment service calls before reading or writing the `Payment` collection. It centralises the distinction between *read* scope (role-driven, may span all records) and *payer/buyer* scope (strictly the caller's own records), so that money-moving operations never inherit a broad `display:*` grant.

## Key elements

- **`callerScope(context?)`** — Returns the Mongo filter for payments a caller is permitted to *read*. Delegates to `accessibleFilter(context, 'Payment')`.
- **`payerScope(context?)`** — Returns the filter for payments a caller may **CONFIRM** or **SYNC**. Resolves to `paymentRepository.ownerScope(context.id)` when a caller exists; falls back to the anonymous `callerScope` (matches nothing).
- **`buyerOrderScope(context?)`** — Returns the filter for *orders* a caller may open a payment intent against. Uses `orderService.ownLiveScope(context.id)` for authenticated callers; anonymous fallback is `orderService.callerScope(undefined)`.
- **`readsAllPayments(context?)`** — Boolean: `true` when the caller holds the `display:Payment` ability (checked via `heldRules` + `callerForSubject`). Used to gate provider-level fields (provider IDs, refund failure reasons) in responses.

## Relationships

- **`@kernel/access/query`** — `accessibleFilter` is the generic role→filter resolver that `callerScope` wraps for the `Payment` collection.
- **`@kernel/ability` / `@kernel/permissions`** — `heldRules` and `callerForSubject` together answer "does this caller hold ability X on Y?" for `readsAllPayments`.
- **`@modules/orders` (`orderService`)** — Supplies `ownLiveScope` and `callerScope` so `buyerOrderScope` can filter orders without re-implementing order-scoping logic.
- **`../repository` (`paymentRepository`)** — Provides `ownerScope`, the canonical "belongs to user X" filter reused by `payerScope`.
- **Sibling services** (`intent.ts`, `list.ts`, `refunds.ts`, `settlement.ts`, `view.ts`) — All import these predicates (via `services/index.ts`) to gate their queries; none of them define their own scope logic.

## Notes

- The critical invariant: `payerScope` and `buyerOrderScope` **never** call `accessibleFilter` for an authenticated caller. A role that merely holds `display:Payment` or `display:Order` can read broadly but must not gain the ability to confirm, sync, or create payment intents on other users' records.
- Payments are never soft-deleted, so there is no "still there" axis here—unlike the orders scope pair mentioned in the doc comment.
- The anonymous fallbacks intentionally return a filter that matches nothing (or the generic read scope with no caller), ensuring no data leaks when `AuthContext` is absent.
