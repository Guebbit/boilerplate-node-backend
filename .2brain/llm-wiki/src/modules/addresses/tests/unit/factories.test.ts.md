---
source: src/modules/addresses/tests/unit/factories.test.ts
source_sha256: f5f632e2b74fa248ef59520d4d73c290d1e3a190d1d8fb0296f3a6e0cdd053ca
context_sha256: ce0dfb6473df737135435be4c4fce6425a9bc812214cafbef27e54b7e9fdcd95
generated_at: 2026-11-22T04:17:10.745346+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/tests/unit/factories.test.ts

## Purpose
Unit tests for `makeAddressBook`, the address-book fixture builder in `@modules/addresses/factories`. They pin down the shape of the documents the factory produces. In particular, every address entry gets its own `_id`, because address-book lines are addressed by id (e.g. `PUT /account/addresses/:addressId`). A fixture without ids would seed a book whose entries can't be edited or deleted.

## Key elements
- `USER`, `ADDRESS`: fixed hex ObjectId strings used as the owner id and the entry id.
- `DELIVERABLE`: the required address fields per the schema (`fullName`, `street`, `city`, `zip`, `country`, `default`).
- `describe('makeAddressBook')` cases:
  - `userId` is stored as a real `Types.ObjectId` that stringifies back to the input.
  - `items` is absent (checked with `Object.hasOwn`) when none are given.
  - Each entry's `_id` is an `ObjectId` built from the supplied `id`.
  - The deliverable fields pass through unchanged (`toMatchObject`).
  - `label` and `phone` are absent keys, not `undefined` values, when not supplied.
  - `label` and `phone` are kept when supplied.

## Relationships
- Imports only `makeAddressBook` from `src/modules/addresses/factories.ts`, the module under test. It also imports `Types` from `mongoose` to check ObjectId instances.

## Notes
- The absent-versus-`undefined` assertions matter. An `undefined` key would be stored as nothing rather than left absent, which is a different document from the one intended.
- The factory takes `id` on input items and emits `_id` on output items.
- Unlike the cart and wishlist builders, this factory always assigns an entry `_id`.
