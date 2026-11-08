---
source: src/modules/addresses/reencrypt.ts
sha256: 674e8e5db1038e75466d4651be497424fb0e70d292cedd4b8f7fb698455fc14a
generated_at: 2026-11-08T04:56:02.236573+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/reencrypt.ts

## Purpose

Thin adapter that feeds address-book documents into the generic PII key-rotation pipeline. It knows *which* fields are encrypted on an address entry and *how* to bind them, then hands the work off to the repository. Exists so the ops `reencrypt` script (see `@infrastructure/security/reencrypt`) has an address-domain entry point without the infrastructure layer needing to know address schema details.

## Key elements

- **`fieldsOf(book)`** *(private)* — Flattens an `AddressBookDocument` into `EncryptedField[]`. For each entry and each name in `ADDRESS_PII_FIELDS`, emits `{ path, stored, binding, label }`, skipping fields that are `undefined`.
- **`reencryptAddressBooks(dryRun?)`** *(export)* — Public entry point. Delegates to `addressBookRepository.reencrypt({ ring, fieldsOf }, dryRun)`. `dryRun` (default `false`) limits the call to a count-only pass.

## Relationships

- **`src/infrastructure/security/pii-encryption.ts`** — Provides `getPiiEncryptionKeyRing()` (the current key ring) and `piiBinding()` (per-field AAD binding) consumed by both `fieldsOf` and the exported function.
- **`src/infrastructure/security/reencrypt.ts`** — Supplies the `EncryptedField` type that `fieldsOf` produces.
- **`src/modules/addresses/model.ts`** — Supplies the `AddressBookDocument` type that parameterises `fieldsOf`.
- **`src/modules/addresses/pii.ts`** — Supplies `ADDRESS_PII_FIELDS` (the list of encrypted field names) and `addressAad(field, id)` (builds the AAD string for the binding).
- **`src/modules/addresses/repository.ts`** — `addressBookRepository.reencrypt` is the actual read-rewrite-write executor that this file drives.

## Notes

- `entry._id!` is non-null-asserted inside the `addressAad` call; the code assumes every stored entry carries an `_id`. If a malformed document slips through, this throws at binding-construction time rather than at encryption time.
- The `path` string (`items.<index>.<field>`) is the *write-back* path the repository uses to splice re-encrypted values back into the document — keep it in sync with the shape in `model.ts`.
- `service.ts` appears in the graph as a neighbor but is **not** imported here; it likely calls `reencryptAddressBooks` indirectly through the ops script, not directly.
