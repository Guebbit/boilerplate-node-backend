# src/modules/cart/services/view.ts

## Purpose

The shared cart projection layer for the `services/` package. It turns a raw `CartDocument` (keyed by `userId`) into the shapes other services and the OpenAPI contract expect: joined lines with product data, and the `CartResponse` payload. All three sibling services (`checkout`, `items`, `reorder`) import from here; none of them re-implements this logic.

## Key elements

- **`CartLine`** — `CartItem` plus a `product: ProductDocument | null` field. The id is kept in its own field because Mongoose's `populate` overwrites the reference in place (with the document or `null`).
- **`JoinedCartLine`** — narrows `CartLine` to lines where `product` is non-null; represents a line valid for order construction.
- **`CartView`** — the `CartResponse` shape from `openapi.yaml`: `{ items: CartItem[], summary: { itemsCount, totalQuantity, total } }`. Every cart endpoint (reads and mutations) returns this.
- **`isJoined(line)`** — type guard narrowing `CartLine` → `JoinedCartLine`.
- **`readCartLines(cart)`** — joins a cart's lines to products in one `populate('items.productId')` query. Captures `productId` strings *before* populate mutates the document. Returns `CartLine[]` (`product` may be `null` for deleted products).
- **`toCartView(cart)`** — calls `readCartLines`, prices via `sumLineItems`, then **drops** the `product` field so the response matches the `additionalProperties: false` contract. Returns `Promise<CartView>`.
- **`PopulatedCart`** (internal) — structural type for the populated document so `populate<T>` is typed without a cast.

## Relationships

- **`../model` (`src/modules/cart/model.ts`)** — provides the `CartDocument` type that all functions here accept.
- **`@modules/orders` (`src/modules/orders/index.ts` → `domain/totals.ts`)** — supplies `sumLineItems`, which prices the joined lines inside `toCartView`.
- **`@modules/products` (`src/modules/products/index.ts` → `model.ts`)** — supplies the `ProductDocument` type used in `CartLine.product` and `PopulatedCart`.
- **`@types` (`src/types/index.ts`)** — supplies the `CartItem` base type that `CartLine` extends.
- **`services/checkout.ts`, `services/items.ts`, `services/reorder.ts`** — sibling services that import `readCartLines`, `toCartView`, `isJoined`, and the line types so they don't each re-implement the populate-and-project step.

## Notes

- `toCartView` intentionally omits `product` per line. The OpenAPI contract (`additionalProperties: false` on `CartItem`) rejects it, and no client reads it — the frontend resolves products from its own store via `productId`. Use `readCartLines` / `isJoined` when you actually need the product (e.g., pricing at checkout).
- `readCartLines` reads `productId` into a plain-string array *before* calling `populate`. If you reorder or filter items after populate, the captured ids will be misaligned.
- A missing cart document (`cart === null`) is treated as an empty cart, not a 404. Both `readCartLines` and `toCartView` handle the `null` case by returning `[]` / zeroed summary.
- `PopulatedCart` is spelled with the full `items` key (not a dotted path) because Mongoose's `populate<T>` merges `T` over the document's top-level properties.
