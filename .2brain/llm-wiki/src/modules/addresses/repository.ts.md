---
source: src/modules/addresses/repository.ts
sha256: a0f37bb4cfdb36ac2e5105ba867838fae46a72bbf8e44c4d60c06233849753a4
generated_at: 2026-10-14T14:53:00.363428+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/repository.ts

## Purpose

Data-access layer for the per-user address book. Encapsulates all CRUD against `addressBookModel`, handles PII encryption/decryption at the boundary, enforces the "exactly one default" invariant and the max-entries cap, and exposes a uniform repository interface to `service.ts`. Most writes are read-modify-write (load → mutate → `save()`); only `addEntry` is a single atomic pipeline update.

## Key elements

- **`ADDRESS_BOOK_FULL`** — sentinel string (`'address-book-full'`) returned by `addEntry` when the book is at `addressBookMax()` capacity; signals "nothing written" without throwing.
- **`appendEntryPipeline(item, claimsDefault)`** — builds a MongoDB aggregation-pipeline update that atomically appends an entry, demotes any existing default, and promotes the first entry of an empty book to default. Used exclusively by `addEntry`.
- **`decryptBook(book)`** — decrypts every item in-place via `Object.assign` (preserves Mongoose DocumentArray methods) and returns the same document.
- **`addressBookRepository`** — the sole export. Extends the base `Repository` (from `create-repository`) with:
  - `reencrypt(spec, dryRun?)` — delegated to `reencryptOf(addressBookModel)`.
  - `create(data)` — override of the factory; encrypts items then decrypts on return.
  - `findByUserId(userId)` — single-document read, returns `null` if absent.
  - `addEntry(userId, entry, attemptsLeft?)` — upsert via `appendEntryPipeline`; cap enforced in the query filter; retries on duplicate-key race (up to 3 attempts).
  - `updateEntry(userId, addressId, changes)` — RMW; encrypts changed fields; `null`/`undefined` clearing via `clearedOrValue`.
  - `setDefault(userId, addressId)` — RMW; demotes all, promotes target; idempotent.
  - `removeEntry(userId, addressId)` — RMW; promotes oldest remaining to default if the removed one held it.
  - `deleteByUserId(userId, session?)` — hard delete, optionally within a transaction session.

## Relationships

- **`./model`** — imports `addressBookModel` (Mongoose model), `applyAddressBookTransform` (wire mapping), and the `AddressBookDocument` type.
- **`./pii`** — imports `encryptAddressItem`, `encryptAddressField`, `decryptAddressItem` for field-level AAD encryption.
- **`./config`** — imports `addressBookMax()` to drive the cap filter and full-check.
- **`@infrastructure/persistence/create-repository`** — imports the `createRepository` factory, `toObjectId` helper, and the `Repository`/`Wire` type contracts.
- **`@infrastructure/persistence/changes`** — imports `clearedOrValue` to map `null` → `$unset`-compatible `undefined` for nullable fields (`label`, `phone`).
- **`@infrastructure/persistence/mongo-errors`** — imports `isDuplicateKey` to distinguish upsert-on-existing from a true insert race in `addEntry`.
- **`@infrastructure/security/reencrypt`** — imports `reencryptOf` and its spec/report types for the reencrypt endpoint.
- **`@types`** — imports `AddressInput` and `UpdateAddressRequest` (API-level input shapes).
- **`scenarios/addresses.ts`** — integration-test scenario that exercises the repository through `service.ts`.

## Notes

- **RMW vs. pipeline.** Every write *except* `addEntry` is load-mutate-save. The "one default" invariant spans the whole array, so no single `$set`/`$pull` is sufficient. Mongoose's optimistic versioning (`__v`) is the only concurrency guard for these paths; the caller must retry on `VersionError`.
- **Cap in the filter, not a pre-read.** `addEntry` checks `items.<max-1>: { $exists: false }` in the query itself so mongod evaluates it under the document lock. A separate `countDocuments` would allow a burst of concurrent adds to overshoot.
- **Explicit type annotation.** The repository's type is written out by hand because Mongoose's generics exceed TS's serialization limit at an export boundary (TS7056). Do not rely on inference here.
- **`phone: null` → `undefined`.** Unlike `label` (which goes through `clearedOrValue`), `phone` is explicitly mapped to `undefined` before assignment because `clearedOrValue` is only applied to `label`.
- **`_id` generated before encryption.** The entry's `_id` must exist before `encryptAddressItem` runs, because it is included in every field's AAD (authenticated data). Re-encrypting after the fact would break verification.
- **`Object.assign`, not array replacement, in `decryptBook`.** Replacing the items array would detach the DocumentArray's Mongoose methods. Since none of these paths call `.save()` on the decrypted return value, the document is effectively read-only after decryption.
