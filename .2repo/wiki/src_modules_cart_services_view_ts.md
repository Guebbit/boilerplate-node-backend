# src/modules/cart/services/view.ts

## Purpose

Read/projection layer for the cart: turns a stored `CartDocument` into the shapes callers actually consume — joined lines (`CartLine`) and the API response (`CartView`). Lives in `services/` and is shared by the sibling service files (`checkout`, `items`, `reorder`) so none of them duplicates join or serialization logic.

## Key elements

- **`CartLine`** (interface) — a cart item plus its joined `product` (or `null`). Extends `CartItem`; keeps the raw `productId` separate because `populate` overwrites the reference field in place.
- **`JoinedCartLine`** (type) — `CartLine` narrowed to `product: ProductDocument`. Represents a line safe to use for order construction.
- **`CartView`** (interface) — the `CartResponse` shape from `openapi.yaml`: `{ items, summary: { itemsCount, totalQuantity, total } }`. Every cart endpoint returns this directly or as the mutation payload.
- **`PopulatedCart`** (internal interface) — types the result of Mongoose's `populate` so the populated read is typed rather than cast.
- **`isJoined`** (type guard) — narrows `CartLine → JoinedCartLine` by checking `product !== null`.
- **`readCartLines`** — resolves a cart (or `null`) to `Promise<CartLine[]>`. Captures product ids *before* calling `populate('items.productId')`, then zips the fetched documents back onto the original ids.
- **`toCartView`** — resolves a cart to `Promise<CartView>`. Joins lines, calls `sumLineItems`, then drops the `product` field to match the contract.

## Relationships

- **`src/modules/cart/model.ts`** — imports `CartDocument`; the stored shape this file reads from.
- **`src/modules/cart/services/checkout.ts`** / **`items.ts`** / **`reorder.ts`** — sibling services that import `readCartLines`, `toCartView`, `isJoined`, and the line types; none owns this module.
- **`src/modules/orders/index.ts`** → **`domain/totals.ts`** — provides `sumLineItems`, used by `toCartView` to compute the summary.
- **`src/modules/products/index.ts`** → **`model.ts`** — provides the `ProductDocument` type for the joined product field.
- **`src/types/index.ts`** — provides the `CartItem` base type that `CartLine` extends.

## Notes

- **Absence ≡ empty.** A missing cart document is treated as an empty cart (`[]`), never a 404. `readCartLines` and `toCartView` both accept `null` and resolve to the empty shape.
- **Id capture before `populate`.** `readCartLines` snapshots `productId` values *before* the populate call because Mongoose replaces the reference field with the fetched document (or `null` if the product was deleted). Skipping this step would lose the id for ghost products.
- **`PopulatedCart` uses a whole-key shape.** Mongoose's `populate<T>` merges `T` over top-level document properties; a dotted path like `items.productId` is not a valid merge target, so the interface is spelled as the full `items` array.
- **`product` is dropped in `toCartView`.** The OpenAPI `CartItem` schema is `additionalProperties: false` over `{ productId, quantity }`, so the joined product is used only for pricing and then omitted. Callers that need the product should use `readCartLines` / `cartGet` instead.
- **No `items = []` fallback.** The schema defaults the array, so a hydrated cart always has `items`; the code relies on that rather than re-guarding.
