---
source: src/modules/addresses/model.ts
generated_at: 2026-11-22T04:13:54.443684+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/model.ts

## Purpose
Defines the Mongoose model for the address book: one document per user, keyed by a unique `userId`, with the entries held in an `items` array of subdocuments. This follows the cart's one-document-per-user pattern, so editing an address touches one small document rather than the whole user account. Unlike cart lines, address entries are addressed individually, so each keeps its own `_id`.

## Key elements
- `AddressItem`: interface for one stored entry. Fields are `_id?`, `label?`, `fullName`, `street`, `city`, `zip`, `country`, `phone?` and `default: boolean`. Exactly one entry carries `default: true` whenever the book is non-empty. The repository's writes maintain this, and the client is never trusted for it. The field is named `default` because that is also the wire name, which avoids a mapping layer.
- `AddressBookDocument`: Mongoose `Document` holding `userId`, `items` and timestamps.
- `AddressBookModel`: `Model<AddressBookDocument>` type alias. Queries live in `./repository`.
- `addressItemSchema` (not exported): subdocument schema. It spreads `postalAddressPaths` for the shared postal fields and adds `label` and `default` (a Boolean defaulting to `false`). It sets `_id: true` explicitly. It also has `applySerialization` applied, which renames `_id` to `id`.
- `addressBookSchema`: the book schema. `userId` is an ObjectId with `ref: 'User'`, `required` and `unique`. `items` defaults to `[]`. Timestamps are enabled.
- `applyAddressBookTransform`: the return value of `applySerialization(addressBookSchema)`. It normalizes a serialized book (`_id` becomes `id`, `__v` is dropped) and is owed to the repository factory for its lean reads.
- `addressBookModel`: the compiled model registered as `'AddressBook'`.

## Relationships
- `@infrastructure/persistence/postal-address-paths` supplies the shared postal field definitions spread into the item schema.
- `@infrastructure/persistence/serialize` provides `applySerialization`, used on both the item schema and the book schema.
- `./repository` queries `addressBookModel`. Every mutation is a single `findOneAndUpdate({ userId }, …)`, which the unique `userId` supports. It also owns the single-default invariant.
- `./service.ts` maps entries by hand, so the item schema's serialization is not used on any request path.
- `tests/integration/scenarios/shop.test.ts` is the only reader of the item serialization. Its conformance check reads a seeded book's `toJSON()` through it.
- The other neighbors (`factories`, `index`, `pii`, `presenter`, `reencrypt`, the address tests, `cart/services/checkout`) are related through the dependency graph, but this file shows no direct interaction with them beyond defining the types and model they build on.

## Notes
- Subdocuments deliberately keep `_id`. Two entries with identical fields are still distinct ("home" vs "office").
- The one-book-per-user rule is enforced by the database via the unique index on `userId`, not only by application code.
- The `AddressBookDocument` doc comment says "A book id never reaches the wire."
