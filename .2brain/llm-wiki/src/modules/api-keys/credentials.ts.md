---
source: src/modules/api-keys/credentials.ts
sha256: 3ac3a812226bdaaaa24032c547016a7240e22eafcc1eb031e3bc0d532f9e6b38
generated_at: 2026-10-14T14:58:06.054443+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/credentials.ts

## Purpose

Mints and verifies API-key credentials using one-way SHA-256 hashing (`hashToken`). It deliberately avoids bcrypt/argon2 because the tokens are pure `randomBytes` output with no search space to make expensive, so the ~100 ms per-authenticated-request cost buys nothing. This is the "mint and verify" half of the credential lifecycle; storage and lifecycle management live in the services layer.

## Key elements

- **`PREFIX_BYTES` / `PUBLIC_PREFIX_LENGTH`** — 6 bytes of randomness → always exactly 8 base64url characters. The fixed length is what enables position-based slicing in `parseApiKeyToken`.
- **`SECRET_BYTES`** — 32 bytes (256 bits) for the secret half, matching every other high-entropy token in the repo.
- **`MintedApiKey`** (interface) — `{ plaintext, publicPrefix, hash }`. `plaintext` is shown to the caller exactly once; `hash` is what gets stored.
- **`mintApiKey()`** — Generates `sk_<prefix>_<secret>`, both halves base64url. Returns the plaintext, the public prefix (for indexing/display), and the SHA-256 hash.
- **`parseApiKeyToken(token)`** — Extracts the public prefix by slicing at a fixed offset. Returns `undefined` if the token is too short or lacks the expected `_` separator. This is the resolver's cheap pre-database rejection.
- **`verifyApiKey(plaintext, storedHash)`** — Hashes the presented plaintext and compares the two digests with `constantTimeEqual`.
- **`displayIdOf(publicPrefix)`** — Returns the audit/log-safe identifier (`sk_<prefix>`), never the database `_id`.

## Relationships

- **`@infrastructure/security/hash-token`** — Provides `hashToken` (SHA-256). Both `mintApiKey` and `verifyApiKey` depend on it.
- **`@infrastructure/security/constant-time`** — Provides `constantTimeEqual`, used by `verifyApiKey` to prevent timing oracles on the digest comparison.
- **`@kernel/authentication`** — Supplies the `API_KEY_TOKEN_PREFIX` constant (`sk_`), ensuring the prefix string is defined in exactly one place.
- **`services/resolver.ts`** — Calls `parseApiKeyToken` as the first, cheap rejection before any database lookup.
- **`services/api-keys.ts`** — Calls `mintApiKey` on creation and `verifyApiKey` on authentication.
- **`tests/unit/credentials.test.ts`** / **`tests/integration/api-keys.test.ts`** — Cover mint/parse/verify and the full credential flow.

## Notes

- **Do not split on `_`.** The base64url alphabet legally contains `_`, so either token half can include one. `parseApiKeyToken` slices by the fixed 8-character offset instead.
- The public prefix is **not secret** — it is stored, indexed, and shown in lists. A log or audit line showing `sk_a1b2c3d4…` leaks nothing.
- `verifyApiKey` compares **digests**, not plaintexts, so the comparison length is always fixed regardless of the presented token's length.
- The plaintext is displayed to the caller **exactly once** at mint time; only the hash is persisted. There is no "reveal" path.
