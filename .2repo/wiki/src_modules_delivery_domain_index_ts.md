# src/modules/delivery/domain/index.ts

## Purpose

Barrel file that exposes the delivery domain's public API (shipping rates) without pulling in the module's HTTP/service surface. It exists so callers can import pure domain rules in isolation, as documented in `docs/theory/domain-layer.md`.

## Key elements

- **`SHIPPING_METHODS`** — re-exported from `./rates`; the set of available shipping method definitions.
- **`findShippingMethod`** — re-exported from `./rates`; looks up a shipping method (by id or similar key).
- **`priceShipping`** — re-exported from `./rates`; computes a shipping price given a method and context.

All three are pure re-exports; no logic lives in this file.

## Relationships

- **`src/modules/delivery/domain/rates.ts`** — sole import target; every symbol this file exports originates there.
- **`src/modules/delivery/index.ts`** — the module's public (HTTP-facing) entry point; this file deliberately avoids depending on it, keeping the domain importable independently.
- **`src/modules/delivery/service.ts`** — the service layer that likely imports from this barrel to access shipping rules without reaching into `rates.ts` directly.
- **`src/modules/delivery/tests/integration/service.test.ts`** — integration tests may import shipping helpers through this barrel.

## Notes

- This is a one-line re-export file: if you need to change behavior, edit `./rates`, not here.
- The module docblock explicitly positions this as the boundary between "domain" (pure rules) and the module's HTTP surface, so avoid adding non-domain (e.g. transport or DI) imports here.
