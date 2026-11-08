---
source: src/modules/wishlist/index.ts
sha256: 0f22743dd22e8bb53819fc5c6a148ebefb06865a88ed5dc0a37b7a42ae1146bb
generated_at: 2026-11-08T09:12:41.859000+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/index.ts

## Purpose

Public barrel (module facade) for the Wishlist module. It is the **only** import surface a sibling module is allowed to use, per the strategic DDD rule documented in `docs/theory/strategic-ddd.md` §5. Internal consumers (tests, other wishlist files) import sub-modules directly; everything outside the module goes through this file.

## Key elements

- `export * from './service'` — re-exports all value and type exports (functions, classes, constants) from the wishlist service layer.
- `export * from './events'` — re-exports all value and type exports (event definitions, emitters) from the wishlist events layer.
- `export type * from './model'` — re-exports **types only** (interfaces, type aliases) from the wishlist domain model; no runtime values are exposed.
- `export type * from './presenter'` — re-exports **types only** (view-model interfaces, state shapes) from the wishlist presenter layer.

## Relationships

- **Re-exports** (direct dependency): `service.ts`, `events.ts`, `model.ts`, `presenter.ts` — this file's sole runtime role is to re-export their public symbols.
- **Consumers** (import *from* this barrel): sibling modules such as `src/modules/shop-tasks/module.ts` and cross-module tests (`src/modules/cart/tests/integration/product-restored-meanwhile.test.ts`, `src/modules/shop-tasks/tests/integration/notices.test.ts`) import wishlist symbols exclusively through this entry point.

## Notes

- The split between `export *` and `export type *` is intentional: `service` and `events` export runtime values (functions, classes), while `model` and `presenter` are exposed as type-only. Do not change a `type` export to a value export (or vice-versa) without checking whether the sub-module actually produces runtime output.
- Because this is the sole external surface, adding a new sub-module file does **not** make it automatically visible to siblings — it must be explicitly re-exported here.
- Sibling modules must never deep-import (e.g. `import … from '../wishlist/service'`); that bypasses the facade and violates the DDD boundary rule.
