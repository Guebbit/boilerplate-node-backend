# src/modules/cart/model.ts

## Purpose

Defines the Mongoose schema, document interfaces, and model for the per-user cart. The document is intentionally one-per-user (not a subdocument on User) so a user response can't accidentally leak a cart it doesn't own. Field names mirror `openapi.yaml`'s `CartItem` to keep stored and wire shapes identical. Persistence lives in Mongo (not Redis) because this is the sole durable copy of a user's cart and Redis here is cache-only / fails open.

## Key elements

- **`CartItem`** (interface) – A single cart line: `productId: Types.ObjectId` + `quantity: number`.
- **`CartDocument`** (interface) – Full document shape: `userId`, `items: CartItem[]`, `createdAt`/`updatedAt`, and an explicitly typed `__v: number`. The version key is named because application code *reads* it (checkout concurrency), unlike other documents where the driver owns it silently.
- **`CartModel`** (type alias) – `Model<CartDocument>`, used as the model type in `repository.ts`.
- **`cartItemSchema`** – Sub-document schema for one line; `_id: false` because `CartItem` is `additionalProperties: false` and a generated id would be a contract violation.
- **`cartSchema`** – Top-level schema. `userId` is `unique: true` (enforces one-cart-per-user at the DB level, enabling single `findOneAndUpdate({ userId }, …, { upsert: true })` mutations). `timestamps: true` provides `createdAt`/`updatedAt`.
- **Index on `{ 'items.productId': 1 }`** – Supports the one non-`userId` query path (finding every cart holding a given product on product deletion). Left unnamed.
- **`applyCartTransform`** – Produced via `applySerialization(cartSchema)`; performs the shared `_id → id` rename and `__v` removal. Exists to satisfy the repository-factory contract for lean reads; no endpoint serves this raw shape directly.
- **`cartModel`** – `model('Cart', cartSchema)` entrypoint; the single place the Mongoose model is created.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** – Provides `applySerialization`, which `applyCartTransform` wraps. This is the only cross-module dependency in the file.
- **`src/modules/cart/repository.ts`** – Consumes `cartModel` for all queries. Its `clearLinesIfUnchanged` reads the `__v` field that this file types explicitly, implementing optimistic-concurrency checkout.
- **`src/modules/cart/services/view.ts`** – Contains `readCartLines`, the one place that reads `productId` *before* `populate` (since populate overwrites the field in place). Builds the `CartResponse` view by hand from the lines; does not expose the raw document.
- **`src/modules/cart/fixtures.ts` / `demo.ts`** – Use `cartModel` / `cartSchema` to seed or inspect cart data.
- **`src/modules/cart/tests/{unit,integration}/schema-contract.test.ts`** – Assert the schema shape against the OpenAPI `CartItem` contract.
- **`tests/integration/concurrency/cart-races.test.ts`** – Exercises the `__v`-based conditional clear to verify two parallel checkouts can't double-order one cart.

## Notes

- **`populate` clobbers `productId`.** Mongoose's `populate('items.productId')` replaces the ObjectId with the full product object in place. Any code that needs the raw id must capture it *before* populating; `readCartLines` in `services/view.ts` is the sole sanctioned site that does this.
- **`__v` is application-level, not just driver-level.** It is declared in `CartDocument` with a comment explaining *why* (checkout concurrency). Don't remove it or "fix" it to `any` — the conditional clear in `repository.ts` depends on it being a `number`.
- **`_id: false` on cart lines is contractual.** Adding an `_id` back would violate the `additionalProperties: false` OpenAPI constraint on `CartItem`.
- **`unique: true` on `userId` is the concurrency anchor for writes.** Every mutation is a single `findOneAndUpdate` with `upsert: true`; the unique index is what makes that safe without an explicit transaction.
