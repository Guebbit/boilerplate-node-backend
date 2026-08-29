# src/modules/products/repository.ts

## Purpose

Product data-access layer. Wraps `createBaseRepository` for standard CRUD and adds the catalogue's own query rules: public-visibility scoping, facet aggregation, and the five conditional stock-counter transitions. It exists so callers never touch the Mongoose model directly and so the "which rows are visible to whom" logic lives in exactly one place.

## Key elements

- **`AvailabilityRow`** – shape of one row in the stock board (`productId`, `title`, `onHand`, `reserved`, `available`).
- **`PUBLIC_SCOPE`** (module-private const) – `{ active: true, deletedAt: { $exists: false } }`; the filter that defines a product as visible to non-admin callers.
- **`productRepository`** – the single exported object. Combines `BaseRepository<ProductDocument>` (search, CRUD) with:
  - `publicScope()` – returns a fresh copy of `PUBLIC_SCOPE` for external callers.
  - `findByIdScoped(id, scope?)` – single query that applies `_id` lookup **and** the caller's scope atomically; `undefined` scope = admin/unrestricted.
  - `findPublicById(id)` – `findByIdScoped` pre-bound to `PUBLIC_SCOPE`; the "can a stranger see this product?" check.
  - `facets()` – one `$facet` pipeline returning counted `categories` and `tags` for the public catalogue.
  - `reserveUnits(id, qty)` – conditional `$inc reserved`; guard is `$expr: onHand - reserved >= qty`.
  - `commitUnits(id, qty)` – decrements `onHand` **and** `reserved` together (units sold).
  - `releaseUnits(id, qty)` – decrements `reserved` only (hold released); idempotent via guard.
  - `receiveUnits(id, qty)` – increments `onHand` (supplier delivery).
  - `adjustUnits(id, delta)` – signed increment; guard ensures `onHand + delta >= reserved`.
  - `countLowAvailability(threshold)` – count of products with `available ≤ threshold`.
  - `sumReserved()` – aggregate sum of `reserved` across the collection.
  - `availabilityPage({ skip, limit, maxAvailable? })` – paginated `AvailabilityRow[]` for the stock board.

## Relationships

- **`src/infrastructure/persistence/base-repository.ts`** – provides `createBaseRepository`, `toObjectId`, and the `BaseRepository` type. This file spreads that factory output and augments it with the methods above.
- **`src/modules/inventory/service.ts`** – the sole caller of the five counter transitions (`reserveUnits`, `commitUnits`, `releaseUnits`, `receiveUnits`, `adjustUnits`). Inventory owns the business rules (ledger rows, ordering of transitions); this file only performs the atomic `updateOne`.
- **`src/modules/cart/services/reorder.ts`** – calls `findPublicById` to verify a product is still visible before re-adding it to a cart.
- **`src/modules/cart/services/items.ts`** – consumes product data via this repository during cart-item operations.
- **`src/modules/orders/service.ts`** – uses `findByIdScoped` (same pattern) to fetch a product within the caller's authorization scope when creating or reading an order.
- **`src/modules/inventory/metrics.ts`** – reads `countLowAvailability`, `sumReserved`, and `availabilityPage` to populate the stock/availability dashboard.
- **`src/modules/products/model.ts`** – supplies `productModel`, `applyProductTransform`, and the `ProductDocument` type used throughout this file.
- **Test files** (`cart/tests/…/stock.test.ts`, `inventory/tests/…/service.test.ts`, `orders/tests/…/service-crud.test.ts`, `payments/tests/…/service.test.ts`, `account/tests/…/addresses.test.ts`) – exercise the scoped-lookup and counter-transition paths through their respective service layers.

## Notes

- The explicit type annotation on `productRepository` is a workaround for **TS7056** (Mongoose generics too large to serialize at an export boundary). Do not "simplify" it away.
- All counter transitions use `timestamps: false` so `updatedAt` continues to mean "catalogue entry edited," not "stock moved."
- Every counter write is **conditional** and returns a boolean. There is intentionally no unconditional `increment`/`decrement` — a previous `incrementStock` that returned `void` caused silent unit loss when a product was hard-deleted mid-flow.
- `reserveUnits` and `adjustUnits` use `$expr` in the filter (field-vs-field arithmetic); the other three use simple `$gte` on a single field. Don't "normalize" them — the `$expr` forms are required because the guard spans two document fields.
- `facets()` applies `PUBLIC_SCOPE` in the `$match` stage so filter chips never show categories/tags held only by hidden products.
- The `searchable` config maps `booleans: { active: 'active' }`; combined with `PUBLIC_SCOPE`, a non-admin search for `active: false` yields an empty set (the two clauses contradict). This is intentional.
