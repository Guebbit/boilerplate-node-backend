---
source: src/modules/addresses/model.ts
sha256: de0f7c664ec78dabf94d946584472d8ae3ebf764102dd57a9216b3724ac8203d
generated_at: 2026-11-08T04:54:57.062438+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/model.ts

## Purpose

Defines the Mongoose schema and compiled model for the user address book: a single document per user (keyed by `userId`) containing an array of address entries. Each entry is an independently-addressable subdocument (its own `_id`), so two entries can share identical fields and still be distinct (e.g. "home" vs. "office").

## Key elements

- **`AddressItem`** – Interface describing one stored entry (`fullName`, `street`, `city`, `zip`, `country` required; `label`, `phone`, `default` optional).
- **`AddressBookDocument`** – Document shape: `userId` (ObjectId), `items: AddressItem[]`, Mongoose timestamps.
- **`AddressBookModel`** – Type alias for the Mongoose model, used by the repository.
- **`addressItemSchema`** – Subdocument schema. Explicitly sets `{ _id: true }` to keep per-entry identity (contrast with cart/wishlist line schemas that omit it).
- **`addressBookSchema`** – Top-level schema. `userId` is `required` and `unique`; `items` defaults to `[]`. Enables `timestamps`.
- **`applyAddressBookTransform`** – Serialization transform (`_id` → `id`, drops `__v`) exported for the repository factory's lean reads.
- **`addressBookModel`** – The compiled Mongoose model (`'AddressBook'`) that the repository queries against.
- **`applySerialization(addressItemSchema)`** – Wires `toJSON` on the item subdocument so `id` appears on the wire; currently exercised only by the conformance test, not by any request path.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** – Provides `applySerialization`, applied to both the item subdocument schema and the top-level book schema to produce the `id`/drop-`__v` wire shape.
- **`src/modules/addresses/repository.ts`** – The sole query layer for this model; owns all mutations (including maintaining the `default` flag invariant) and uses `applyAddressBookTransform` for lean reads.
- **`src/modules/addresses/service.ts`** – Maps entries to the wire contract by hand; does not rely on the schema's `toJSON` in request paths.
- **`src/modules/addresses/index.ts`** – Module barrel; re-exports the model, types, and transform for consumers.
- **`tests/integration/scenarios/shop.test.ts`** – The only caller that reads a seeded book's `toJSON()` through the item serialization (conformance check).
- **`tests/unit/schema-contract.test.ts`** – Validates the schema shape and field constraints defined here.

## Notes

- **`_id: true` on subdocuments is intentional.** It is the single structural difference from the cart/wishlist line schemas; removing it would break the "two identical entries are still distinct" guarantee.
- **`default` is server-authoritative.** The repository enforces that exactly one entry carries `default: true` on every write; the client value is never trusted.
- **The item-level `toJSON` serialization is effectively dormant in production code.** Services map entries manually; only the shop conformance test exercises it. If you add a code path that calls `toJSON()` on a raw book, the output will carry `id` instead of `_id`.
- **One book per user is a database invariant** (`unique: true` on `userId`), not an application-level check. Every mutation is a single `findOneAndUpdate` keyed by `userId`.
