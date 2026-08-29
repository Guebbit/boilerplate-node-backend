# src/modules/account/factory.ts

## Purpose

Factory for building address-book fixtures used in demo data and tests. It converts the wire-contract `Address` shape into the Mongoose subdocument shape and pins `_id` values (on both the book and its entries) so that `scripts/export-demo-dataset.ts` produces stable, reproducible output across runs.

## Key elements

- **`AddressBookOverrides`** — Input interface a caller passes: required `userId` (24-char hex string), optional `items` (array of contract `Address`), and the shared `FactoryIdentity` fields.
- **`AddressBookFixture`** — Output type: `Partial<AddressBookDocument>` with `userId` made required. Suitable for `addressBookRepository.create`.
- **`toEntry`** (module-private) — Maps a contract `Address` (`{ id, label, phone, ... }`) to an `AddressItem`, converting the wire `id` into `_id: ObjectId` and dropping absent optional keys via `compact`.
- **`makeAddressBook`** — Main export. Spreads pinned identity, sets `userId` as an `ObjectId`, and maps `items` through `toEntry`. If `items` is `undefined`, the key is omitted entirely so the schema's `default: []` applies.

## Relationships

- **`src/infrastructure/persistence/factory.ts`** — Provides `compact`, `identityOf`, and the `FactoryIdentity` type shared across all module factories.
- **`src/types/index.ts`** — Source of the `Address` and `Id` contract types that define the wire shape.
- **`src/modules/account/model.ts`** — Supplies `AddressBookDocument` and `AddressItem`, the Mongoose document/subdocument types this factory populates.
- **`src/modules/account/demo.ts`** — Consumer of `makeAddressBook` when assembling the demo address-book dataset.

## Notes

- Unlike the cart factory (where lines are addressed by product and use `_id: false`), address **entries** keep their `_id` because two entries can share identical fields yet be semantically distinct ("home" vs "office"). Every endpoint addresses an entry by its own id, so the fixture must pin it.
- Pass `items: undefined` (or omit it) for an empty book; do not pass `items: []` if you want the schema default to be the source of truth.
- The `id → _id` rename in `toEntry` is intentional: the wire contract exposes `id`, the document stores `_id`. Callers of this factory must supply the contract shape, not the document shape.
