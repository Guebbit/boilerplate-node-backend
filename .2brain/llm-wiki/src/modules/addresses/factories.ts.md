---
source: src/modules/addresses/factories.ts
sha256: 735d4e9bddfc9386208dcc0f53d393ba60177c2210b33c0eb9962ec8fb562c4a
generated_at: 2026-10-14T14:51:53.788192+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/factories.ts

## Purpose

Test-factory module for constructing address-book fixtures. It encapsulates the "how do we build a book" decision: a book is uniquely addressed by its `userId` (no `_id` override), while each entry inside it *does* carry its own identity. The single exported factory produces a document shape ready for `addressBookRepository.create`, keeping ObjectId construction in one place.

## Key elements

- **`AddressBookOverrides`** (interface) — caller-supplied input: required `userId: Id` and optional `items: Address[]`. Omitting `items` means "book with zero entries."
- **`AddressBookFixture`** (type) — `Partial<AddressBookDocument> & Pick<…, 'userId'>`; the return shape the repository expects.
- **`makeAddressBook`** (function) — converts the contract's `id` field into each subdocument's `_id` (via `new Types.ObjectId`), spreads remaining fields, and uses `stripUndefined` to omit `label`/`phone` keys that are `undefined`. Returns an `AddressBookFixture`.

## Relationships

- **`src/modules/addresses/model.ts`** — imports the `AddressBookDocument` and `AddressItem` types that shape the fixture's structure.
- **`src/infrastructure/object-guards.ts`** — imports `stripUndefined` to keep optional `label`/`phone` keys out of the emitted object.
- **`src/types/index.ts`** — imports the shared `Address` and `Id` types used in the public interface.
- **`scenarios/addresses.ts`** — primary consumer; calls `makeAddressBook` to seed scenario fixtures.
- **`src/modules/addresses/tests/unit/factories.test.ts`** — unit-tests the mapping and omission behavior of `makeAddressBook`.
- **`tests/cross-cutting/side-effects-have-one-layer.test.ts`** — cross-cutting guard that likely asserts ObjectId construction (a side-effecting operation) lives only in this factory layer, not in models or repositories.

## Notes

- `userId` is **required** at the interface level (not optional under `Partial`) so the caller cannot accidentally create an ownerless book; the module docstring explicitly rejects the `Partial`-only approach.
- When `items` is `undefined`, the `items` key is absent from the fixture entirely (not set to `[]`), letting the Mongoose schema's `default: []` apply.
- The `id → _id` rename for subdocuments is the *only* shape transformation here; all other fields pass through unchanged.
