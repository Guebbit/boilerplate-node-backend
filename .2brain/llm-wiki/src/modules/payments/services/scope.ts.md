---
source: src/modules/payments/services/scope.ts
sha256: 4696f2a6b339313b64ac86ff58dbb4f0654cf39880b278a82e05271f75ade43f
generated_at: 2026-10-29T05:13:38.750655+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/scope.ts

## Purpose

Centralises the row-scoping rules for the payments collection so that every other service in this module applies a consistent "who can see/do what" filter. It separates **read** scope (possibly broad, role-driven) from **payer** scope (strictly the payer's own rows) to prevent a `display:Payment` role from accidentally granting cross-customer write or payment-intent access.

## Key elements

- **`callerScope(context?)`** — Returns an accessible-filter for the `Payment` collection. This is the READ scope; it may be broad for roles that hold `display:Payment`.
- **`payerScope(context?)`** — Returns a filter limited to the caller's own payments (`paymentRepository.ownerScope`). Used for CONFIRM and SYNC operations. Falls back to the anonymous read scope (matches nothing) when `context` is undefined.
- **`buyerOrderScope(context?)`** — Returns a filter for the buyer's own *live* orders (`orderService.ownLiveScope`), used when opening a payment intent. Falls back to `orderService.callerScope(undefined)` when `context` is undefined.
- **`readsAllPayments(context?)`** — Boolean: whether the caller holds `display:Payment`. When true the caller may be sent provider-side IDs and refund failure reasons.

## Relationships

- **`@kernel/access/query`** — `accessibleFilter` builds the base read filter consumed by `callerScope`.
- **`@kernel/permissions`** — `callerForSubject` resolves the caller identity inside `readsAllPayments`.
- **`@kernel/ability`** — `heldRules` checks the resolved caller's rule set in `readsAllPayments`.
- **`@modules/orders`** — `orderService.ownLiveScope` / `orderService.callerScope` supply the order-side scope used by `buyerOrderScope`.
- **`../repository`** — `paymentRepository.ownerScope` produces the per-owner filter used by `payerScope`.
- **`@types`** — `AuthContext` is the context parameter type across all four exports.

## Notes

- Payments are **never soft-deleted**, so ownership is the only scoping axis here (unlike orders, which also check a "still present" predicate).
- `payerScope` and `buyerOrderScope` are deliberately **narrower** than `callerScope`. A role that only holds `display:Payment` passes `readsAllPayments` but does **not** widen the payer scope — payer actions always resolve to the caller's own ID.
- `readsAllPayments` checks for `display:Payment` specifically. The code comment warns that a generic `holds` check would also match `read:Payment`, which is intentionally excluded.
- When `context` is `undefined`, `payerScope` degrades to `callerScope(undefined)` (anonymous, matches nothing) rather than returning an empty object, keeping the "scope is a filter" contract uniform.
