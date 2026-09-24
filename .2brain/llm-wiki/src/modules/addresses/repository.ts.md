---
source: src/modules/addresses/repository.ts
sha256: 54d6981990f3baa943b7489a7bc2b322d36a03cb54ff67300d023b5d83e2790a
generated_at: 2026-09-23T18:21:06.883750+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/repository.ts

## Purpose

Data-access layer for a per-user address book. Implements a **read-modify-write** pattern (load the whole book, mutate in memory, `save()`) rather than atomic `$set`/`$pull` updates, because the "exactly one default address" invariant spans the entire `items` array and cannot be maintained by a single field-level update. Handles PII encryption on write and decryption on every return path so callers always see plaintext.

## Key elements

- **`decryptBook`** (internal) – Walks every subdocument in `book.items`, calls `decryptAddressItem`, and writes the result back via `Object.assign` (preserves Mongoose DocumentArray methods; no `.save()` is called afterwards).
- **`addressBookRepository`** (exported) – The repository object. Spreads the base factory from `createRepository` (giving `findOne`, `findById`, etc.) and adds address-specific methods:
    - `create` – Overrides the factory's `create`. Encrypts all PII fields, inserts, then decrypts. Used by seeding scenarios that bypass `addEntry`.
    - `findByUserId` – Returns the decrypted book or `null` (distinguished from an empty book only by identity; callers treat both as "no addresses").
    - `addEntry` – Appends an entry (creating the book if absent). Enforces the default rule: first entry is always default; a later `default: true` demotes the current holder.
    - `updateEntry` – Partial edit of one entry. `default: true` demotes others and promotes this one; `default: false`/absent leaves the current assignment untouched (avoids orphaning the book with zero defaults). Returns `null` if book or entry not found.
    - `removeEntry` – Deletes one entry. If it was the default, promotes the first remaining entry. Returns `null` if not found.
    - `deleteByUserId` – Hard-deletes the entire book (account deletion path).

## Relationships

- **`src/modules/addresses/model.ts`** – Supplies `addressBookModel` (the Mongoose model), `applyAddressBookTransform` (used as the `createRepository` transform), and the `AddressBookDocument` type.
- **`src/infrastructure/persistence/create-repository.ts`** – Provides the `createRepository` factory, `toObjectId` helper, and the `Repository` / `Wire` generic types that shape the export's type signature.
- **`src/infrastructure/security/pii-encryption.ts`** – Provides `encryptPii`, applied to every PII field (`fullName`, `street`, `city`, `zip`, `country`, and optionally `phone`) before any write.
- **`src/modules/addresses/pii.ts`** – Provides `decryptAddressItem`, used by `decryptBook` to reverse the encryption on the read path.
- **`src/types/index.ts`** – Source of the `AddressInput` and `UpdateAddressRequest` types that shape method signatures.
- **`src/modules/addresses/service.ts`** – Primary consumer; maps the returned decrypted documents into the wire format for controllers.
- **`scenarios/addresses.ts`** – Seed/test scenario that calls `addressBookRepository.create` directly with plaintext fixtures, bypassing `addEntry`.

## Notes

- **Why not `$set`/`$pull`?** The default-address invariant is array-wide. A single atomic update cannot simultaneously demote the old default, promote the new one, and prune a removed entry. Mongoose's optimistic versioning on `save()` guards against rare concurrent edits; the loser is expected to retry manually.
- **`Object.assign` vs. array replacement** – `decryptBook` mutates subdocuments in place so the DocumentArray's own methods (`.filter()`, `.push()`, etc.) remain available if a caller further mutates the returned book.
- **Explicit type on export** – The `Repository<…> & { … }` type is spelled out because Mongoose's large generics cause a TS7056 error at an export boundary; you cannot rely on inference.
- **`phone` is optional** – Every encrypt site uses the conditional-spread pattern (`...(item.phone === undefined ? {} : { phone: … })`) to avoid writing an `undefined` value into the document.
- **`null` vs. empty book** – `findByUserId` returns `null` when no document exists. Callers (service, checkout snapshot) treat this identically to `items: []`.
