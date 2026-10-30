---
source: src/modules/addresses/reencrypt.ts
sha256: 674e8e5db1038e75466d4651be497424fb0e70d292cedd4b8f7fb698455fc14a
generated_at: 2026-10-29T03:09:05.471406+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/reencrypt.ts

## Purpose

Module-level wrapper that re-encrypts every PII field in every address-book entry onto the current `NODE_PII_ENCRYPTION_KEY`. It exists so the ops script `reencrypt` (see `@infrastructure/security/reencrypt`) has a single, domain-aware entry point that knows *which* fields to touch and *how* to bind them to their address context.

## Key elements

- **`reencryptAddressBooks(dryRun?)`** (exported) — The sole public export. Delegates to `addressBookRepository.reencrypt`, passing the PII key ring, a `fieldsOf` mapper, and the `dryRun` flag. `dryRun` (default `false`) makes the run count affected entries without writing.
- **`fieldsOf(book)`** (module-private) — Flattens `book.items × ADDRESS_PII_FIELDS` into an `EncryptedField[]`. For each defined field it builds `{ path: "items.{i}.{field}", stored, binding, label }`, where `binding` is derived from `piiBinding(addressAad(field, entry._id!))`.

## Relationships

- **`src/infrastructure/security/pii-encryption.ts`** — Supplies `getPiiEncryptionKeyRing()` (the ring handed to the repository) and `piiBinding()` (used to compute the per-field cryptographic binding).
- **`src/infrastructure/security/reencrypt.ts`** — Defines the `EncryptedField` type that `fieldsOf` must return; also hosts the ops script that invokes `reencryptAddressBooks`.
- **`src/modules/addresses/pii.ts`** — Provides `ADDRESS_PII_FIELDS` (the list of encryptable field names) and `addressAad()` (builds the AAD value for binding).
- **`src/modules/addresses/repository.ts`** — `addressBookRepository.reencrypt(ring, fieldsOf, dryRun)` performs the actual read-modify-write loop; this file only shapes the inputs.
- **`src/modules/addresses/model.ts`** — `AddressBookDocument` is the document type `fieldsOf` operates over.

## Notes

- `fieldsOf` is passed as a **callback** to the repository; it is not invoked in this module. The repository calls it per document during iteration.
- `entry._id!` uses a non-null assertion — the code assumes every item in `book.items` carries an `_id`. If an item lacks one, `addressAad` would receive `undefined`.
- The `path` strings are dot-notation (`items.0.email`), implying the repository resolves them manually rather than using a deep-merge utility.
- `dryRun` is a pure count: no writes, no key rotations occur.
