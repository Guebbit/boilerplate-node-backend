---
source: src/modules/addresses/repository.ts
sha256: a12d465aa81b8ec787e3260cd763dee20bd35a7f7eaaf8bed3f403b4151385bd
generated_at: 2026-09-27T14:39:30.387883+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/repository.ts

## Purpose
Read-modify-write repository for a user's address book. It owns the full CRUD surface (find, add, update, remove, hard-delete), enforces the "exactly one default" invariant across the entire `items` array, and handles PII encryption on write / decryption on read so that every caller sees plaintext.

## Key elements
- **`addressBookRepository`** (export) — the sole public surface. A `Repository<AddressBookDocument, Wire<…>>` plus five domain methods. Spreads the generic `createRepository` factory then overrides `create`.
  - `findByUserId` — fetches the book by user; `null` means the user has no saved addresses (same as an empty book).
  - `addEntry` — appends one entry, creating the book if needed. First entry becomes default regardless; a later `default: true` demotes the current holder.
  - `updateEntry` — patches a single entry in place. Uses `clearedOrValue` for nullable fields (`label`, `phone`); `default: true` claims the slot, `false`/absent leaves it. Returns `null` if book or entry is missing.
  - `removeEntry` — filters the entry out; if it was the default, promotes `items[0]`. Returns `null` if absent.
  - `deleteByUserId` — hard-deletes the document (account deletion). Accepts an optional Mongoose `ClientSession`.
  - `create` (overridden) — encrypts `items` at creation time; used by seed fixtures that bypass `addEntry`.
- **`decryptBook`** (module-private) — in-place decryption of every item via `Object.assign(item, decryptAddressItem(item))`, preserving the Mongoose DocumentArray.

## Relationships
- **`./model.ts`** — provides `addressBookModel` (Mongoose schema) and `applyAddressBookTransform` (used as the factory's wire transform).
- **`./pii.ts`** — `encryptAddressItem` / `decryptAddressItem` handle per-item PII (full name, street, city, zip, country, phone) as an atomic unit.
- **`./service.ts`** — primary caller; maps repository results to the API wire shape.
- **`@infrastructure/persistence/create-repository.ts`** — supplies the `createRepository` factory, `toObjectId` helper, and the `Repository` / `Wire` type contracts.
- **`@infrastructure/security/pii-encryption.ts`** — `encryptPii` is applied field-by-field in `updateEntry` (and implicitly via `encryptAddressItem` on create/add).
- **`@infrastructure/persistence/changes.ts`** — `clearedOrValue` distinguishes "explicit null" (clear the field) from "absent" (leave untouched) for nullable fields.
- **`@types` (`src/types/index.ts`)** — `AddressInput` and `UpdateAddressRequest` define the request shapes.
- **`scenarios/addresses.ts`** — test/seed scenarios that exercise the repository, including the `create` override path with plaintext fixtures.

## Notes
- **Why read-modify-write:** the "exactly one default" rule spans the whole array; no single `$set`/`$pull` can demote, promote, and prune atomically. Concurrency is guarded by Mongoose optimistic versioning on `save()` — the expected failure mode is a human retrying, not a hot race.
- **Explicit type annotation on the export:** Mongoose's generic parameters are too large for TS to serialize an inferred type at an export boundary (TS7056). The full type is written out by hand.
- **`Object.assign` vs. array replacement:** `decryptBook` mutates each subdocument in place rather than replacing `book.items`, so the DocumentArray retains its Mongoose methods on a document that is never `.save()`-ed again.
- **`null` ≠ empty array:** `findByUserId`, `updateEntry`, and `removeEntry` resolve `null` to signal "not found" (→ 404 at the controller), distinct from a book that exists with zero items.
- **`create` is intentionally overridable:** `scenarios/seed.ts` (and similar fixtures) call it directly with already-shaped plaintext data, bypassing `addEntry`'s default-invariant logic.
