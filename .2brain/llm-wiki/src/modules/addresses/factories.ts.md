---
source: src/modules/addresses/factories.ts
sha256: 1d5dde3a6cfe299c35a49881c3604b37e863bb05f84a337f8bbc22699bdd9ee2
generated_at: 2026-09-23T18:19:57.114045+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/factories.ts

## Purpose

Builds address-book fixtures (the row shape passed to `addressBookRepository.create`) from a small set of caller-supplied overrides. The file exists to centralise the mapping from a domain-level `Address` (with a string `id`) into the Mongoose document shape (`_id` as `ObjectId`) so callers never assemble the persistence object by hand.

## Key elements

- **`AddressBookOverrides`** (interface) — The input contract for `makeAddressBook`: `userId: Id` (required) and `items?: Address[]` (optional; omitting it lets the schema default `[]` apply).
- **`AddressBookFixture`** (type alias) — `Partial<AddressBookDocument> & Pick<AddressBookDocument, 'userId'>`; the output shape accepted by the repository's `create`.
- **`makeAddressBook`** (function) — Converts `userId` to a `Types.ObjectId`, maps each item's `id` to `_id`, and passes `label`/`phone` through `stripUndefined` so absent optionals leave no key. When `items` is `undefined` the key is omitted entirely.

## Relationships

- **`src/infrastructure/persistence/factories.ts`** — Imports `stripUndefined`, a shared helper that drops keys whose values are `undefined`.
- **`src/modules/addresses/model.ts`** — Imports the `AddressBookDocument` and `AddressItem` types that define the target document shape.
- **`src/types/index.ts`** — Imports the domain-level `Address` and `Id` types used in the public signature.
- **`src/modules/addresses/tests/unit/factories.test.ts`** — Unit tests exercising `makeAddressBook` (output shape, `stripUndefined` behaviour, `_id` mapping).
- **`scenarios/addresses.ts`** — Downstream consumer that calls `makeAddressBook` to build fixtures for higher-level scenarios.
- **`tests/cross-cutting/side-effects-have-one-layer.test.ts`** — Cross-cutting test that likely asserts this factory (a pure builder) contains no I/O or side-effects.

## Notes

- **Book vs. entry identity:** A *book* is addressed solely by `userId` (unique, no book-level `_id` reaches the wire), so `makeAddressBook` takes no `_id` override. An *entry* (item) keeps its own `_id` because two entries can be identical in every field yet still be distinct. This asymmetry is the reason the factory's signature looks the way it does.
- **`userId` is required, not optional:** The type enforces this (`Pick<AddressBookDocument, 'userId'>`) so the "must have an owner" invariant lives in the type rather than as a runtime assertion at the call site.
- **`items === undefined` vs. `items = []`:** Passing `items: []` explicitly sets the key to an empty array; omitting `items` leaves the key absent so the Mongoose schema default applies. Both yield an empty book, but the wire shape differs.
