# src/modules/account/tests/unit/fixtures.test.ts

## Purpose

Unit tests for the `makeAddressBook` fixture builder, verifying that it produces correctly shaped address-book documents (real Mongoose `ObjectId`s for the owner and every entry, pass-through of deliverable fields, and proper handling of optional fields) so that integration tests seeding this fixture behave identically to live Mongoose documents.

## Key elements

- **`makeAddressBook`** (imported from `@modules/account/fixtures`) — the function under test; builds an address-book document from a plain JS object.
- **`DELIVERABLE`** — a constant object holding the required address fields (`fullName`, `street`, `city`, `zip`, `country`, `default`) used in test cases.
- **`USER` / `ADDRESS`** — hardcoded hex-string identifiers representing a user and an address; passed as `id` fields and expected back as `Types.ObjectId` instances.
- **`describe('makeAddressBook')`** — six `it` blocks covering:
  - `userId` is stored as a real `ObjectId` (not a string).
  - `items` key is **absent** (not `undefined`) when no items are supplied.
  - Each item's `_id` is a real `ObjectId` (required by `PUT /account/addresses/:addressId`).
  - Deliverable fields pass through unchanged.
  - Optional `label`/`phone` are **absent** from the entry object when not provided (distinguished from being `undefined`).
  - `label`/`phone` are preserved when supplied.

## Relationships

- **`src/modules/account/fixtures.ts`** — sole dependency; provides the `makeAddressBook` function that this file exercises. The test file is the only consumer visible in the graph.

## Notes

- The critical distinction tested is **key absence vs. `undefined` value**: the fixture must *omit* optional fields rather than set them to `undefined`, because Mongoose serialises those differently and the resulting document would not match what the API expects.
- The `_id` requirement is route-driven: `PUT /account/addresses/:addressId` names entries by their own id, so a fixture that omits it would seed entries that cannot be edited or deleted.
- Unlike the cart and wishlist fixture builders (mentioned in the module doc-block), `makeAddressBook` assigns `_id` to every item, not just the top-level document.
