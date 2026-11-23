---
source: src/modules/addresses/factories.ts
source_sha256: fe08204e91bd9b57a79c616dd0c7a6f693bdfd5808a560dbc5eeab04437c830b
context_sha256: 363e98708eaa9fd0e81f7eedb424a38e6334ee60b9b60508becd83549bc22e88
generated_at: 2026-11-22T04:13:30.733224+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/factories.ts

## Purpose
Test-fixture factory for address books. It builds a document-shaped object from a caller's plain-contract data (string ids, `Address[]`) so it can be passed to `addressBookRepository.create`. It exists to keep the conversion from the wire contract to the Mongoose document shape in one place.

## Key elements
- `AddressBookOverrides` — input type: required `userId` (`Id`, 24-char hex) and optional `items` (`Address[]`). If `items` is omitted, the schema's `default: []` applies, giving a book with no entries.
- `AddressBookFixture` — `Partial<AddressBookDocument>` with `userId` required. Making `userId` required means the compiler enforces an owner, rather than leaving the assertion to the caller.
- `makeAddressBook({ userId, items })` — returns an `AddressBookFixture`:
  - converts `userId` to a `Types.ObjectId`;
  - when `items` is given, maps each address to an `AddressItem`. The contract `id` becomes the subdocument `_id` (as an `ObjectId`), the remaining fields are spread through, and `label` and `phone` go through `stripUndefined`, so absent optionals leave no key;
  - when `items` is `undefined`, the `items` key is omitted entirely.

## Relationships
- `src/modules/addresses/model.ts` — supplies the `AddressBookDocument` and `AddressItem` types the fixture is shaped against (type-only import).
- `src/types/index.ts` — supplies the `Address` and `Id` contract types (type-only import, via the `@types` alias).
- `src/infrastructure/object-guards.ts` — supplies `stripUndefined`, used to drop undefined `label` and `phone`.
- `src/modules/addresses/tests/unit/factories.test.ts` and `scenarios/addresses.ts` are neighbors in the dependency graph. The file content doesn't show how they use this module.

## Notes
- The book has no `_id` override. A book is identified by its owner, since `userId` is `unique` and no book id reaches the wire.
- Entries are the opposite case. Two addresses can be identical in every field and still be different entries, so each entry keeps its own `_id`, taken from the address `id`.
