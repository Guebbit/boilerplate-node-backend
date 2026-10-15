---
source: tests/unit/infrastructure/security/versioned-secret.test.ts
sha256: 7f870e125e8fd631dec24d37082f113d76a2809f300a43248f09ffffdd3e2414
generated_at: 2026-10-15T13:20:33.664999+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/security/versioned-secret.test.ts

## Purpose

Unit tests for the AES-256-GCM versioned-secret crypto layer (`src/infrastructure/security/versioned-secret.ts`). This file is the single source of truth for testing the encryption/decryption round-trip, key-ring lookup, version-mismatch rejection, AAD binding enforcement, and key rotation. Downstream consumers (e.g. TOTP, webhooks) test only their thin wrapper on top of this module.

## Key elements

- **`describe('encryptVersionedSecret / decryptVersionedSecret')`** — Covers round-trip fidelity, IV non-determinism, `version:iv:tag:data` colon-delimited ciphertext shape, unknown-version rejection, ciphertext tamper detection, truncated-auth-tag rejection, rotation (encrypt under newest ring entry, decrypt old rows by their stamped version), and loud failure when a key is dropped from the ring.
- **`describe('parseVersionedKeyRing')`** — Verifies env-var parsing: `undefined` → empty array, bare value → defaults to `v1`, comma-separated `vN:key` pairs → ordered array (newest first). Two additional tests here assert that decryption fails when the AAD or the `purpose` (HKDF label) differs from what was used at encrypt time.
- **`describe('versionOf / rewrapVersionedSecret')`** — Verifies `versionOf` reads the stamped prefix, `rewrapVersionedSecret` re-encrypts under the newest key while preserving plaintext and binding, is a byte-for-byte no-op when the value is already on the newest key, and refuses to rewrap a value whose binding doesn't match.
- **Shared fixtures** — `KEY` (v1 test key), `RING` (single-entry ring), `BIND` (`{ purpose: 'pii', aad: 'tests:field:1' }`).

## Relationships

- **`src/infrastructure/security/versioned-secret.ts`** — The module under test. All five exported functions (`encryptVersionedSecret`, `decryptVersionedSecret`, `parseVersionedKeyRing`, `rewrapVersionedSecret`, `versionOf`) and the two types (`SecretBinding`, `VersionedKey`) are imported and exercised here.

## Notes

- Two AAD/purpose binding tests live inside the `parseVersionedKeyRing` describe block rather than the main encrypt/decrypt block — they test `decryptVersionedSecret` behavior but are grouped there for proximity to binding setup.
- Ciphertext is a 4-part colon-delimited string (`version:iv:tag:data`); the tests split on `:` with a limit of 4 to handle base64 data that may itself contain colons.
- Ring order is **newest-first**; `encryptVersionedSecret` always uses `ring[0]`, and `decryptVersionedSecret` looks up the key by the stamped version prefix.
- The `purpose` field in `SecretBinding` feeds into an HKDF label, so the same AAD under a different purpose produces a different derived key and decryption fails.
