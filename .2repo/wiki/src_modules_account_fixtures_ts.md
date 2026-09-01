# src/modules/account/fixtures.ts

## Purpose

Factory functions that build AddressBook documents in a shape ready for `addressBookRepository.create`. It bridges the gap between the API-level `Address` type (which carries an `id`) and the MongoDB subdocument shape (`AddressItem` with `_id`), and gives tests and the demo-dataset exporter a single, deterministic way to construct fixtures.

## Key elements

- **`AddressBookOverrides`** — Input interface for `makeAddressBook`. Requires `userId` (the owning user) and optionally `items` (array of `Address`); extends `FactoryIdentity` so callers can pin an `_id`.
- **`AddressBookFixture`** — Output type: `Partial<AddressBookDocument>` with `userId` made required. Represents a book ready to hand to the repository.
- **`toEntry`** (internal) — Converts one `Address` into an `AddressItem`: maps `id` → `_id` (via `new Types.ObjectId`) and uses `compact` so absent `label`/`phone` leave no key behind.
- **`makeAddressBook`** (exported) — Accepts `AddressBookOverrides`, returns an `AddressBookFixture`. Spreads `identityOf(identity)` for any pinned `_id`/timestamps, and conditionally maps `items` through `toEntry` (omits the key entirely when `items` is undefined, letting the schema default apply).

## Relationships

- **`src/infrastructure/persistence/fixtures.ts`** — Imports `compact`, `identityOf`, and the `FactoryIdentity` type; this file relies on those shared helpers rather than re-implementing them.
- **`src/modules/account/model.ts`** — Imports the `AddressBookDocument` and `AddressItem` types that define the document/subdocument shapes this file produces.
- **`src/types/index.ts`** — Imports the `Address` and `Id` types used in the public signatures.
- **`src/modules/account/demo.ts`** — Consumes `makeAddressBook` to build a stable dataset; the pinned `_id` via `FactoryIdentity` is what lets the export be reproducible run over run.
- **`src/modules/account/tests/unit/fixtures.test.ts`** — Unit-tests the output shape and edge cases of `makeAddressBook` / `toEntry`.

## Notes

- `userId` is **required** in `AddressBookOverrides` (not under `Partial`). The rationale stated in the doc: making it optional would just shift the non-null assertion to every caller.
- Omitting `items` is meaningful: it produces a book with **no** `items` key, allowing the Mongoose schema's `default: []` to apply. Passing an empty array is different (explicit `items: []`).
- `toEntry` intentionally does **not** forward `id` as a separate field; it becomes `_id`. Any other `Address` fields spread through verbatim.
- The file is `@module`-scoped: no default export, and the named exports are the only public surface.
