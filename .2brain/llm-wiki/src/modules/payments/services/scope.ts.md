---
source: src/modules/payments/services/scope.ts
sha256: 05c85e6f7b5d4ef2a4e52a04151cbdc3681ecd0e0ed6b52374672ef9a582d39d
generated_at: 2026-10-15T11:31:49.118065+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/scope.ts

## Purpose
Defines the four row-level scoping rules for the payments collection. Every other payments service and controller consults these helpers instead of re-deriving "which rows does this caller see?" logic, ensuring a single, consistent permission boundary across the module.

## Key elements
- **`callerScope(context?)`** – Returns a filter for payments the caller may **read**. Delegates to `accessibleFilter(context, 'Payment')`. Payments are never soft-deleted, so ownership is the only axis.
- **`payerScope(context?)`** – Returns a filter for payments the caller may **confirm or sync** (the customer's money steps). Restricted to the payer's own rows via `paymentRepository.ownerScope`. With no context, falls back to the anonymous read scope (matches nothing).
- **`buyerOrderScope(context?)`** – Returns a filter for the orders on which the caller may **open a payment intent**. Combines `orderService.ownerScope(context.id)` with `deletedAt: null` to require the order is the buyer's and still live.
- **`readsAllPayments(context?)`** – Boolean guard: true only when the caller holds the `payments.any.read` key (checked via `heldKeys` / `callerForSubject`). Used to decide whether to expose provider IDs and refund failure reasons.

## Relationships
- **`src/kernel/access/query.ts`** – Supplies `accessibleFilter`, the generic "which rows does this context see?" primitive that `callerScope` wraps.
- **`src/kernel/permissions.ts`** – Supplies `callerForSubject`, which resolves the permission subject for a given AuthContext and resource; used by `readsAllPayments`.
- **`src/kernel/ability.ts`** – Supplies `heldKeys`, which enumerates the key set a subject holds; used by `readsAllPayments`.
- **`src/modules/orders/index.ts`** (→ `src/modules/orders/services/index.ts`) – Exposes `orderService`, whose `ownerScope` and `callerScope` methods provide the order-side ownership filter that `buyerOrderScope` composes.
- **`src/modules/payments/repository.ts`** – Exposes `paymentRepository.ownerScope`, the concrete "rows owned by this user" filter used by `payerScope`.
- **`src/types/auth-context.ts`** – Provides the `AuthContext` type that every scope function accepts.
- **`src/modules/payments/services/index.ts`** – Re-exports these helpers so sibling services (`intent`, `list`, `refunds`, `settlement`, `view`) and the controllers (`post-payment-offline`, `post-payment-refund`) can import them without reaching into this file directly.

## Notes
- `callerScope` is the **read** scope; `payerScope` is the **write/money** scope. They intentionally differ: a role with `payments.any.read` widens `callerScope` but never touches `payerScope`. Do not substitute one for the other.
- `readsAllPayments` checks the key `payments.any.read` specifically; `holdsKey` would also match `payments.self.read`, so the name is load-bearing.
- When `context` is `undefined`, all three filter functions return the anonymous scope (effectively an empty match), so a missing auth context never accidentally grants access.
- `buyerOrderScope` adds `deletedAt: null` because orders *are* soft-deleted (unlike payments), making that axis necessary here.
