---
source: src/modules/delivery/index.ts
source_sha256: c71541db1bb557c2f4da2ea355ab130e26c4b755a4e047df0a7fa2f4840d7326
context_sha256: bad0f6bad9c530aa9411c4211f322b86efeaa93c988c8995fd286a1027c995f5
generated_at: 2026-11-22T04:49:55.292659+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/index.ts

## Purpose
Public barrel of the delivery module. It is the only surface sibling modules may import from delivery. It re-exports the module's services, domain rules, events, emails and model types, and keeps the two repositories and the models' runtime private.

## Key elements
- `export * from './services'`: service-layer functions, including `cancelRemainder` (used by `returns`).
- `export * from './domain'`: domain rules, including `findShippingMethod`, `priceShipping` and `shippedQuantities`.
- `export * from './events'`: delivery events.
- `export * from './emails'`: delivery email exports.
- `export type * from './model'`: model types only (no runtime values), so no write handle on a collection is exposed.

## Relationships
- `src/modules/cart/services/checkout.ts`, `src/modules/cart/services/items.ts` and `src/modules/cart/services/view.ts` are cart-side neighbors. According to the header comment, checkout prices the chosen shipping method through `findShippingMethod`/`priceShipping`. This keeps the frozen order total consistent with the `/methods` quote.
- `src/modules/returns/services/cancel-remainder.ts`, `create.ts`, `options.ts`, `receive.ts` and `withdraw.ts` are returns-side neighbors. The header says `returns` reads shipped quantities via `shippedQuantities` and cancels unshipped ones via `cancelRemainder`.
- `src/modules/delivery/services/index.ts`, `src/modules/delivery/domain/index.ts`, `src/modules/delivery/events.ts`, `src/modules/delivery/emails.ts` and `src/modules/delivery/model.ts` are the sources this file re-exports.
- `src/modules/account/tests/contract/shop.contract.test.ts` and `src/modules/returns/tests/contract/api.contract.test.ts` are contract tests linked to this barrel in the graph.

## Notes
- The file contains no logic, only re-exports. Changing what other modules can use means changing these re-exports.
- The header comment links to two documentation pages (a delivery module page and a strategic-DDD page) that describe the import rule and the "published language" barrel pattern.
