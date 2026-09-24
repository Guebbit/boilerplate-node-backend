---
source: src/modules/api-keys/credentials.ts
sha256: 504ab0cc960dd3b5f3c2b789f957e334b403cb4687a845dff50eaa431ea29c21
generated_at: 2026-09-23T18:24:02.388106+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/credentials.ts

## Purpose

Implements the one-way hashing half of the API-key credential lifecycle: minting a new high-entropy token, parsing the public prefix out of a presented token, and verifying a presented plaintext against a stored SHA-256 digest. Deliberately avoids bcrypt/argon2 because `randomBytes(32)` leaves no search space for a stretch function to exploit, so the per-request cost buys nothing.

## Key elements

- **`PREFIX_BYTES` / `PUBLIC_PREFIX_LENGTH`** – 6 random bytes → exactly 8 base64url characters. The fixed length is what makes position-based slicing in `parseApiKeyToken` reliable.
- **`SECRET_BYTES`** – 32 bytes (256 bits) of randomness for the secret half; matches the entropy budget of every other high-entropy token in the repo.
- **`MintedApiKey`** – Interface returned by `mintApiKey`: `plaintext` (shown once to the caller), `publicPrefix` (stored/indexed), `hash` (the only secret artifact persisted).
- **`mintApiKey()`** – Generates `sk_<prefix>_<secret>` in base64url, hashes the full plaintext with `hashToken`, and returns the three-part result.
- **`parseApiKeyToken(token)`** – Validates the `sk_` prefix, slices out the 8-char public prefix by position, and returns it (or `undefined`). This is the cheap first rejection before any DB lookup.
- **`verifyApiKey(plaintext, storedHash)`** – Hashes the presented plaintext and compares digests via `constantTimeEqual`; never compares plaintexts directly.
- **`displayIdOf(publicPrefix)`** – Returns the human-readable, non-secret identifier (`sk_<prefix>`) used in audit trails and key-list UIs.

## Relationships

- **`@modules/users` (`src/modules/users/index.ts` / `model.ts`)** – Provides `hashToken`, the shared SHA-256 helper also used by two-factor backup codes.
- **`@kernel/authentication` (`src/kernel/authentication.ts`)** – Supplies the `API_KEY_TOKEN_PREFIX` constant (`"sk_"`) used for minting, parsing, and display.
- **`@infrastructure/security/constant-time` (`src/infrastructure/security/constant-time.ts`)** – Provides `constantTimeEqual` to prevent timing side-channels in `verifyApiKey`.
- **`src/modules/api-keys/services/api-keys.ts`** – The service layer that calls `mintApiKey`, `parseApiKeyToken`, and `verifyApiKey` as part of CRUD and authentication flows.
- **`src/modules/api-keys/module.ts`** – Registers/routes the api-keys module; depends on the service which in turn depends on this file.
- **`src/modules/api-keys/tests/unit/credentials.test.ts`** – Unit tests exercising every export above.
- **`src/modules/api-keys/tests/integration/api-keys.test.ts`** – Integration tests that exercise the full mint → store → verify path through the service.

## Notes

- **Parsing is positional, not split-based.** Base64url's alphabet legally includes `_`, so `token.split('_')` would misalign the prefix. The 8-character prefix length is fixed by construction (6 bytes ÷ 6 bits/char, no padding), making `slice(prefixStart, prefixEnd)` exact.
- **The prefix is public by design.** It is stored, indexed, and displayed in the UI. Only the hash of the full plaintext is secret. The `_id` in the database is explicitly _not_ the identifier shown to operators.
- **Verification always hashes first**, then compares fixed-length digests. This means a length mismatch on the presented token is never observable to the caller, eliminating a trivial oracle.
- **`plaintext` is returned once** from `mintApiKey` and never persisted. Any code path that logs or stores the `MintedApiKey` object after the initial response must redact `plaintext`.
