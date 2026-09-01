# src/modules/products/analytics.ts

## Purpose

Declares the analytics event names for the products module and merges them into the app-wide `AnalyticsEventMap` type via module augmentation. It exists so the products service can emit typed, discoverable funnel events (`products_searched`, `product_viewed`) without hard-coding string literals at call sites.

## Key elements

- **`productsAnalyticsEvents`** — `as const` object exporting two event-name strings: `PRODUCTS_SEARCHED` (`'products_searched'`) and `PRODUCT_VIEWED` (`'product_viewed'`). Both represent top-of-funnel discovery actions, not purchase intent.
- **`declare module '@infrastructure/observability/analytics'`** — augments the `AnalyticsEventMap` interface with a `products` key typed to the union of the values in `productsAnalyticsEvents`, giving callers compile-time exhaustiveness.

## Relationships

- **`src/modules/products/service.ts`** — sibling in the same module; the comment ("the analytics event names this module emits") indicates the service layer is the caller that fires these events.
- **`tests/unit/infrastructure/observability/analytics.test.ts`** — exercises the analytics port whose `AnalyticsEventMap` this file extends; changes to the shape of the map here can surface as type errors in that test's fixture setup.

## Notes

- Naming for new events must follow the convention documented at `docs/tools/analytics.md#naming` (referenced in the file's module JSDoc).
- The `declare module` augmentation is purely a type-level operation; at runtime this file exports only the `productsAnalyticsEvents` constant.
- The events are intentionally scoped to discovery (search + view). The module-level comment notes their ratio to `CART_ITEM_ADDED` (defined elsewhere) is the signal that the catalogue is converting attention into intent—do not add purchase-stage events here.
