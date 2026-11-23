---
source: src/modules/addresses/tests/unit/schema-contract.test.ts
source_sha256: 3cebc1f6990d8e161ca8a3703b037bd864c194010fe898aff5459d2b232fa4e7
context_sha256: 7445f3f88f9b9f96aa6570d705f223cd693800d19ed9dbba155a68c62d47a0cb
generated_at: 2026-11-22T04:17:28.220951+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/tests/unit/schema-contract.test.ts

## Purpose
Unit tests pinning the contract of `addressBookSchema`: one address-book document per user, mutated by upsert, whose entries (unlike cart and wishlist lines) keep their own `_id`. It is asserted directly against the addresses schema rather than via `cartSchema`, because a sibling module's `model.ts` is off-limits.

## Key elements
- **`describe('addressBookSchema')`** — document-level checks:
  - the only required path is `userId`;
  - the `userId_1` index is `unique=true`, so one book per user is enforced by the database;
  - `items` defaults to `[]`;
  - `userId` refs `User`;
  - `timestamps` is `true`.
- **`describe('addressBookSchema — an entry')`** — checks on the `items` sub-schema:
  - required paths are exactly `city`, `country`, `fullName`, `street`, `zip`, so `label` and `phone` are optional;
  - `_id` option is `true`, unlike the cart and wishlist lines. This lets `PUT /account/addresses/:addressId` name an entry, since two addresses can be identical in every typed field;
  - `default` defaults to `false`. The service, not the schema, promotes the first address to default.

## Relationships
- Imports `addressBookSchema` from `src/modules/addresses/model.ts`, the schema under test.
- Imports the introspection helpers `defaultOf`, `indexOptionSpecs`, `optionsOf`, `refOf`, `requiredPaths` and `subSchema` from `tests/support/schema.ts`, via the `@tests/schema` alias. Every assertion goes through them.

## Notes
- The `_id` test is meant to fail if someone "aligns" the address schema with the cart and wishlist. A comment in the file names the cart module's own schema-contract test as the counterpart that asserts `_id: false` on those lines.
- Required-path assertions use `toEqual` on exact lists, so adding a required field to the schema or an entry breaks the tests.
