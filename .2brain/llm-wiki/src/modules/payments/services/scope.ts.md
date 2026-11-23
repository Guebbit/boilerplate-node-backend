---
source: src/modules/payments/services/scope.ts
source_sha256: 4696f2a6b339313b64ac86ff58dbb4f0654cf39880b278a82e05271f75ade43f
context_sha256: f4fed7b7940ba64eae516847cf249a9b1fc123f7a2211ced61cff79a37523509
generated_at: 2026-11-22T06:53:37.273326+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/services/scope.ts

## Purpose
Defines the row-scoping rules for the payments collection. Every other payments service reads through these helpers to decide which payments, orders, and fields a caller may touch. It separates the broad READ scope from the narrower, owner-only scope used for money-moving steps.

## Key elements
- `callerScope(context?)`: the READ scope. Returns `accessibleFilter(context, 'Payment')`. Payments are never soft-deleted, so ownership is the only axis, unlike orders' "own AND still there".
- `payerScope(context?)`: the scope for CONFIRM and SYNC. With a caller, it returns the payment repository's owner scope for that caller's id, so only their own payments match. With no caller, it falls back to `callerScope(undefined)`, the anonymous read scope, which matches nothing.
- `buyerOrderScope(context?)`: the orders a caller may open a payment intent on. With a caller, it returns the orders service's own-live scope for that caller's id, so only their own live orders match. With no caller, it falls back to the orders service's anonymous caller scope.
- `readsAllPayments(context?)`: returns true only when a context exists and the caller's rules for `Payment` hold `display:Payment`. It is used to decide whether the provider's own ids and a refund's failure reason may be sent.

## Relationships
- `src/kernel/access/query.ts` supplies `accessibleFilter`, which `callerScope` wraps.
- `src/kernel/permissions.ts` (`callerForSubject`) and `src/kernel/ability.ts` (`heldRules`) are used by `readsAllPayments` to check the held rules.
- `src/modules/orders/index.ts` exposes the `orderService` used by `buyerOrderScope`. `callerScope` mirrors the orders rule over this module's collection.
- `src/modules/payments/repository.ts` supplies `paymentRepository`, used by `payerScope` to build the owner scope.
- `src/types/auth-context.ts` and `src/types/index.ts` relate to the `AuthContext` type, which is imported from `@types`.
- The sibling services (`intent`, `refunds`, `external-refunds`, `settlement`, `list`, `view`) sit next to this file in the dependency graph. The file's own header says all of them read through it, but their exact usage isn't visible here.

## Notes
- Do not use `callerScope` for confirm or sync. A role holding `display:Payment` would widen it to everyone's payments, which is why `payerScope` exists. `buyerOrderScope` follows the same reasoning for `display:Order`.
- `readsAllPayments` checks the key name `display:Payment` in the held rules, not the `holds` helper. `holds` would also return true for `read:Payment`.
- Every helper accepts an optional context. Without one, the result is the anonymous scope, which matches nothing, so the default is deny.
