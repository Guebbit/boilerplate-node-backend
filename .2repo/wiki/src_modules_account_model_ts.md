# src/modules/account/model.ts

## Purpose

Defines the Mongoose schema and model for a user's address book. One document per user (keyed by `userId`), storing an array of address entries. It exists so the `account` module owns a collection in its own right, and so address mutations touch one small document rather than the whole account record.

## Key elements

- **`AddressItem`** — TypeScript interface for a single stored address entry (`fullName`, `street`, `city`, `zip`, `country`, optional `label`/`phone`, required `default: boolean`).
- **`AddressBookDocument`** — Mongoose `Document` interface for the top-level book: `userId`, `items: AddressItem[]`, timestamps.
- **`AddressBookModel`** — `Model<AddressBookDocument>` type alias.
- **`addressItemSchema`** — Subdocument schema for one entry. Explicitly sets `_id: true` so each entry is individually addressable (unlike cart/wishlist line items). `default` defaults to `false`.
- **`applySerialization(addressItemSchema)`** — Renames `_id` → `id` in `toJSON()` output. Used by the demo-dataset export script, not by request-path code.
- **`addressBookSchema`** — Top-level schema. `userId` is `unique: true`; `items` defaults to `[]`; timestamps enabled.
- **`applyAddressBookTransform`** — Serialization transform for the book-level schema (`_id` → `id`, drops `__v`). Intended for lean reads via the base factory.
- **`addressBookModel`** — The registered Mongoose model (`'AddressBook'`). All queries live in `./repository`, not here.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — Provides `applySerialization`, used on both the item and book schemas to wire `_id` → `id` in JSON output.
- **`src/modules/account/repository.ts`** — Owns all reads/writes against `addressBookModel`. Maintains the invariant that exactly one entry has `default: true` on every non-empty book.
- **`src/modules/account/factory.ts`** — Creates/hydrates address-book instances from the model.
- **`src/modules/account/services/addresses.ts`** — Maps `AddressItem` entries to the wire contract by hand; does **not** go through the serialization transforms defined here.
- **`src/modules/account/index.ts`** — Barrel re-exports for the module.
- **`src/modules/account/demo.ts`** — Seed/demo data for the address book collection.
- **`src/modules/cart/services/checkout.ts`** — Reads the user's address book (likely via the repository) to resolve the shipping address during checkout.

## Notes

- `default` is the **wire name**; there is no separate mapping layer. The field is server-maintained (repository writes) and must never be trusted from client input.
- Subdocuments intentionally keep `_id` (`_id: true` is the Mongoose default but is spelled out to contrast with cart/wishlist line schemas, which omit it). This `_id` is the handle every address endpoint accepts.
- `applySerialization` is applied here only so that `toJSON()` (used by the demo-dataset export script) produces `id` instead of `_id`. Request-path serialization in `services/addresses.ts` bypasses this entirely.
- `applyAddressBookTransform` is a book-level transform for lean-read normalization (drops `__v`, renames the book's own `_id`). It is not the same call as the item-level serialization above.
