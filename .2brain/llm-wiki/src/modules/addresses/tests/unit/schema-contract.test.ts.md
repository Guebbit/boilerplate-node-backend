---
source: src/modules/addresses/tests/unit/schema-contract.test.ts
sha256: b38624ca5b01dbcc6d5fbf1f2dfc06cb2276877c481c4a082d28349a32a549d7
generated_at: 2026-09-23T18:22:11.400439+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/unit/schema-contract.test.ts

## Purpose

Unit test that pins the public contract of `addressBookSchema` — its required fields, indexes, defaults, references, and the shape of its `items` sub-document — so that schema drift is caught in CI. It mirrors the structure of the cart and wishlist schema-contract tests while asserting the one way the address book differs: its line items keep an Mongoose `_id`.

## Key elements

- **`describe('addressBookSchema')`** — top-level invariants: `userId` is the sole required path; a `unique` index on `userId`; `items` defaults to `[]`; `userId` refs `User`; `timestamps` enabled.
- **`describe('addressBookSchema — an entry')`** — invariants on the `items` sub-schema: required fields are the five deliverable address fields (`city`, `country`, `fullName`, `street`, `zip`); `_id` is explicitly `true`; `default` field defaults to `false`.
- **Test utilities** (`defaultOf`, `indexOptionSpecs`, `optionsOf`, `refOf`, `requiredPaths`, `subSchema`) — imported from `@tests/schema`; each extracts a single aspect of a Mongoose schema for assertion.

## Relationships

- **`src/modules/addresses/model.ts`** — exports `addressBookSchema`, the sole subject under test.
- **`tests/support/schema.ts`** — provides all six schema-introspection helpers used to decompose the schema into assertable fragments.

## Notes

- **`_id: true` on items is load-bearing.** Cart and wishlist lines set `_id: false` because a duplicate line is semantically one item. Two addresses can be byte-identical yet distinct (e.g., two "Home" entries), so `PUT /account/addresses/:addressId` needs a stable identifier. A refactor that "aligns" the three schemas will break this assertion.
- **`default` defaults to `false` at the schema level.** Promotion of the first address to `default: true` is the service's job, not the schema's. A schema-level `true` would make every newly added address the default.
- The module doc comment notes this test asserts the contract directly rather than comparing against `cartSchema`, because cross-module imports of a sibling's `model.ts` are disallowed by convention.
