---
source: src/modules/addresses/repository.ts
source_sha256: b903baf90b59743b9e87f67a3ad9f20f09b9c4b9be6039a3a8882ffcf77ad339
context_sha256: 6f8c3aad727f80b421e2215a7efd200e62e182e5e23307fafd81427e8147cca0
generated_at: 2026-11-22T04:15:24.289373+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/repository.ts

## Purpose
Persistence layer for a user's address book (one document per user holding an `items` array). It encrypts PII on write, decrypts on every return, and enforces the "exactly one default entry" invariant and the book-size cap. Unlike the cart, most writes are read-modify-write rather than `$set`/`$pull`, because the default invariant spans the whole array.

## Key elements
- `ADDRESS_BOOK_LIMIT_REACHED`: sentinel string that `addEntry` resolves to when the book already holds `addressBookMax()` entries. Nothing is written in that case.
- `appendEntryPipeline(item, claimsDefault)`: builds the aggregation-pipeline update used by `addEntry`.
  - It appends the entry and demotes existing entries when the new one claims default, or when the book is empty.
  - `$ifNull` lets the same update act as the insert for a first entry.
  - `$literal` wraps the entry so user text starting with `$` is not read as a field path.
  - It also sets `createdAt` if absent, since a pipeline upsert has no `$setOnInsert`.
- `decryptBook`: decrypts every item in place with `Object.assign`, which keeps the Mongoose DocumentArray intact. All returned books go through it.
- `loadEntry(userId, addressId)`: loads the user's book and the matching entry, or `null` if either is missing.
- `addressBookRepository`: the exported object, with its type written out explicitly to avoid TS7056. It spreads `createRepository(...)` (using `applyAddressBookTransform`) and `reencrypt: reencryptOf(addressBookModel)`, then adds or overrides:
  - `create`: overrides the factory's `create`. It encrypts each item (generating an `_id` if missing) and decrypts the result.
  - `findByUserId`: returns the decrypted book, or `null` if the user never saved an address.
  - `addEntry(userId, entry, attemptsLeft = 3)`: a single `findOneAndUpdate` upsert using the pipeline (see Notes).
  - `updateEntry`: loads the entry, applies the changes, then calls `book.save()`.
    - `label` and `phone` are nullable, and `null` clears them.
    - The `REQUIRED_PII_FIELDS` are re-encrypted with `encryptAddressField`.
    - It does not touch the default flag.
  - `setDefault`: demotes all entries, promotes the target, and saves. It is idempotent: if the entry is already the default, it returns without saving.
  - `removeEntry` and `deleteByUserId(userId, session?)`: declared in the type. The visible source is cut off before their bodies.

## Relationships
- `./model`: provides `addressBookModel`, `applyAddressBookTransform` and the `AddressBookDocument` type.
- `./pii`: supplies `encryptAddressItem`, `encryptAddressField`, `decryptAddressItem` and `REQUIRED_PII_FIELDS`. The entry `_id` is part of each field's AAD, so it is generated before encryption.
- `./config`: `addressBookMax()` gives the cap.
- `@infrastructure/persistence/create-repository`: provides `createRepository`, `toObjectId`, and the `Repository` and `Wire` types.
- `@infrastructure/persistence/changes`: `clearedOrValue` turns `null` into an unset on save.
- `@infrastructure/persistence/mongo-errors`: `isDuplicateKey` classifies the upsert collision.
- `@infrastructure/security/reencrypt`: `reencryptOf`, `ReencryptSpec` and `ReencryptReport` back the `reencrypt` method.
- `@types`: supplies the `CreateAddressRequest` and `UpdateAddressRequest` shapes.
- `service.ts`: consumes this repository. Its wire mapping relies on plaintext results.
- `reencrypt.ts` (in this module): not referenced directly in the visible code. Its relationship to the repository's `reencrypt` method is not shown.
- `scenarios/addresses.ts`: not referenced in the visible code.

## Notes
- The cap lives in the update filter (`items.<max-1>` must not exist), so concurrent adds cannot overshoot. A filter miss on an existing book makes the upsert collide with the unique `userId` index. `addEntry` catches that duplicate key and re-reads the book:
  - If the book is full, it returns `ADDRESS_BOOK_LIMIT_REACHED`.
  - Otherwise it retries, up to `attemptsLeft`, then throws "exhausted retries" with the original error as `cause`.
- Only `addEntry` is atomic in a single update. The other writes rely on Mongoose's optimistic versioning on `save()`, and the caller retries by hand on a conflict.
- `create` is also called directly with a plaintext fixture (never through `addEntry`), so it encrypts items itself.
- `updateEntry`, `setDefault` and (per its description) `removeEntry` return `null` for a missing book or entry. This is the same 404 an invented id gets.
- The pipeline upsert needs `updatePipeline: true`, or Mongoose rejects the array update.
