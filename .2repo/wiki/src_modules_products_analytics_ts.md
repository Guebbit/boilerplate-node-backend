# src/modules/products/analytics.ts

## Purpose

Declares the analytics event names emitted by the products module (`products_searched`, `product_viewed`) and registers them into the shared `AnalyticsEventMap` via a TypeScript module augmentation. This keeps the catalogue's event vocabulary co-located with the module that owns it, while `infrastructure` stays domain-agnostic.

## Key elements

- **`productsAnalyticsEvents`** — `as const` object exporting two event-name strings: `PRODUCTS_SEARCHED` (`'products_searched'`) and `PRODUCT_VIEWED` (`'product_viewed'`). Controllers that fire these events import this constant directly.
- **`declare module '@infrastructure/observability/analytics'`** — Augments the `AnalyticsEventMap` interface with a `products` key typed as the union of the two values above. Same pattern used by `./audit.ts` for audit actions.

## Relationships

- **`src/modules/products/service.ts`** — The service (and its controllers) in this module import `productsAnalyticsEvents` to name the events it emits.
- **`scripts/contracts/analytics-events-bundle.ts`** — Aggregates module-level event-name constants (like this one) into the generated contract bundle.
- **`tests/unit/infrastructure/observability/analytics.test.ts`** — Validates the analytics port contract, which includes the augmented `AnalyticsEventMap` this file contributes to.

## Notes

- Event names are **not** published to the paired frontend. Only `shared/contracts/analytics.frontend.ts` is published, and it covers moments this service never observes—this separation prevents a single event from being counted twice.
- Naming rule is governed externally: see `docs/tools/analytics.md#naming`.
- The two events are intentionally top-of-funnel (discovery). Their ratio to `CART_ITEM_ADDED` (defined elsewhere) is the catalogue-health metric.
- Do not add a second export that "re-publishes" these names; the sole reader is the module's own controllers.
