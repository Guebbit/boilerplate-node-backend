---
source: src/modules/cart/factories.ts
sha256: 5da753ea502ad47ec46aa1cc478fc5e895421f0a5addba70a6b51a04f985852f
generated_at: 2026-11-08T05:13:57.761639+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/factories.ts

## Purpose

Builds cart fixtures (documents ready for `cartRepository.create`) from bare string product/user ids and quantities. It exists so that test and seed code can construct a valid `CartDocument` without manually wrapping every id in `Types.ObjectId` or re-declaring the line-item shape.

## Key elements

- **`CartOverrides`** (interface) — input shape: required `userId: Id` plus optional `items?: CartItem[]`.
- **`CartFixture`** (type) — `Partial<CartDocument> & Pick<CartDocument, 'userId'>`; a cart with `userId` guaranteed present, everything else optional for partial overrides.
- **`makeCart`** (function) — converts the string `userId` to a `Types.ObjectId`; if `items` is supplied, maps each `productId` to a `Types.ObjectId` while preserving `quantity`. If `items` is omitted the key is left out entirely so the Mongoose schema default `[]` applies.

## Relationships

- **`src/modules/cart/model.ts`** — `CartDocument` type is imported and used to define `CartFixture`; the returned object is the payload passed to `cartRepository.create`, which persists via this model.
- **`src/types/index.ts`** — source of the `CartItem` and `Id` types used in the public interface; the line-item shape is intentionally *not* re-declared here.
- **`src/modules/cart/tests/unit/factories.test.ts`** — unit-tests the conversions and optional-items behavior of `makeCart`.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — consumes `makeCart` to seed a cart fixture without importing the cart model directly.

## Notes

- `userId` is **required** (not `Partial`) in `CartFixture`. The JSDoc explains this is deliberate: making it optional would force every seed caller to non-null-assert a value that can never be absent, creating a false sense of uncertainty.
- String-to-`ObjectId` conversion is the core reason this file exists. A bare hex string passed to Mongoose would silently match no document.
- When `items` is `undefined` the spread produces `{}` (key omitted), relying on the schema's `default: []`. Passing `items: []` explicitly would set an empty array directly.
- No `_id` field is generated or overridable; carts are addressed by `userId` and the repository assigns the id server-side.
