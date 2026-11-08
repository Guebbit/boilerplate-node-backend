---
source: tests/unit/infrastructure/security/versioned-secret.test.ts
sha256: 7723c3e61e4e9fb2337442f5fc23fa29dbdccf3dd67a50eaf34372589c5b5c3f
generated_at: 2026-11-08T10:25:11.590303+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/security/versioned-secret.test.ts

## Purpose

Single source of truth for the AES-256-GCM at-rest encryption contract in `versioned-secret.ts`. It verifies round-trip correctness, key-version stamping, tamper/auth-tag rejection, key-rotation semantics, key-ring parsing, and AAD/purpose binding enforcement. Downstream consumers (`account/two-factor/totp.ts`, `webhooks/secrets.ts`) only test their own thin wrappers and rely on this file for the underlying crypto behaviour.

## Key elements

- **`encryptVersionedSecret` / `decryptVersionedSecret` tests** – round-trip fidelity, no plaintext leakage into ciphertext, `version:iv:tag:data` format (4 colon-delimited segments), fresh-IV guarantee (same plaintext → different ciphertexts), unknown-version rejection, data-tamper and truncated-tag rejection.
- **Rotation tests** – encryption always targets the newest (first) ring entry; old rows decrypt against the entry they were written under; a key dropped from the ring causes a loud error rather than silent misread.
- **`parseVersionedKeyRing` tests** – `undefined` → empty ring; bare unversioned string defaults to `v1` (no env change needed for existing single-key deployments); explicit `v2:new,v1:old` string parsed newest-first.
- **`keyVersionOf` tests** – reads back the stamped version prefix from a ciphertext.
- **`rewrapVersionedSecret` tests** – moves a value onto the newest key, preserves plaintext and binding; idempotent (returns the identical string if already on the newest key); refuses a mismatched binding instead of silently re-encrypting.
- **Binding enforcement (AAD + purpose)** – a ciphertext is rejected when decrypted under a different `aad` or a different `purpose` (HKDF label), even with the correct key.
- **`SecretBinding` / `VersionedKey` types** – used as test fixtures (`BIND`, `KEY`, `RING`) to construct deterministic inputs.

## Relationships

- **`src/infrastructure/security/versioned-secret.ts`** – the sole production import. This test file exercises every exported function and type from that module: `encryptVersionedSecret`, `decryptVersionedSecret`, `parseVersionedKeyRing`, `rewrapVersionedSecret`, `keyVersionOf`, and the `SecretBinding` / `VersionedKey` types.

## Notes

- The test file deliberately avoids testing `totp.ts` or `webhooks/secrets.ts` wrapper logic; those modules own their own integration-level tests.
- Ciphertext wire format is fixed as `version:iv:tag:data` (exactly four colon-delimited parts); tests assert both the count and the `v1:` prefix.
- `parseVersionedKeyRing` silently defaults a bare env value to version `v1` — a backwards-compatibility shortcut, not a configurable option.
- `rewrapVersionedSecret` is byte-for-byte idempotent when the value is already on the newest key; this matters for callers that call rewrap unconditionally on read.
- Binding is two-dimensional: `purpose` feeds the HKDF key-derivation label, `aad` feeds the GCM authenticated-data slot. A mismatch on *either* dimension causes decryption to throw.
