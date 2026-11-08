---
source: src/modules/addresses/repository.ts
sha256: 549d5c3f0e39b634c686ea3e8519b80365aba59f55ce8af447e4ecfa22432348
generated_at: 2026-11-08T04:56:19.637445+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/repository.ts

## Purpose

Read-modify-write repository for the per-user address book. It owns all reads and writes to `addressBookModel`, enforcing the "exactly one default" invariant, the `NODE_ADDRESS_BOOK_MAX` entry cap, and PII encryption at the field level. Every value it returns to callers is already decrypted.

## Key elements

- **`ADDRESS_BOOK_LIMIT_REACHED`** — sentinel string returned by `addEntry` when the book is already at capacity; lets callers distinguish "no space" from "not found."
- **`appendEntryPipeline`** *(internal)* — builds a single MongoDB aggregation-pipeline update that appends an entry and resolves the default in one atomic write. Uses `$literal` to prevent user text starting with `$` from being interpreted as a field path.
- **`decryptBook`** *(internal)* — iterates `book.items` and `Object.assign`s decrypted fields onto each subdocument (preserves DocumentArray methods).
- **`loadEntry`** *(internal)* — loads the book by `userId` and finds the entry by `addressId`; returns `null` if either is missing.
- **`addressBookRepository`** — the sole export. Extends the generic `Repository` with:
  - `findByUserId` — single read; `null` means the user has no book.
  - `addEntry` — upsert via pipeline; cap enforced in the query filter (`items.<max-1>` must not exist). Retries up to 3× on duplicate-key collisions from concurrent upserts.
  - `updateEntry` — read-modify-write; supports `null` to clear `label`/`phone` via `clearedOrValue`.
  - `setDefault` — demotes all entries, promotes target; idempotent (skips save if already default).
  - `removeEntry` — splices entry; promotes oldest remaining to default if the removed one held it.
  - `deleteByUserId` — deletes the whole document (accepts optional Mongoose session for transactional checkout teardown).
  - `create` — overrides the factory's create; encrypts items before `model.create`. Used directly by scenario seeds.
  - `reencrypt` — delegates to `reencryptOf(addressBookModel)` from infrastructure.

## Relationships

- **`./model`** — provides `addressBookModel` (Mongoose schema) and `applyAddressBookTransform` (field-level encryption/decryption hooks used by the repository factory).
- **`./pii`** — source of all encrypt/decrypt helpers (`encryptAddressItem`, `encryptAddressField`, `decryptAddressItem`) and the `REQUIRED_PII_FIELDS` list that drives the update loop.
- **`./config`** — `addressBookMax()` supplies the cap used in the `addEntry` filter and the duplicate-key re-check.
- **`@infrastructure/persistence/create-repository`** — factory that produces the base `Repository` shape (findById, save, etc.) and the `toObjectId` helper; this file spreads its result and overrides `create`.
- **`@infrastructure/persistence/changes`** — `clearedOrValue` distinguishes "field absent" from "explicit null" so `label`/`phone` can be cleared.
- **`@infrastructure/persistence/mongo-errors`** — `isDuplicateKey` lets `addEntry` separate a lost upsert race from a genuine limit hit.
- **`@infrastructure/security/reencrypt`** — `reencryptOf` wraps the model with a bulk re-encryption runner exposed as `addressBookRepository.reencrypt`.
- **`@types`** — `CreateAddressRequest` / `UpdateAddressRequest` shape the public write signatures.
- **`scenarios/addresses.ts`** (and `scenarios/seed.ts`) — call `addressBookRepository.create` directly with plaintext fixtures, bypassing `addEntry`.
- **`src/modules/addresses/service.ts`** — primary consumer; maps repository results to the wire shape and interprets `null` vs. `ADDRESS_BOOK_LIMIT_REACHED` for HTTP status codes.

## Notes

- **Read-modify-write is deliberate.** The "exactly one default" invariant spans the whole array, so single-field `$set`/`$pull` cannot maintain it atomically. Mongoose's optimistic versioning (`save()`) is the concurrency guard; the losing caller retries manually. `addEntry` is the sole exception—it uses one pipeline update so the cap holds under concurrent bursts.
- **`$literal` is load-bearing.** Without it, a user-supplied label like `"$items"` would be dereferenced as a path inside the aggregation pipeline, corrupting the entry.
- **`updatePipeline: true`** is required by Mongoose whenever the update argument is an array; omitting it throws at the driver level.
- **Encryption happens before the write; decryption happens after.** Every public method that returns a book pipes through `decryptBook`, so callers (service layer, checkout snapshot) always see plaintext without needing to know the encryption scheme.
- **`Object.assign` vs. array replacement** in `decryptBook`: replacing `book.items` would detach the Mongoose DocumentArray and its virtuals/methods; `Object.assign` per subdocument keeps them intact.
- **The cap check lives in the query filter, not a pre-read count.** mongod evaluates `items.<max-1>.$exists: false` while holding the document lock, so concurrent adds cannot all see "room" and overshoot.
