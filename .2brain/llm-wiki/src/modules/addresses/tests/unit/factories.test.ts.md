---
source: src/modules/addresses/tests/unit/factories.test.ts
sha256: 26c90e7587dbe0b1ba41a9bb6b8d03b911d691d0d0cf49f23ea65af23c66e5f2
generated_at: 2026-11-08T04:58:06.150606+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/unit/factories.test.ts

## Purpose

Unit tests for the `makeAddressBook` fixture builder. They verify that the factory produces MongoDB-ready documents with correct `ObjectId` instances, respects optional-field absence (key not present vs. set to `undefined`), and passes deliverable fields through unchanged.

## Key elements

- **`USER` / `ADDRESS`** — Hardcoded 24-hex-char strings used as test identifiers for the owner and a single address entry.
- **`DELIVERABLE`** — A constant object with the six required address fields (`fullName`, `street`, `city`, `zip`, `country`, `default`). Spread into item objects in individual tests.
- **`describe('makeAddressBook')`** — Six `it` blocks covering:
  - `userId` is a real `Types.ObjectId` (not a string).
  - `items` key is entirely absent when no items are supplied.
  - Each entry receives its own `ObjectId` (`_id`) from the supplied `id`.
  - Deliverable fields pass through unchanged.
  - Optional `label`/`phone` are absent (checked via `Object.hasOwn`, not value comparison).
  - Optional `label`/`phone` are preserved when explicitly provided.

## Relationships

- **`src/modules/addresses/factories.ts`** — The sole production dependency; exports `makeAddressBook`, the function under test.
- **`mongoose` (`Types`)** — Used in assertions to confirm that `userId` and `_id` are `Types.ObjectId` instances rather than plain strings.

## Notes

- The module doc-comment explains why address entries must carry an `_id` (unlike cart/wishlist fixtures): the edit/delete routes (`PUT /account/addresses/:addressId`) name entries by their own id, so a missing `_id` makes entries unaddressable.
- Tests use `Object.hasOwn` rather than truthiness checks to assert key *absence*. The comment on the "omits label/phone" test explains the rationale: a key present with value `undefined` serializes differently in MongoDB than a key that is absent.
- `items` is tested as wholly absent (not an empty array) when no items are passed, matching how the factory handles the optional field.
