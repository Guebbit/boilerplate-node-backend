---
source: src/modules/delivery/domain/index.ts
sha256: 0e1ca28dbe157b0a19adf4d667396ef23d87008f57726182103f3d05ee6e2a56
generated_at: 2026-09-27T14:49:37.393999+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/index.ts

## Purpose

Barrel file for the delivery **domain** layer. It re-exports the rate-related API from `./rates` so that consumers can import shipping rules without pulling in the module's HTTP/service surface. This keeps the domain layer independently importable (see `docs/theory/domain-layer.md`).

## Key elements

- **Re-exported values** (from `./rates`): `SHIPPING_METHODS`, `findShippingMethod`, `priceShipping`, `methodFitsWeight`
- **Re-exported type**: `StaticShippingMethod`
- The file itself declares no logic; it is purely an aggregation point.

## Relationships

- **`domain/rates.ts`** — sole source of every export in this file; all identifiers are re-exported verbatim.
- **`delivery/index.ts`** — the module-level barrel that likely re-exports this file's symbols alongside the service/HTTP surface, giving consumers a single top-level entry.
- **`delivery/service.ts`** — consumes the domain API (presumably importing from this index or directly from `./rates`) to implement the shipping calculation behind the HTTP layer.
- **`tests/integration/service.test.ts`** — exercises the service, which in turn exercises the domain rules re-exported here.

## Notes

- Import from this path (`delivery/domain`) when you only need shipping rules and want to avoid loading the HTTP/service module. Import from `delivery/index` only when you need the full surface.
- Adding a new domain concept means adding a new file next to `rates.ts` and a corresponding `export … from './newFile'` line here.
