---
source: src/modules/api-keys/credentials.ts
sha256: 3ac3a812226bdaaaa24032c547016a7240e22eafcc1eb031e3bc0d532f9e6b38
generated_at: 2026-11-08T05:02:14.266120+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/credentials.ts

## Purpose

Mints and verifies machine-to-machine API-key credentials using one-way SHA-256 hashing (via `hashToken`). The plaintext is shown to the caller exactly once at creation; only the hash and the non-secret public prefix are persisted. It deliberately avoids bcrypt/argon2 because the 256-bit `randomBytes` secret has no search space for a KDF to make expensive.

## Key elements

- **`MintedApiKey`** (interface) — the return shape of a fresh credential: `plaintext`, `publicPrefix`, `hash`.
- **`mintApiKey()`** — generates `sk_<prefix>_<secret>` (both halves base64url), computes `hashToken(plaintext)`, and returns the `MintedApiKey` triple.
- **`parseApiKeyToken(token)`** — extracts the 8-char public prefix from a presented token by fixed-position slicing. Returns `undefined` if the token is too short, lacks the prefix, or the separator `_` is in the wrong position. Intended as a cheap first rejection before any DB lookup.
- **`verifyApiKey(plaintext, storedHash)`** — hashes the presented plaintext with `hashToken` and compares the two digests via `constantTimeEqual`.
- **`displayIdOf(publicPrefix)`** — builds the human/audit-safe identifier `sk_<prefix>` (never the DB `_id`).
- **`PREFIX_BYTES` / `PUBLIC_PREFIX_LENGTH`** — 6 random bytes → always-exactly-8 base64url characters, guaranteeing fixed position for slicing.
- **`SECRET_BYTES`** — 32 (256-bit) secret half, matching the repo-wide high-entropy token budget.

## Relationships

- **`@infrastructure/security/hash-token`** — provides `hashToken`; called by both `mintApiKey` (to store) and `verifyApiKey` (to compare).
- **`@infrastructure/security/constant-time`** — provides `constantTimeEqual`, the comparison primitive in `verifyApiKey`.
- **`@kernel/authentication`** — provides `API_KEY_TOKEN_PREFIX` (`"sk_"`), the constant prepended to every token and used by `parseApiKeyToken` and `displayIdOf`.
- **`services/api-keys.ts`** — consumes `mintApiKey`, `verifyApiKey`, and `displayIdOf` in its CRUD/verification flows.
- **`services/resolver.ts`** — calls `parseApiKeyToken` to extract the prefix and perform a single indexed lookup before verification.
- **Tests** — `tests/unit/credentials.test.ts` exercises all four exports; `tests/integration/api-keys.test.ts` exercises the full mint → present → resolve → verify path.

## Notes

- The 8-char prefix is **not** secret; it exists to turn verification into one indexed lookup and to give operators a recognisable identifier. It is safe to display in logs, list views, and audit fields.
- `parseApiKeyToken` slices by position rather than splitting on `_` because `_` is a valid base64url character and can appear inside either half of a real token.
- `verifyApiKey` compares **digests** in constant time, not the raw plaintexts, so a length mismatch in the presented token is never observable to an attacker.
- The plaintext is never stored or recoverable after the initial `MintedApiKey` response is returned.
