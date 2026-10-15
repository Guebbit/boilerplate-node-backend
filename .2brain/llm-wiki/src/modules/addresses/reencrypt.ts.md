---
source: src/modules/addresses/reencrypt.ts
sha256: d887cce7c1faec40f53848de8eca378e3c14a9e4079dba47954ad80b6567f9f6
generated_at: 2026-10-15T10:18:51.255838+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/reencrypt.ts

## Purpose

Application-level entry point for re-encrypting all address-book PII fields onto the newest `NODE_PII_ENCRYPTION_KEY`. It bridges the generic re-encryption machinery in `@infrastructure/security` with the concrete address-book schema, and is invoked by the ops script `reencrypt`.

## Key elements

- **`reencryptAddressBooks(dryRun?)`** (exported) — Calls `addressBookRepository.reencrypt` with the current key ring and a `fieldsOf` mapper. Pass `dryRun: true` to count affected values without writing.
- **`fieldsOf(book)`** (module-private) — Flattens every entry in a book into an array of `EncryptedField` objects, each carrying the dotted write-back `path` (e.g. `items.0.fullName`), the stored ciphertext, a `piiBinding`, and a human-readable `label`.
- **`ENTRY_FIELDS`** (module-private constant) — The fixed list of encrypted fields (`fullName`, `street`, `city`, `zip`, `country`, `phone`) in reporting order.

## Relationships

- **`@infrastructure/security/reencrypt`** — Supplies the `EncryptedField` type used as the element shape of `fieldsOf`.
- **`@infrastructure/security/pii-encryption`** — Supplies `getPiiEncryptionKeyRing` (key ring handed to the repository) and `piiBinding` (wraps the per-field AAD into the binding expected by the infrastructure).
- **`./model`** — Imports the `AddressBookDocument` type that `fieldsOf` consumes.
- **`./repository`** — Imports `addressBookRepository`; this file is the sole caller of its `reencrypt` method.
- **`./pii`** — Imports `addressAad` to compute the per-field authentication data for each binding.

## Notes

- `fieldsOf` uses a non-null assertion on `entry._id!` when building the AAD. This assumes the repository never returns entries without an `_id`; if that invariant is violated, the binding will be built from `undefined`.
- Adding a new encrypted field to an address entry requires updating both the `model` type **and** the `ENTRY_FIELDS` array here; the re-encryption run will silently skip any field not listed.
- The file is a pure module (no top-level side effects); importing it does not trigger a re-encryption.
