---
source: src/modules/addresses/model.ts
sha256: cd2a1f0586d572924077368fb9ebf7bc2ea4be0595549a5b44a281df18530be9
generated_at: 2026-11-14T19:19:15.564423+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/model.ts

## Purpose

Defines the Mongoose schema and compiled model for the user address book. One document per `userId` (the same pattern as the cart), so editing an address updates a small document rather than the whole account. Subdocuments carry their own `_id` because two entries can have identical fields yet represent "home" vs. "office".

## Key elements

- **`AddressItem`** (interface) — shape of one address entry; includes `fullName`, `street`, `city`, `zip`, `country`, optional `label`/`phone`, and a `default: boolean` flag.
- **`AddressBookDocument`** (interface) — top-level document: `userId: Types.ObjectId`, `items: AddressItem[]`, timestamps.
- **`AddressBookModel`** (type) — Mongoose `Model` typed for use in the repository layer.
- **`addressItemSchema`** (internal) — subdocument schema built from `postalAddressPaths`; explicitly sets `{ _id: true }` so entries remain individually addressable. Serialization (`_id`→`id`) is applied via `applySerialization`.
- **`addressBookSchema`** (exported) — top-level schema with `userId` unique/required, `items` array defaulting to `[]`, and `timestamps: true`.
- **`applyAddressBookTransform`** (exported) — the serialization transform produced by `applySerialization` on the book schema (renames `_id`→`id`, drops `__v`); used by the repository for lean reads.
- **`addressBookModel`** (exported) — the compiled Mongoose model (`'AddressBook'`) that `./repository` queries against.

## Relationships

- **`postal-address-paths.ts`** — provides the shared `postalAddressPaths` object spread into `addressItemSchema` (street, city, zip, country, phone).
- **`serialize.ts`** — `applySerialization` is called on both `addressItemSchema` and `addressBookSchema` to attach the `_id`→`id` / `__v`-removal transform.
- **`repository.ts`** — imports `addressBookModel` and `applyAddressBookTransform` for all read/write queries; the comment explicitly states "Queries live in `./repository`".
- **`service.ts`** — maps `AddressItem` entries to the wire `Address` contract by hand; does **not** rely on the item-level serialization.
- **`index.ts`** — barrel file that re-exports the model's public symbols to consumers outside the module.
- **`tests/integration/scenarios/shop.test.ts`** — the only code path that reads a seeded book's `toJSON()` through `applySerialization` (conformance check).

## Notes

- **`default` flag invariant** — exactly one entry is `true` when the book is non-empty. This is maintained exclusively by the repository's write logic; the model schema defaults it to `false` but never enforces uniqueness.
- **Subdocument `_id` is intentional** — unlike cart/wishlist line schemas (which suppress `_id`), address entries need stable identifiers because entries are individually addressable. The `{ _id: true }` option is spelled out with a comment to prevent a future refactor from "simplifying" it away.
- **Item-level serialization is effectively dead in production** — `service.ts` maps entries manually, so the `applySerialization` on `addressItemSchema` is only exercised by the shop conformance test. Removing it would not break a request path but would break that test.
- **One book per user is a database fact** — enforced by `unique: true` on `userId`; every mutation is a single `findOneAndUpdate({ userId }, …)` in the repository.
