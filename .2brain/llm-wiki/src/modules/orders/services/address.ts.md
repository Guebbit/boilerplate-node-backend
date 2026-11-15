---
source: src/modules/orders/services/address.ts
sha256: 1276a127ead85008c22b28a59daae7a1d86f040c5fd2f4e0ecbcb8c4f453fd6b
generated_at: 2026-11-14T20:42:02.756007+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/address.ts

## Purpose

Implements the staff-facing `PUT /orders/{id}/shipping-address` handler: it replaces the shipping address on units that have not yet left, since no other code path can change an address after checkout. It is intentionally narrow — it writes the new address, emits one timeline entry, and records one audit row, and nothing else.

## Key elements

- **`correctShippingAddress(orderId, address, context)`** — the sole export. Loads the order scoped to the caller, validates correctability, country, and status, then performs the write inside a transaction + timeline wrapper. Returns the updated `OrderDocument` (200) or a 404 / 409 / 422 reject.
- **`locked()`** (module-private) — builds the canonical 409 `ORDER_ADDRESS_LOCKED` response used when no units remain to ship or the order has no shipping address (pickup / digital).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/orders/repository.ts` | Imports `orderRepository` for both the scoped read and the conditional status-guarded write (the write returns `null` on a concurrent status race). |
| `src/modules/orders/domain/index.ts` | `canCorrectAddress` — domain guard that decides whether the order is still in a state where redirection is valid. |
| `src/modules/orders/services/timeline.ts` | `withTimeline` wraps the repository call and appends an `{ type: 'address_corrected', actor }` row atomically. |
| `src/modules/orders/audit.ts` | Provides the `ordersAuditActions` constants used to label the audit entry. |
| `src/infrastructure/observability/audit.ts` | `recordAudit` writes the observability audit row (who, action, target — never the address payload). |
| `src/infrastructure/runtime/database.ts` | `withTransaction` scopes the write so the address swap and timeline insert are atomic. |
| `src/infrastructure/http/response.ts` | `generateSuccess` / `generateReject` shape every HTTP response. |
| `src/infrastructure/i18n/index.ts` | `t()` localises all user-facing messages. |
| `src/modules/shop/index.ts` | `shipToCountries()` supplies the allowed-country list for the 422 validation (same list checkout enforces). |
| `src/types/auth-context.ts` | `CallerContext` and `OrderAddress` types. |

## Notes

- **No address in audit or timeline.** The audit row and timeline entry record *who* acted and *what* they did; the new address value appears only in the encrypted order document.
- **Per-shipment address copies.** Already-dispatched parcels retain the address they were sent to. Only units still in the "unsent" pool receive the correction.
- **Double 409 guard.** `canCorrectAddress` is checked before the transaction; the repository write re-checks status inside the transaction and returns `null` on a concurrent dispatch or status change. Both paths surface the same `locked()` 409.
- **Country check mirrors checkout.** A redirect to a non-shippable country would invalidate the VAT charged at checkout, so the same `shipToCountries` list is enforced here (422).
- **Authorization is upstream.** The route is expected to require `update:Order`; this service does not re-check permissions.
