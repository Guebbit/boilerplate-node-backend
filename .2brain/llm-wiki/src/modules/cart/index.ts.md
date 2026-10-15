---
source: src/modules/cart/index.ts
sha256: 25703149c29a7ffd872196176ff579d60c5ff36dd4c36cf238d93ce43fc9bd31
generated_at: 2026-10-15T10:23:34.157915+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/index.ts

## Purpose

Public barrel for the cart module. It is the **only** import surface a sibling module is allowed to use (per `docs/theory/strategic-ddd.md` §5). It re-exports the module's services, events, and domain types while deliberately keeping `cartRepository` and the model's runtime values internal, so siblings cannot bypass service-layer rules.

## Key elements

- `export * from './services'` — exposes the cart service API (the intended entry point for all cart mutations/queries).
- `export * from './events'` — exposes cart domain events for cross-module consumers (e.g. notifications).
- `export * from './domain'` — exposes the cart domain layer (entities, value objects, domain logic).
- `export type * from './model'` — exposes **types only** from the model file; no runtime values (such as `cartRepository`) leak to consumers.

## Relationships

- **Imports (re-exports):** `./services/index.ts`, `./events.ts`, `./domain/index.ts`, `./model.ts` — the four internal files whose public API is surfaced here.
- **Imported by sibling modules:** `src/modules/notifications/module.ts` and `src/modules/wishlist/service.ts` consume cart types/services through this barrel.
- **Consumed in cross-module integration tests:** `src/modules/addresses/tests/integration/checkout.test.ts`, `src/modules/notifications/tests/integration/events.test.ts`, `src/modules/wishlist/tests/integration/service.test.ts`, and `tests/integration/order-snapshot-locale.test.ts` import cart symbols via this barrel.

## Notes

- This is a **boundary enforcement point**: the model's runtime (e.g. `cartRepository`) is intentionally *not* re-exported. Adding a `export *` (without `type`) from `./model` would break the architectural rule that siblings go through the service layer.
- Use `export type *` from `./model` to keep the type-only guarantee if you extend the barrel.
- The `@module` docblock and the pointer to `docs/modules/cart.md` are the canonical references for *why* this file is shaped the way it is.
