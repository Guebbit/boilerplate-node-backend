---
source: src/modules/addresses/model.ts
sha256: de0f7c664ec78dabf94d946584472d8ae3ebf764102dd57a9216b3724ac8203d
generated_at: 2026-09-23T18:20:19.132017+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/model.ts

## Purpose

Defines the Mongoose schema and model for a user's address book: one document per user (keyed by `userId`), holding an array of address entries as subdocuments. The design intentionally gives each entry its own `_id` so two entries with identical fields are still distinct ("home" vs. "office"), in contrast to cart/wishlist line items which are identified by their content.

## Key elements

- **`AddressItem`** — interface for a single address entry (`fullName`, `street`, `city`, `zip`, `country`, optional `label`/`phone`, and a `default` flag).
- **`AddressBookDocument`** — the full document shape: `userId`, `items: AddressItem[]`, timestamps.
- **`AddressBookModel`** — Mongoose `Model` type alias for use in the repository.
- **`addressItemSchema`** — Mongoose `Schema` for one entry; `_id: true` is explicitly set (mongoose's default, but spelled out to document the design intent).
- **`addressBookSchema`** — top-level schema; `userId` carries `unique: true` to enforce one-book-per-user at the database level; `items` defaults to `[]`; `timestamps: true`.
- **`applyAddressBookTransform`** — serialization transform (`_id` → `id`, drops `__v`) produced by `applySerialization`; intended for lean reads in the repository factory.
- **`addressBookModel`** — the compiled Mongoose model (`'AddressBook'`); the object the repository queries against.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — provides `applySerialization`, imported and applied to both `addressItemSchema` and `addressBookSchema` to wire up `toJSON`/`toObject` transforms.
- **`src/modules/addresses/repository.ts`** — primary consumer; all queries target `addressBookModel`. The `default` flag is maintained exclusively by this repository's writes.
- **`src/modules/addresses/factories.ts`** — the repository factory that uses `applyAddressBookTransform` for lean reads.
- **`src/modules/addresses/service.ts`** — maps entries to the wire contract by hand rather than relying on the schema's serialization.
- **`src/modules/addresses/index.ts`** — barrel re-export.
- **`tests/integration/scenarios/shop.test.ts`** — the only code path that reads a seeded book's `toJSON()` through the applied serialization (conformance check).
- **`src/modules/addresses/tests/unit/schema-contract.test.ts`** / **`src/modules/addresses/tests/integration/addresses.test.ts`** — exercise the schema and model directly.

## Notes

- **`_id` on subdocuments is the load-bearing design choice.** Two entries may hold identical field values; their `_id` is what makes them "home" vs. "office". Do not remove or ignore it.
- **`default` is the wire name, not an internal name.** The comment explicitly warns against introducing a mapping layer for this single field; it would be a place for the two names to drift.
- **Serialization is set up but barely used.** `applySerialization` is applied to both schemas, but the service layer maps entries manually. The only consumer of the `toJSON` output is the shop conformance test.
- **`default: false`** is the schema-level default for new entries; the invariant "exactly one entry is `true` when the book is non-empty" is maintained by the repository, not by the schema.
- **`unique: true` on `userId`** is a hard database constraint. Every mutation is expected to be a single `findOneAndUpdate({ userId }, …)`; there is no multi-document path.
