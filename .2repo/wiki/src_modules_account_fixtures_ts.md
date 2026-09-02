# src/modules/account/fixtures.ts

## Purpose

Factory for building address-book fixtures (test data and demo datasets). It translates caller-supplied overrides into an `AddressBookFixture` shaped for `addressBookRepository.create`, handling the identity mapping between the contract's `id` field and the Mongoose subdocument `_id`.

## Key elements

- **`AddressBookOverrides`** – Input interface for the caller. Requires `userId: Id` (the owning user, since a book has no independent wire id) and optional `items: Address[]`. Extends `FactoryIdentity` so a stable `_id` can be pinned.
- **`AddressBookFixture`** – Output type: `Partial<AddressBookDocument>` with `userId` non-optional. Ready to pass directly to the repository's `create`.
- **`toEntry`** *(internal)* – Maps a single `Address` (contract shape with `id`) to an `AddressItem` (Mongoose shape with `_id: ObjectId`), stripping undefined optional fields.
- **`makeAddressBook`** – Public factory. Spreads identity, converts `userId` to an `ObjectId`, and (when `items` is defined) maps each entry through `toEntry`. Omitting `items` leaves the key absent so the schema's `default: []` applies.

## Relationships

- **`src/infrastructure/persistence/fixtures.ts`** – Source of `stripUndefined`, `identityOf`, and `FactoryIdentity`; provides the shared "pin an `_id`" and "drop undefined keys" primitives.
- **`src/modules/account/model.ts`** – Supplies the `AddressBookDocument` and `AddressItem` types that define the target shape of the fixture.
- **`src/types/index.ts`** – Supplies the domain `Address` and `Id` types used in the override contract.
- **`src/modules/account/demo.ts`** – Consumer: uses `makeAddressBook` to build a stable demo dataset (referenced in the file docblock as `export-demo-dataset.ts`).
- **`src/modules/account/tests/unit/fixtures.test.ts`** – Unit-test suite exercising `makeAddressBook` and its edge cases.

## Notes

- `items === undefined` (not a truthy check) is used so that passing `items: []` still emits an explicit empty array rather than relying on the schema default.
- A book's `_id` is pinned only for cross-run stability (demo exports); it carries no domain meaning because the book is addressed by `userId` alone. Entries, by contrast, are identity-bearing subdocuments, so their `_id` is semantically significant.
- `userId` is intentionally non-optional in the override type to push the "a book must have an owner" assertion to compile time rather than the call site.
