---
source: src/modules/delivery/index.ts
sha256: 5f203f61d5e30a6a04fffbd1425e159132a69c1376a3c0f158d99c38763ebe69
generated_at: 2026-09-23T18:36:18.644142+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/index.ts

## Purpose

Public barrel for the delivery module. It is the **only** import surface allowed for sibling modules (enforced by the DDD boundary rule in `docs/theory/strategic-ddd.md` §5). It re-exports the service, domain rules, email templates, and model types so that consumers like cart's checkout can price a shipping method without reaching into internal files.

## Key elements

- **`export * from './service'`** — re-exports the delivery service (including `shipmentRepository`-backed operations and `findShippingMethod` / `priceShipping`).
- **`export * from './domain'`** — re-exports domain rules; this is the load-bearing surface that keeps cart's frozen order total consistent with the `/methods` quote.
- **`export * from './emails'`** — re-exports delivery-related email template functions.
- **`export type * from './model'`** — type-only re-export of the delivery model. No runtime value is exposed; the model's runtime (collection handle) deliberately stays internal.

## Relationships

- **`src/modules/cart/services/checkout.ts`** — imports `findShippingMethod` / `priceShipping` through this barrel to price the chosen method; the frozen order total and the `/methods` quote both derive from the same domain path.
- **`src/modules/delivery/domain/index.ts`** — re-exported wholesale; contains the pricing logic that checkout depends on.
- **`src/modules/delivery/service.ts`** — re-exported wholesale; provides the service layer and the internal `shipmentRepository` (the write handle is *not* re-exported to other modules).
- **`src/modules/delivery/emails.ts`** — re-exported; delivery notification email builders.
- **`src/modules/delivery/model.ts`** — type-only re-export; structural types available to consumers, runtime stays private.
- **`tests/cross-cutting/money-reconciliation.property.test.ts`** — imports through this barrel to verify that checkout totals and shipping quotes remain consistent (money-reconciliation property).

## Notes

- The `export type *` for `./model` is intentional: it prevents any sibling module from obtaining a runtime reference to the model or its collection handle. Do not change it to a value re-export.
- `shipmentRepository` lives inside `./service` and is **not** re-exported as a standalone symbol; any write to the shipment collection must go through the service's own API.
- The barrel is the enforcement point for the module boundary — adding a new `export *` here is effectively widening the public API, so follow `docs/theory/strategic-ddd.md` §5 before doing so.
