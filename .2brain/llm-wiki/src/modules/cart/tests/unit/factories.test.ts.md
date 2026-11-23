---
source: src/modules/cart/tests/unit/factories.test.ts
source_sha256: 2f7cc72eb36375926c5fd4799ab584c03549af2f410b96743ca97f6d6ccfc869
context_sha256: 83a230d59c9cd2cad3f71890d67549f1f91e21f22b8fa4ac037827e2ad2b4b02
generated_at: 2026-11-22T04:43:00.169846+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/unit/factories.test.ts

## Purpose
Unit tests for `makeCart`, the cart fixture builder in `@modules/cart/factories`. The tests pin down the factory's main job: turning the string ids a seed file writes into real `ObjectId`s. A line whose `productId` stayed a string would match nothing when the service joins against the catalogue, so the cart would look populated but behave as empty.

## Key elements
- `USER` and `PRODUCT` are string ids used as fixture inputs.
- `describe('makeCart')` holds five tests:
  - **Owner conversion:** `userId` becomes a `Types.ObjectId` whose string form equals the input.
  - **Absent items:** when `items` is not passed, the result has no own `items` property (`Object.hasOwn(...)` is false), so the schema default applies.
  - **Line conversion:** each line's `productId` becomes an `ObjectId` and its `quantity` is kept.
  - **Empty vs. absent:** an explicit `items: []` stays `[]`, so it is distinct from omitting `items`.
  - **Order:** the order of the supplied lines is preserved.

## Relationships
- Imports `makeCart` from `src/modules/cart/factories.ts` (via the `@modules/cart/factories` alias), the only unit under test.
- Imports `Types` from `mongoose` to assert `ObjectId` instances.

## Notes
- Omitting `items` is deliberate. Writing `items: []` by default would make the fixture, rather than the schema, the authority on what an empty cart is, and the two would have to be kept in step.
- `[]` means "this cart was emptied". Absent means "unspecified". The factory must keep these apart so tests can seed an existing cart that holds nothing.
- The tests access `cart.items!` with a non-null assertion, which suggests `items` is optional on the returned type.
