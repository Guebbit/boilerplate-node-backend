# src/modules/cart/analytics.ts

## Purpose
Declares the analytics event names emitted by the cart module and registers them in the analytics port's typed name map. It exists so that the cart's domain events live with the code that fires them, keeping `infrastructure` free of domain knowledge.

## Key elements
- **`cartAnalyticsEvents`** (exported const) — a frozen object of event-name strings covering cart lifecycle actions (`CART_VIEWED`, `CART_ITEM_ADDED/UPDATED/REMOVED`, `CART_CLEARED`, `CART_REORDERED`) and the two checkout outcomes (`CHECKOUT_COMPLETED`, `CHECKOUT_FAILED`).
- **Module augmentation** of `@infrastructure/observability/analytics` → `AnalyticsEventMap` — adds a `cart` key typed as the union of all values in `cartAnalyticsEvents`, giving the analytics emitter a compile-time catalogue without editing any shared file.

## Relationships
- **`src/modules/cart/services/checkout.ts`**, **`src/modules/cart/services/items.ts`**, **`src/modules/cart/services/reorder.ts`** — import `cartAnalyticsEvents` directly to pass the correct name string when firing analytics events; they are the only consumers of these names at runtime.
- **`tests/unit/infrastructure/observability/analytics.test.ts`** — exercises the analytics port and validates that names registered via this augmentation are accepted by the emitter.
- **`scripts/contracts/analytics-events-bundle.ts`** — builds the frontend contract (`shared/contracts/analytics.frontend.ts`). Events from *this* file are deliberately **not** published there; only events the service never observes go through that boundary, preventing double-counting.

## Notes
- **Ownership rule:** an event name belongs to the module that *emits* it. `CHECKOUT_COMPLETED` / `CHECKOUT_FAILED` are here (not in an `orders` module) because `POST /cart/checkout` is the reporting endpoint.
- **No re-exports:** nothing re-exports this object. Controllers/services import it directly, so a copy on either side of the repo boundary would have no reader.
- **Naming convention** is governed by `docs/tools/analytics.md#naming` (referenced in the file header but not defined here).
- Follows the same augmentation pattern as `./audit.ts` for audit actions: the catalogue grows with the owning module, `infrastructure` stays domain-agnostic.
