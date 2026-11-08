---
source: src/modules/addresses/tests/unit/schema-contract.test.ts
sha256: b38624ca5b01dbcc6d5fbf1f2dfc06cb2276877c481c4a082d28349a32a549d7
generated_at: 2026-11-08T04:58:27.074912+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/unit/schema-contract.test.ts

## Purpose

Pins the public contract of `addressBookSchema` so that schema-level semantics (required fields, indexes, sub-document identity, defaults) are verified in isolation. It exists to catch accidental "alignment" with sibling schemas (cart, wishlist) that would silently change address-book behavior — particularly the `_id` on entries and the `default` promotion strategy.

## Key elements

- **Top-level `describe('addressBookSchema')`** — asserts:
  - `requiredPaths` is exactly `['userId']` (nothing else is mandatory).
  - `indexOptionSpecs` includes `userId_1: unique=true` (one book per user enforced at the DB level).
  - `defaultOf(schema, 'items')` is `[]` (new books start empty).
  - `refOf(schema, 'userId')` is `'User'`.
  - `timestamps` option is `true`.
- **`describe('addressBookSchema — an entry')`** — asserts on the `items` sub-schema:
  - Required fields: `city`, `country`, `fullName`, `street`, `zip` (carrier-deliverable set); `label` and `phone` are optional.
  - `_id` is `true` — entries are individually addressable via `PUT /account/addresses/:addressId`.
  - `default` on an entry defaults to `false` — promotion to "default address" is a service concern, not a schema default.
- **Helpers imported from `tests/support/schema.ts`**: `defaultOf`, `indexOptionSpecs`, `optionsOf`, `refOf`, `requiredPaths`, `subSchema` — introspection utilities that extract Mongoose schema metadata for assertion.

## Relationships

- **`src/modules/addresses/model.ts`** — source of `addressBookSchema`; this file imports it and asserts every structural property of that export.
- **`tests/support/schema.ts`** — provides the six helper functions used to pull metadata (required paths, index specs, option values, refs, defaults, sub-schema slices) out of a Mongoose schema so tests read as natural-language contracts rather than raw option-object comparisons.

## Notes

- Tests assert against `addressBookSchema` directly rather than diffing it against `cartSchema`, because a sibling module's `model.ts` is off-limits to import here.
- The `_id: true` assertion on `items` is intentionally a *divergence* test: cart and wishlist lines set `_id: false`, but address entries must keep one. A refactor that "unifies" the three schemas will fail this test.
- `default: false` on the entry is load-bearing: a schema-level `true` would make every newly added address the user's default, bypassing the service-layer promotion logic.
