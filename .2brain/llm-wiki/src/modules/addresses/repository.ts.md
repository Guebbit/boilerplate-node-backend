---
source: src/modules/addresses/repository.ts
sha256: 92dd53b37ed6889fb847f08a94a0030372a7926971a9c75c02061d44c9d36eb0
generated_at: 2026-10-29T03:09:25.322546+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/repository.ts

## Purpose

Per-user address book repository. It exposes CRUD operations over a single Mongoose document per user (`items` is a DocumentArray) and enforces two cross-array invariants atomically: the book holds at most `addressBookMax` entries and exactly one entry is the default. All PII fields are encrypted at rest and decrypted before the document is returned to callers.

## Key elements

- **`ADDRESS_BOOK_LIMIT_REACHED`** — sentinel string returned (not thrown) by `addEntry` when the book is full.
- **`appendEntryPipeline(item, claimsDefault)`** — builds a single aggregation-pipeline update that appends an entry, demotes the current default if the new entry claims it, and makes the first entry of an empty book the default. Uses `$literal` to prevent `$`-prefixed user text from being interpreted as a field path.
- **`decryptBook(book)`** — in-place decrypts every item via `Object.assign` (preserves DocumentArray prototype methods).
- **`loadEntry(userId, addressId)`** — fetches the book and the matching entry, or `null` (404-equivalent).
- **`addressBookRepository`** — the exported object. Extends the generic `Repository` (from `create-repository`) with:
  - `reencrypt` — delegates to `reencryptOf(addressBookModel)`.
  - `create` — overrides the factory's `create`; encrypts items then decrypts (used by seeding, not by `addEntry`).
  - `findByUserId` — one query + decrypt.
  - `addEntry` — single `findOneAndUpdate` with the pipeline; cap enforced by the filter (`items.<max-1>` must not exist); duplicate-key collision resolved by re-read + retry (max 3 attempts).
  - `updateEntry` — load-modify-save; nullable fields (`label`, `phone`) cleared via `clearedOrValue`; PII fields re-encrypted with the entry's `_id` as AAD.
  - `setDefault` — idempotent pointer move; demotes all other entries in the same `save()`.
  - `removeEntry` — splices the entry; if it was the default, promotes the oldest remaining entry.
  - `deleteByUserId` — removes the whole document (accepts an optional `ClientSession`).

## Relationships

- **`src/modules/addresses/model.ts`** — provides `addressBookModel` (the Mongoose model) and `applyAddressBookTransform` (used by the `createRepository` factory).
- **`src/modules/addresses/pii.ts`** — source of all encryption/decryption helpers and the `REQUIRED_PII_FIELDS` list.
- **`src/modules/addresses/config.ts`** — provides `addressBookMax()` used in the add filter and cap check.
- **`src/modules/addresses/service.ts`** — primary consumer; calls the repository methods and maps the decrypted document to wire types.
- **`src/infrastructure/persistence/create-repository.ts`** — supplies the `Repository` type, `createRepository` factory, `toObjectId`, and `Wire` helper.
- **`src/infrastructure/persistence/changes.ts`** — `clearedOrValue` distinguishes "field absent" from "field set to null" for nullable PII fields.
- **`src/infrastructure/persistence/mongo-errors.ts`** — `isDuplicateKey` identifies the upsert-collision path in `addEntry`.
- **`src/infrastructure/security/reencrypt.ts`** — `reencryptOf`, `ReencryptSpec`, `ReencryptReport` back the `reencrypt` method.
- **`src/types/index.ts`** — `AddressInput`, `UpdateAddressRequest` shape the public API.
- **`scenarios/addresses.ts`** — seeding scenarios call `create` directly with plaintext fixtures, bypassing `addEntry`.

## Notes

- **Read-modify-write, not `$set`/`$pull`.** The "exactly one default" invariant spans the whole array, so `updateEntry`, `setDefault`, and `removeEntry` all load the document, mutate in memory, and `save()`. Mongoose's optimistic versioning is the concurrency guard (the loser retries manually).
- **`addEntry` is the exception** — it must be one atomic pipeline update so the size cap holds under concurrent adds. The filter `items.<max-1>: { $exists: false }` is evaluated by mongod while it holds the document lock.
- **`$literal` is mandatory** in the pipeline. Without it, any user-supplied string beginning with `$` (e.g. a label of `$items`) would be treated as a field path.
- **Duplicate-key disambiguation.** A filter miss on an existing book causes the upsert to hit the unique `userId` index; the code re-reads to tell "book is full" from "first-insert race," then retries up to 3 times.
- **Every returned document is decrypted.** Callers (service wire mapping, checkout snapshot) always see plaintext and never need to decrypt themselves.
- **`Object.assign` over array replacement.** `decryptBook` mutates each subdocument in place so Mongoose's DocumentArray methods remain intact; the document is not `.save()`-ed again after decryption.
- **Explicit return type on the export.** Mongoose generics are too large for TS to serialize an inferred type at an export boundary (TS7056); the type is written out by hand.
- **`createdAt` in the pipeline** uses `$ifNull: ['$createdAt', '$$NOW']` because pipeline upserts have no `$setOnInsert`.
