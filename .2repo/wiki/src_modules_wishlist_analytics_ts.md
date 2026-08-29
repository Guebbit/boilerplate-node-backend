# src/modules/wishlist/analytics.ts

## Purpose

Declares the three analytics event names the wishlist module emits and registers them into the analytics port's type map. It exists so the module owns its event vocabulary locally (same pattern as `./audit.ts`) without the infrastructure layer needing to know about domain specifics.

## Key elements

- **`wishlistAnalyticsEvents`** (exported `as const` object) — the three event-name constants:
  - `WISHLIST_ITEM_ADDED` / `WISHLIST_ITEM_REMOVED` — save-funnel events.
  - `WISHLIST_MOVED_TO_CART` — the single exit point that bridges the save funnel into the purchase funnel; the primary metric to watch.
- **`declare module '@infrastructure/observability/analytics'`** — augments the port's `AnalyticsEventMap` interface with a `wishlist` key whose type is the union of the event-name values. This makes the names available to the analytics emitter without editing a shared file.

## Relationships

- **`src/modules/wishlist/service.ts`** — The wishlist service (and its controllers) imports `wishlistAnalyticsEvents` directly to fire events. No intermediate publisher exists; this file is the single source of the strings.
- **`src/modules/wishlist/tests/unit/analytics.test.ts`** — Unit tests that exercise the event declarations and/or the module augmentation.
- **`scripts/contracts/analytics-events-bundle.ts`** — Consumes the event-name catalogue (via the augmented port type) to build or validate the analytics-events bundle.

## Notes

- These event names are **not** published to the paired frontend. Only events defined in `shared/contracts/analytics.frontend.ts` cross that boundary; keeping the wishlist names here prevents double-counting a single event on both sides of the repo boundary.
- Naming convention is governed by `docs/tools/analytics.md#naming` (snake_case, past-tense verb phrases).
- The `as const` on `wishlistAnalyticsEvents` is what lets the `declare module` augmentation derive a literal union type for the `wishlist` key rather than a plain `string`.
