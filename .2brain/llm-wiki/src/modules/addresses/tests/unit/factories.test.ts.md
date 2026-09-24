---
source: src/modules/addresses/tests/unit/factories.test.ts
sha256: 26c90e7587dbe0b1ba41a9bb6b8d03b911d691d0d0cf49f23ea65af23c66e5f2
generated_at: 2026-09-23T18:21:53.408413+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/unit/factories.test.ts

## Purpose

Unit tests for the `makeAddressBook` fixture builder. Verifies that the factory produces address-book documents with correct `ObjectId` handling, proper omission of absent optional fields, and faithful pass-through of deliverable fields — ensuring test fixtures seeded into the DB are edit- and delete-able.

## Key elements

- **`USER`** / **`ADDRESS`** – Hardcoded hex strings used as source ObjectIds for the owner and a single entry.
- **`DELIVERABLE`** – Object listing the required address fields (`fullName`, `street`, `city`, `zip`, `country`, `default`), spread into each test item.
- **`describe('makeAddressBook')`** – Six assertions covering:
    - `userId` is stored as a real `Types.ObjectId` instance.
    - `items` key is entirely absent when no items are passed.
    - Each entry's input `id` becomes an `_id` of type `Types.ObjectId` in the output.
    - Deliverable fields pass through unchanged.
    - `label` and `phone` are **absent** (not `undefined`) when not supplied.
    - `label` and `phone` are preserved when supplied.

## Relationships

- **`src/modules/addresses/factories.ts`** – Sole functional dependency. Imports `makeAddressBook` via the `@modules/addresses/factories` alias and exercises it with various argument shapes.
- **`mongoose` (`Types`)** – Imported only to assert `instanceof Types.ObjectId` on produced fields.

## Notes

- The module docblock explains _why_ this factory differs from the cart/wishlist builders: address-book entries are targeted by their own `_id` in routes like `PUT /account/addresses/:addressId`, so a fixture lacking one would seed entries that cannot be edited or deleted.
- Absence vs. `undefined` is tested deliberately with `Object.hasOwn`, because Mongoose treats a key set to `undefined` differently from a key that is not present in the document.
- Input items use an `id` field; the factory maps it to `_id` in the output. Tests confirm both the type (`ObjectId`) and the value match the source string.
