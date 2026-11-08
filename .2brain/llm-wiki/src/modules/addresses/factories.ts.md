---
source: src/modules/addresses/factories.ts
sha256: 735d4e9bddfc9386208dcc0f53d393ba60177c2210b33c0eb9962ec8fb562c4a
generated_at: 2026-11-08T04:54:31.486687+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/factories.ts

## Purpose

Builds address-book fixtures for use with `addressBookRepository.create`. It encodes the domain rule that a book is identified by its owner (`userId` is unique on the wire, so no book `_id` is generated) while individual entries are identity-bearing (each carries its own `_id`). The file exists so test and scenario code can produce valid, type-safe book payloads without hand-assembling Mongoose shapes.

## Key elements

- **`AddressBookOverrides`** – Input interface. `userId` (required) and optional `items: Address[]`. Passing `items: undefined` lets the schema's `default: []` produce an empty book.
- **`AddressBookFixture`** – Output type: `Partial<AddressBookDocument>` with `userId` pinned as required. This is the shape accepted by the repository's `create` method.
- **`makeAddressBook(overrides)`** – The sole factory function. Converts the caller's `userId` string into a `Types.ObjectId`, and if `items` are present, maps each entry's `id` → `_id` (also an ObjectId) while forwarding `label`/`phone` via `stripUndefined` so absent keys are omitted rather than set to `undefined`.

## Relationships

- **`src/modules/addresses/model.ts`** – Supplies the `AddressBookDocument` and `AddressItem` types that define the fixture shape and the per-entry field set.
- **`src/infrastructure/object-guards.ts`** – Provides `stripUndefined`, used to avoid writing explicit `undefined` keys into entry subdocuments.
- **`src/types/index.ts`** – Source of the `Address` and `Id` types consumed by the overrides interface.
- **`scenarios/addresses.ts`** – Scenario-level caller that assembles end-to-end address flows on top of the fixture this factory produces.
- **`src/modules/addresses/tests/unit/factories.test.ts`** – Unit tests exercising `makeAddressBook`'s mapping and omission behavior.
- **`tests/cross-cutting/side-effects-have-one-layer.test.ts`** – Cross-cutting guard that asserts this factory performs no I/O or other side effects (it is a pure shape transformation).

## Notes

- The `items` branch uses a spread (`...(items === undefined ? {} : { items: … })`) specifically so the key is *absent* from the object when not supplied; writing `items: undefined` would serialize differently in some Mongoose paths.
- Entry `id` is destructured out before the rest-spread, so it never leaks into the subdocument as a literal `id` key—only `_id` appears on the wire.
- The module doc-comment deliberately contrasts book identity (owner-keyed) with entry identity (self-keyed); keep that distinction intact when extending the factory.
