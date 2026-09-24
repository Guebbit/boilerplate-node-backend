---
source: src/modules/addresses/pii.ts
sha256: 7491573b56dd5b0c07818ac6fc153acf884b686a130a3abf867ec2f87aa13d73
generated_at: 2026-09-23T18:20:50.390718+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/pii.ts

## Purpose

Single-purpose helper that decrypts the PII-bearing fields of one `AddressItem` (fullName, street, city, zip, country, phone). It exists so the read path in the repository has one centralized place to call `decryptPii` per field, rather than scattering the calls across multiple consumers.

## Key elements

- **`decryptAddressItem(item: AddressItem): AddressItem`** — The only export. Returns a _new_ object (spread) with the six PII fields replaced by their decrypted values. `phone` is handled conditionally: if `undefined` on the input it is simply omitted from the output (no decrypt call). All other subdocument fields pass through unchanged.

## Relationships

- **`src/infrastructure/security/pii-encryption.ts`** — Provides the `decryptPii` primitive that each field call delegates to. This file adds no encryption logic; it is the _read-side_ counterpart to the inline `encryptPii` calls made in the repository's write path.
- **`src/modules/addresses/model.ts`** — Supplies the `AddressItem` type used as both the input and return type of `decryptAddressItem`.
- **`src/modules/addresses/repository.ts`** — The sole caller. Every read of an address entry passes through the repository, which invokes `decryptAddressItem` once so downstream consumers (wire mapping, checkout snapshot) always see plaintext PII.

## Notes

- **No `encryptPii` counterpart lives here.** Encryption is called inline at each field assignment in `repository.ts`, mirroring the existing per-field `if`-check pattern of `updateEntry`. Adding an "encrypt address item" helper to this file would be a change in scope, not a fix.
- **Phone is optional.** The conditional spread (`item.phone === undefined ? {} : { phone: … }`) prevents a `decryptPii` call on `undefined`. When reading entries, callers must treat `phone` as possibly absent.
- **Non-mutating.** The function constructs a fresh object via spread; the original `AddressItem` is left untouched.
