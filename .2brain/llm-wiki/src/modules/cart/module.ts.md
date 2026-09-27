---
source: src/modules/cart/module.ts
sha256: ebe31af239fad3e4652c5b4a35f37e93782e8f2cbb3363c4475bd88853ed1e72
generated_at: 2026-09-27T14:44:52.403684+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/module.ts

## Purpose

Module manifest for the shopping cart. Registers the cart's routes, permission key, personal-data lifecycle hooks, and domain-event subscription with the kernel so the module participates in routing, authorization, GDPR compliance, and cross-module reactivity without creating circular imports.

## Key elements

- **Default export** (`AppModule`) — the manifest object the kernel reads; fields: `name`, `basePath`, `permissions`, `routes`, `personalData`, `subscribe`, `locales`.
- **`permissions`** — declares the single key `cart.self.checkout`. The basket's *contents* remain keyless; only *spending* the basket requires the key.
- **`personalData`** — two hooks the user module calls back into:
  - `collect` — returns a stripped `[{ productId, quantity }]` array (no joined product name/price, because `CartItem` is `additionalProperties: false`).
  - `erase` — delegates to `cartDeleteByUserId`, which joins the caller's hard-delete transaction (DDD-D6).
- **`subscribe`** — wires `onDomainEvent(PRODUCT_DELETED, …)` → `productRemoveFromCartsById(productId)`, removing a deleted SKU from every cart it appears in.
- **`locales`** — resolved via `path.join(__dirname, 'locales')` for i18n strings.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type that the export must satisfy.
- **`src/kernel/events.ts`** — provides `onDomainEvent`, used inside `subscribe`.
- **`src/modules/cart/routes.ts`** — imported as `router` and attached to the manifest.
- **`src/modules/cart/services/index.ts`** — re-exports `cartGet`, `cartDeleteByUserId`, and `productRemoveFromCartsById` used by the personal-data hooks and event handler.
- **`src/modules/products/index.ts`** — source of the `PRODUCT_DELETED` constant consumed by the subscription.
- **`src/modules.ts`** — the top-level module list that aggregates this export for kernel boot.
- **`tests/support/checkout-modules.ts`** — test fixture that mounts this module alongside other checkout-adjacent modules.

## Notes

- The `collect` hook intentionally maps to bare `{ productId, quantity }` lines, **not** joined product objects. The shared `CartItem` contract forbids extra properties, and product name/price is catalogue data, not user data.
- The user module reaches *back* into this file's `erase` hook (and the product module reaches back via the domain event) so that no direct import of `users` or `orders` is needed — this is what keeps the import graph acyclic.
- `tests/cross-cutting/module-permissions.test.ts` enforces a bidirectional invariant: a key must be present in `shared/authorization-keys.yaml` **and** attributed to this module's `name`. Removing the module without removing the YAML entry (or vice-versa) will fail CI.
