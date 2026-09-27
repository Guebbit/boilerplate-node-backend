---
source: tests/unit/infrastructure/security/versioned-secret.test.ts
sha256: c767916dc6c1f3792b6061572bcd503d9ece4584e574ec72662574400875632a
generated_at: 2026-09-27T16:10:40.253903+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/security/versioned-secret.test.ts

## Purpose

Unit tests for the versioned AES-256-GCM at-rest encryption primitives. It verifies the encrypt/decrypt round-trip, ciphertext format, IV randomness, tamper detection, key-rotation semantics, and env-var parsing of the key ring in one place, so that higher-level modules (TOTP, webhooks) only need to test their own thin wrappers.

## Key elements

- **`describe('encryptVersionedSecret / decryptVersionedSecret')`** — the main block. Covers:
  - Round-trip correctness
  - Plaintext absence from ciphertext
  - Ciphertext shape: exactly 4 colon-delimited segments, prefixed with the key version (`v1:`)
  - Non-deterministic ciphertext per call (fresh IV) while both decrypt to the same plaintext
  - Unknown-version error (tagged with the caller-supplied context label, e.g. `"widget"`)
  - Auth-tag tamper detection (flipping a data byte)
  - Truncated auth-tag rejection
  - Rotation: new encryption uses the first (newest) ring entry; old ciphertexts still decrypt against their original entry
  - Dropped-key failure: decrypting against a ring that no longer contains the row's version throws
- **`describe('parseVersionedKeyRing')`** — env-var parsing:
  - `undefined` → `[]`
  - Bare unversioned string → `[{ version: 'v1', key: … }]` (backward compat)
  - Comma-separated `vN:key` pairs parsed newest-first
- **Constants** — `KEY` (a single `VersionedKey` with version `'v1'`) and `RING` (a one-element array) used across the encryption tests.

## Relationships

- **`src/infrastructure/security/versioned-secret.ts`** — the module under test. All four imports (`encryptVersionedSecret`, `decryptVersionedSecret`, `parseVersionedKeyRing`, `VersionedKey`) come from here. This test file is the sole owner of the crypto, ring-lookup, and version-mismatch assertions; sibling wrappers (TOTP, webhooks) delegate the actual crypto to this module and are not exercised here.

## Notes

- The 4th argument to `decryptVersionedSecret` (e.g. `'test'`, `'widget'`, `'TOTP'`) is a free-form context label that appears in the error message for unknown versions. Tests assert on it via regex, so renaming the label in a test will break the expectation.
- Key ring order is **newest first**; `parseVersionedKeyRing` preserves the input order, and `encryptVersionedSecret` always uses index 0.
- Test key material is intentionally weak (`'test-key-material'`); the file asserts format and logic, not key strength.
- The doc comment at the top of the file explicitly scopes the test: crypto, ring lookup, and version mismatch are tested *here*; callers test only their wrapper's round-trip.
