---
source: src/modules/wishlist/module.yaml
sha256: e3b9b531ad1a1148ab14a3bfa0d57fe0ab1cc2dec3ceda6940792623e5972873
generated_at: 2026-09-23T19:47:38.991516+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/module.yaml

## Purpose

Module manifest for the **wishlist** subdomain (`supporting`). Declares the module's runtime dependencies so the build system and runtime resolver know which other modules must be initialised before wishlist code executes.

## Key elements

- **`subdomain: supporting`** — classifies wishlist under the *supporting* domain, distinguishing it from core commerce modules (e.g. `orders`, `cart`).
- **`dependsOn`** — ordered list of module IDs the wishlist module requires at runtime:
  - `cart` — needed because the "move-to-cart" action writes a line item into the cart module.
  - `products` — a saved wishlist line references a product; the product record must be resolvable.
  - `users` — the wishlist is owned by an account, so user identity/lookup is required.

## Relationships

- **`src/modules/wishlist/module.ts`** — the TypeScript implementation this YAML file declares. The manifest defines *what* the module needs; `module.ts` defines *how* it behaves.
- **`src/modules/wishlist/openapi.yaml`** — the OpenAPI spec for the wishlist endpoints. It sits alongside this manifest in the same module directory but describes the public API surface, not internal wiring.

## Notes

- The `dependsOn` list is **ordered** (cart → products → users). If the runtime initialises modules in declaration order, reordering entries can change startup sequencing.
- Dependencies are listed by **module ID string**, not by file path. Adding a new dependency requires the target module to already be registered under that exact ID.
- Comments after each dependency are the only documentation of *why* the dependency exists; removing them loses context for future maintainers.
