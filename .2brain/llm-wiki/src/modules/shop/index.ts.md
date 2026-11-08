---
source: src/modules/shop/index.ts
sha256: d7870e247bc9fca8ac0a6ebddff88484b32bd902c39145dba09c06b023d35a56
generated_at: 2026-11-08T08:20:24.405406+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop/index.ts

## Purpose

Public barrel (module facade) for the **shop** domain module. It is the *only* import surface that sibling modules (cart, delivery, etc.) are permitted to use, enforcing the cross-module boundary rule defined in `docs/theory/strategic-ddd.md` §5. It re-exports the shop service while deliberately withholding internal wiring (config slice, manifest) from the public API.

## Key elements

- **`export * from './service'`** — the sole statement; re-exports the entire public API of the shop service module so consumers can `import { … } from '@modules/shop'` without reaching into sub-paths.

## Relationships

- **cart / delivery modules** (e.g. `cart/services/checkout.ts`, `delivery/services/process.ts`, `delivery/presenter.ts`, and their test suites) import the shop service *through this barrel* rather than reaching into `shop/service` directly. This keeps the dependency direction explicit: siblings depend on the shop module's public face, never on its internals.
- **`src/modules/shop/service`** — the actual implementation that this barrel delegates to; all named exports visible to consumers originate there.

## Notes

- This file is intentionally a one-liner. Adding new exports here is the mechanism for widening the public API; conversely, anything that appears only in internal sub-files (config, manifest) is *not* re-exported and is therefore invisible to sibling modules.
- Do not import sub-paths like `@modules/shop/service` from outside the shop module—use this barrel. Linting or the DDD rule in the docs is the enforcement mechanism.
