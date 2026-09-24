---
source: src/modules/orders/module.ts
sha256: fef5b4cbb33b48f0c94b0f5144611f7ff4671f9983e0d3e3fd3b2fb8c5e85ec5
generated_at: 2026-09-23T19:04:18.074412+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/module.ts

## Purpose

Module manifest for the **orders** domain. It registers the module's identity (name, base path, permissions, routes), wires domain-event subscriptions (reservation expiry, user deletion, product removal), declares the GDPR data-export query, and pins the storefront/admin scenario states — all in a single `AppModule` object that the kernel's registry consumes at boot.

## Key elements

- **`default export`** (`satisfies AppModule`) — the full manifest: `name`, `basePath`, `permissions`, `routes`, `requiredConfig`, `personalData`, `subscribe`, `locales`, `rateLimits`, `scenario`.
- **`subscribe`** — registers three event handlers:
  - `RESERVATION_EXPIRED` → calls `cancelById(orderId, SYSTEM_ACTOR)` so the shop cancels timed-out orders (avoids an import cycle with `inventory`).
  - `USER_DELETED` → calls `detachUserId` to null the foreign key without destroying the order row.
  - `PRODUCT_DELETED` / `PRODUCT_DEACTIVATED` → calls `cancelPendingOrdersHolding` only on hard-delete or deactivation; soft-delete is a no-op.
- **`personalData`** — paginated GDPR export using `readAll` + `search` scoped by `ownerScope(subject.userId)`.
- **`requiredConfig`** — mandates `NODE_SHOP_COUNTRY` (non-empty) for invoice jurisdiction.
- **`scenario.shop`** — ordered list of 12 shop-scenario state names that `scenarios/flows/shop-history.ts` must reach; `shop.test.ts` asserts bidirectional equality.
- **Side-effect import of `./events`** — registers `ORDER_CANCELLED`, `ORDER_CREATED`, `ORDER_STATUS_CHANGED` into the kernel's `DomainEventMap`; no local listeners remain.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@kernel/registry` | `AppModule` type contract satisfied by the default export. |
| `@kernel/permissions` | `SYSTEM_ACTOR` used as the acting identity for reservation-expiry cancellations. |
| `@kernel/events` | `onDomainEvent` powers the three subscriptions in `subscribe`. |
| `@modules/inventory` | Imports `RESERVATION_EXPIRED` event constant; the handler calls back into this module's `cancelById`, which in turn calls `releaseForOrder` — the two paths converge without double-release. |
| `@modules/users` | Imports `USER_DELETED`; `services/cancel.ts` and `services/crud.ts` call `userService.getById` for the buyer's stored locale (email i18n). |
| `@modules/products` | Imports `PRODUCT_DELETED`, `PRODUCT_DEACTIVATED`; line items embed a *copy* via `orderLineProductSchema`, never a live `productSchema` reference. |
| `@infrastructure/persistence/search` | `readAll` + `MAX_CONFIGURED_PAGE_SIZE` drive the `personalData` export loop. |
| `./routes` | The Hono/Express router mounted at `/orders`. |
| `./services` | `cancelById`, `cancelPendingOrdersHolding`, `detachUserId`, `search`, `ownerScope` — the business-logic layer this manifest delegates to. |
| `./rate-limits` | `ordersRateLimits` applied module-wide (each invoice render spawns Chromium). |
| `./events` | Side-effect import only; no runtime value used here. |
| `src/modules.ts` | Aggregates this module into the application's module list. |
| `src/modules/cart/*` | Cart imports from this module (one-directional), keeping the dependency graph acyclic. |

## Notes

- **No queue consumer.** Invoices are rendered synchronously on the requesting thread (`services/invoice.ts`); there is no background worker owned by this module.
- **`SYSTEM_ACTOR` vs. user identity.** The reservation-expiry sweep deliberately acts as `SYSTEM_ACTOR` because the *shop* is cancelling, not the customer; this bypasses owner-scope checks in `cancelById`.
- **Soft-delete semantics.** `PRODUCT_DELETED` with `hardDelete: false` is intentionally a no-op here — the order line already copied the product fields at purchase time, so a soft-delete (or its restore) must not mutate historical data.
- **Permission key ownership.** The `permissions` array is the single source of truth; `tests/cross-cutting/module-permissions.test.ts` cross-checks it against the shared permissions file in both directions.
- **`module.yaml`** is the YAML counterpart of this manifest; keep them in sync when adding/removing config keys or permissions.
