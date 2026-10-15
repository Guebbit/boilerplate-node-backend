---
source: src/modules/wishlist/module.yaml
sha256: 595d0933bffc5821e32625464b5c4fffda43449e90f50784be73c721b3f81a7e
generated_at: 2026-10-15T12:26:40.434400+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/module.yaml

## Purpose
Declarative metadata for the wishlist module. It classifies the module within the domain model, declares its inter-module dependencies, and records its audit-policy exemption. Exists so tooling and humans can resolve module boundaries without reading the implementation.

## Key elements
- **`summary`** — one-line description: "Saved products, one list per user."
- **`subdomain: supporting`** — marks wishlist as a supporting (non-core) subdomain.
- **`group: shop`** — assigns the module to the shop domain group.
- **`dependsOn`** — lists runtime module dependencies: `cart` (move-to-cart writes a line) and `products` (a saved line is meaningless without a product).
- **`noAudit`** — opts the module out of audit logging; justification: operations are low-stakes (no money, stock, or identity attached).

## Relationships
- **`src/modules/wishlist/module.ts`** — the TypeScript implementation this YAML describes; the `dependsOn` entries constrain its import surface.
- **`src/modules/wishlist/openapi.yaml`** — companion OpenAPI spec defining the REST endpoints the module exposes.

## Notes
- `dependsOn` references sibling modules by short name (`cart`, `products`), not by file path. Resolution is expected to be relative to the module group.
- The `noAudit` value is a prose justification, not a boolean flag — consumers must check for the key's *presence* rather than parse its value.
