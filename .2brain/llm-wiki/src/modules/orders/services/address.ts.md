---
source: src/modules/orders/services/address.ts
sha256: 3ea33b5bf648a563c60c6300e6db19efee2baf293ec6555b31b84ac3dfb8f09e
generated_at: 2026-11-08T06:55:44.676445+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/address.ts

## Purpose

Implements the staff-facing `PUT /orders/{id}/shipping-address` endpoint: correcting the destination of order units that have not yet been dispatched. It exists because nothing else in the system can change an address after checkout, and each shipment retains its own frozen copy (Solidus model), so a held `incorrect_address` order has no other path to fix its delivery.

## Key elements

- **`correctShippingAddress(orderId, address, context)`** — the sole export. Loads the order via `orderRepository.findByIdScoped`, then guards in sequence: 404 (unknown order), 409 (`canCorrectAddress` fails — all units dispatched or no shipping address), 422 (country not in the shop's ship-to list). On success it runs `withTransaction(withTimeline(...))` to atomically replace the address and append a timeline row, then records an audit entry and returns the updated `OrderDocument`.
- **`locked()`** — internal helper producing the 409 `ORDER_ADDRESS_LOCKED` response.
- **`unsupportedCountry()`** — internal helper producing the 422 `ORDER_SHIP_TO_COUNTRY_NOT_SUPPORTED` response.

## Relationships

| Neighbor | Interaction |
|---|---|
| `infrastructure/http/response.ts` | Consumes `generateReject`, `generateSuccess`, and the `ResponseReject` / `ResponseSuccess` types for all return paths. |
| `infrastructure/i18n` (`index.ts` / `context.ts`) | Calls `t()` for user-facing error messages. |
| `infrastructure/observability/audit.ts` | Calls `recordAudit` after a successful write. |
| `infrastructure/runtime/database.ts` | Wraps the write in `withTransaction` so the address update and timeline row commit atomically. |
| `modules/orders/audit.ts` | Reads `ordersAuditActions.ADMIN_ORDER_ADDRESS_CORRECTED` as the audit action key. |
| `modules/orders/domain/index.ts` (→ `withdrawal.ts`) | Calls `canCorrectAddress(order)` to decide whether the order still has mutable shipping units. |
| `modules/orders/model.ts` | Imports the `OrderDocument` type used as the success payload. |
| `modules/orders/repository.ts` | Calls `orderRepository.findByIdScoped` (read) and `orderRepository.replaceShippingAddress` (write). |
| `modules/orders/services/timeline.ts` | Composes `withTimeline` to append an `address_corrected` row alongside the DB write. |
| `modules/shop/index.ts` (→ `service.ts`) | Calls `shipToCountries()` to validate the target country against the shop's supported set. |
| `modules/orders/services/index.ts` | Barrel that re-exports this service for route handlers. |
| `types/auth-context.ts` | Source of the `CallerContext` type passed into the function. |

## Notes

- The address value itself is **never** written to the audit log or the timeline; only the actor id and the action type are recorded. The corrected address remains encrypted under the order id in the document store.
- `replaceShippingAddress` receives `order.status` as a guard parameter — if a concurrent dispatch or status change has moved the order since the initial read, the repository returns `null`, which the service maps to the same 409 `locked()` response (optimistic concurrency).
- The 422 country check mirrors checkout's validation: redirecting an order to a country outside the shop's ship-to list would invalidate the VAT already charged.
- `withTransaction` and `withTimeline` are composed (outer → inner), so the timeline write participates in the same DB transaction as the address update; both roll back together on failure.
