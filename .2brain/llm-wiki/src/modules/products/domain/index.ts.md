---
source: src/modules/products/domain/index.ts
sha256: bfa69112f147458bd8a12eecf4b4fcf93c073f65c5cd5e1984055ffde9830334
generated_at: 2026-09-27T15:31:37.685366+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/domain/index.ts

## Purpose

Barrel file that exposes the products domain layer's public API. It lets consumers import pure domain logic (e.g. stock calculations) without pulling in the module's HTTP surface or other infrastructure.

## Key elements

- **`availableStock`** (re-export from `./stock`) — the single domain rule currently exposed through this barrel. Callers import it as `import { availableStock } from '…/products/domain'`.

## Relationships

- **`./stock`** (`src/modules/products/domain/stock.ts`) — defines `availableStock`; this file is its re-export point.
- **`src/modules/products/index.ts`** — the module's top-level (HTTP) entry point. This domain barrel is intentionally *separate* from it so that importing domain rules does not drag in route handlers or transport concerns.

## Notes

- Adding a new domain rule here is the sanctioned way to widen the domain's public surface. Consumers should import from this barrel (or the full path to `stock`) rather than reaching into internal files.
- The JSDoc points to `docs/theory/domain-layer.md` for the layering rationale; consult it before adding non-domain logic to this barrel.
