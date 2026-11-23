---
source: src/modules/cart/factories.ts
source_sha256: 5da753ea502ad47ec46aa1cc478fc5e895421f0a5addba70a6b51a04f985852f
context_sha256: b74253fb880f59f0aa877ac4fd1dccee06eefdd5f0c9547c4e51bd869188941f
generated_at: 2026-11-22T04:32:57.357361+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/factories.ts

## Purpose
Test/seed fixture builder for cart rows. It turns bare string ids and quantities into a cart object with Mongo `ObjectId`s, ready to pass to `cartRepository.create`. Carts are addressed by their owner (`userId` is unique), so there is deliberately no `_id` override.

## Key elements
- `CartOverrides` — input shape: required `userId: Id` (24-char hex string) and optional `items?: CartItem[]`.
- `CartFixture` — `Partial<CartDocument> & Pick<CartDocument, 'userId'>`. `userId` is required so seed callers don't need `fixture.userId!`.
- `makeCart({ userId, items })` — returns a `CartFixture`. It converts `userId` and each item's `productId` with `new Types.ObjectId(...)`, and it keeps `quantity` as-is.

## Relationships
- `./model` — supplies the `CartDocument` type that `CartFixture` is derived from (type-only import).
- `@types` (`src/types/index.ts`) — supplies `CartItem` and `Id`. The `CartItem` shape (`{ productId, quantity }`) comes from the API contract rather than being redefined here.
- `src/modules/cart/tests/unit/factories.test.ts` and `src/modules/delivery/tests/unit/fulfillment.test.ts` — test files related to this module in the dependency graph. The factory itself does not import them.

## Notes
- When `items` is `undefined`, the `items` key is omitted entirely, so the schema's `default: []` applies. An explicit empty array is passed through and produces `items: []`.
- Ids must be valid 24-char hex strings. Passing a bare string to Mongo instead of an `ObjectId` would silently match nothing, which is why the conversion happens here.
