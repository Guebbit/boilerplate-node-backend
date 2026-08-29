# src/modules/delivery/domain/index.ts

## Purpose

Barrel file that exposes the delivery domain's pure business rules (shipping rates, method lookup, pricing) as a single import path, deliberately decoupled from the module's HTTP/service layer.

## Key elements

- **Re-exports from `./rates`:**
  - `SHIPPING_METHODS` — the static list of available shipping methods.
  - `findShippingMethod` — lookup a method by identifier.
  - `priceShipping` — compute a shipping price given a method (and presumably an order context).

## Relationships

- **`src/modules/delivery/domain/rates.ts`** — sole source of every symbol this file re-exports; no local logic lives here.
- **`src/modules/delivery/index.ts`** — module root; consumers of the public API reach the domain rules through this barrel via that entry point.
- **`src/modules/delivery/service.ts`** — the service layer that applies domain rules (pricing, method resolution) to handle delivery operations.
- **`src/modules/delivery/tests/integration/service.test.ts`** — integration tests exercise the service; they transitively depend on these domain exports.

## Notes

- This file contains no logic of its own — it is purely a re-export facade. If you need to change what's public in the domain, edit the `export { … }` list here (or in `rates.ts` for the declarations).
- The doc comment makes an architectural contract: importing from `domain/` should never pull in HTTP, DI, or transport concerns. Keep it that way when adding new domain rules.
