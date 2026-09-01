# src/modules/account/model.ts

## Purpose
Defines the Mongoose schema and compiled model for the user address book — one document per `userId`, holding an array of independently-addressable address entries. It lives in its own collection (mirroring the cart's pattern) so that editing a single address touches one small document rather than rewriting the entire user record.

## Key elements
- **`AddressItem`** — TypeScript interface for a single entry (`label`, `fullName`, `street`, `city`, `zip`, `country`, `phone`, `default`). Exactly one entry in a non-empty book has `default: true`; the repository enforces this, never the client.
- **`AddressBookDocument`** — Interface for the full Mongoose document (`userId`, `items`, `createdAt`, `updatedAt`).
- **`AddressBookModel`** — Type alias for `Model<AddressBookDocument>`; the shape `./repository` queries against.
- **`addressItemSchema`** — Subdocument schema. Explicitly sets `{ _id: true }` so each entry is individually addressable (contrast: cart/wishlist line schemas omit this).
- **`addressBookSchema`** — Top-level schema. `userId` is `unique: true`, making "one book per user" a database-level invariant.
- **`applyAddressBookTransform`** — Serialization transform (`_id` → `id`, drops `__v`) exported for the repository factory's lean reads.
- **`addressBookModel`** — The compiled Mongoose model (`'AddressBook'`).

## Relationships
- **`src/infrastructure/persistence/serialize.ts`** — Provides `applySerialization`, applied to both `addressItemSchema` and `addressBookSchema` to wire up `toJSON`/`toObject` transforms.
- **`src/modules/account/repository.ts`** — Imports `addressBookModel` and `applyAddressBookTransform`; all reads/writes go through `findOneAndUpdate({ userId }, …)`.
- **`src/modules/account/services/addresses.ts`** — Maps stored entries to the wire-format `Address` by hand; request paths do **not** rely on the `applySerialization` transform (it is only exercised by `scripts/export-demo-dataset.ts` via `toJSON()`).
- **`src/modules/account/tests/unit/schema-contract.test.ts`** — Validates the schema shape against the contract.
- **`src/modules/account/fixtures.ts` / `demo.ts`** — Supply sample `AddressItem` data for dev/demo use.
- **`src/modules/cart/services/checkout.ts`** — Consumes the address book (reads the `default: true` entry) during the checkout flow.

## Notes
- `default` is the wire name and the schema field name intentionally match; a mapping layer for a single boolean would only create drift.
- The subdocument `_id` is load-bearing: two entries can be field-identical yet represent "home" vs. "office". Removing it would break update-by-id semantics.
- `applyAddressBookTransform` exists specifically for lean (non-Mongoose) reads in the repository factory — it is not used in request handlers.
- The `default: true` invariant (exactly one per non-empty book) is maintained exclusively by repository writes; the schema default is `false`.
