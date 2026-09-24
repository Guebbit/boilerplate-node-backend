---
source: tests/unit/infrastructure/security/versioned-secret.test.ts
sha256: efee6b52172665facaee5418882c1396ba28ee31f65a9e91ee89c1d0e1d0578a
generated_at: 2026-09-23T20:26:40.167594+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/security/versioned-secret.test.ts

## Purpose

Unit tests for the versioned AES-256-GCM secret encryption module. Validates the core crypto contract—round-trip, IV freshness, tamper detection, version stamping, and key-rotation semantics—once at the infrastructure level, so that higher-level wrappers (TOTP, webhooks) can rely on it without re-testing the crypto itself.

## Key elements

- **`describe('encryptVersionedSecret / decryptVersionedSecret')`** — eight tests covering:
  - Round-trip correctness
  - Absence of plaintext in ciphertext
  - Ciphertext shape: exactly 4 colon-delimited fields (`version:iv:tag:data`), prefixed by the key version
  - Non-deterministic ciphertext (fresh IV) while decryption remains stable
  - `Unknown <context> key version: <v>` thrown on version mismatch
  - Auth-tag / data tamper detection (a single flipped hex digit causes a throw)
  - Key rotation: encryption always uses the **first** ring entry; decryption resolves by version so older rows still work
  - Dropped-key scenario: decrypting against a ring that no longer contains the version throws loudly
- **`describe('parseVersionedKeyRing')`** — three tests covering:
  - `undefined` input → `[]`
  - Bare unversioned string → `[{ version: 'v1', key: <value> }]` (backward-compat default)
  - Comma-separated `vN:key` pairs parsed into an array, **newest first**
- **`KEY` / `RING`** — module-level fixtures: a single `v1` key and its one-entry ring, reused across all encryption tests.

## Relationships

- **`src/infrastructure/security/versioned-secret.ts`** — the sole import target. Provides `encryptVersionedSecret`, `decryptVersionedSecret`, `parseVersionedKeyRing`, and the `VersionedKey` type. All assertions in this file exercise that module's public API; there are no other runtime dependencies.

## Notes

- The "ring" is a plain `VersionedKey[]` where **index 0 is the newest key** (used for encryption). Decryption scans the array to match the version stamp.
- The context word passed as the third argument to `decryptVersionedSecret` (e.g. `'test'`, `'widget'`) appears verbatim in the `Unknown … key version` error message—useful for log correlation but also means the same version-mismatch error reads differently per call-site.
- Tamper detection is verified by flipping a single hex character in the **data** segment; the test does not exercise tag-only or IV-only tampering.
- The file header comment states that `account/two-factor/totp.ts` and `webhooks/secrets.ts` each carry their own thin-wrapper round-trip tests; the crypto/ring/version logic is intentionally tested **only** here to avoid duplication.
