# src/modules/account/tests/unit/schema-contract.test.ts

## Purpose

Schema-contract test for `addressBookSchema`. It pins down the top-level shape (required fields, unique index, defaults, ref, timestamps) and the per-entry sub-schema (required address fields, `_id` retention, `default: false`) so that accidental model drift or a well-intentioned "align with cart/wishlist" cleanup is caught at test time.

## Key elements

- **`describe('addressBookSchema', …)`** — five assertions on the top-level schema:
  - `requiredPaths` → only `['userId']`
  - `indexOptionSpecs` → `userId_1: unique=true`
  - `defaultOf(…,'items')` → `[]`
  - `refOf(…,'userId')` → `'User'`
  - `optionsOf(…).timestamps` → `true`

- **`describe('addressBookSchema — an entry', …)`** — three assertions on the `items` sub-schema:
  - `requiredPaths` → `['city','country','fullName','street','zip']` (`label`/`phone` optional)
  - `optionsOf(subSchema(…))._id` → `true` (deliberate divergence from cart/wishlist)
  - `defaultOf(subSchema(…), 'default')` → `false` (promotion is a service concern)

## Relationships

- **`src/modules/account/model.ts`** — source of `addressBookSchema`, the single subject under test.
- **`tests/support/schema.ts`** — provides the assertion helpers (`defaultOf`, `indexOptionSpecs`, `optionsOf`, `refOf`, `requiredPaths`, `subSchema`) used throughout; no other test file's output is imported.

## Notes

- The `_id: true` assertion is a **deliberate contract guard**. The file's header comments state that a later "consistency" pass could remove the per-entry `_id` to match cart/wishlist; this test is the tripwire that fails if that happens.
- The test intentionally does **not** import or compare against `cartSchema` or `wishlistSchema`. A sibling module's `model.ts` import is forbidden by the project's boundaries rule; the matching `_id: false` assertion lives in `cart/tests/unit/schema-contract.test.ts`.
- `default: false` on `items` is asserted at the schema level to lock in the invariant that "which address is the default" is decided by the service layer, not by Mongoose defaults.
