# src/modules/account/tests/unit/schema-contract.test.ts

## Purpose

Unit test that pins the Mongoose schema contract for `addressBookSchema`. It asserts the top-level document shape (required fields, unique index, defaults, ref, timestamps) and the `items` sub-schema (required address fields, `_id` presence, `default` field default), so that any refactor that silently changes the contract is caught immediately.

## Key elements

- **`describe('addressBookSchema')`** — Five assertions on the top-level schema: `userId` is the sole required path; `userId` carries a unique index; `items` defaults to `[]`; `userId` refs `User`; `timestamps` is enabled.
- **`describe('addressBookSchema — an entry')`** — Three assertions on the `items` sub-schema: required fields are `city`, `country`, `fullName`, `street`, `zip`; `_id` is `true`; the `default` boolean defaults to `false`.
- **Imports from `@tests/schema`** — `requiredPaths`, `indexOptionSpecs`, `defaultOf`, `refOf`, `optionsOf`, `subSchema`: small helpers that extract specific schema facets for comparison.

## Relationships

- **`src/modules/account/model.ts`** — Source of `addressBookSchema`; the sole production import under test.
- **`tests/support/schema.ts`** — Provides all six assertion helpers; this file is the consumer that gives them meaning.

## Notes

- **`_id: true` on items is intentional and tested in isolation.** Unlike the cart and wishlist line items (which set `_id: false`), an address entry keeps its own `_id` because two entries can be identical in every typed field yet represent different addresses. The test explicitly asserts `true` so a future "alignment" cleanup that flips it to `false` fails here.
- **`default` on an entry defaults to `false`.** Promotion of the first address to "default" is a service-layer concern; a schema-level `true` would make every newly added address the default simultaneously.
- The test deliberately asserts only against `addressBookSchema` and never imports `cartSchema` or `wishlistSchema` directly, keeping the dependency graph one-directional.
