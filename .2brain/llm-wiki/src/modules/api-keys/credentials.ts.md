---
source: src/modules/api-keys/credentials.ts
source_sha256: f97fe52e0e5628763dff336e41ff614edf1d9779ed6eeec91c8a97c5da19d126
context_sha256: 26ec50d39e32c5be93967cdcee1c488a6ab3de1cc59893cafe95bdde0f48fcd9
generated_at: 2026-11-22T04:21:09.221185+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/credentials.ts

## Purpose
Handles the one-way hashing half of an API key's lifecycle: minting new credentials and verifying presented ones. Keys are stored as a sha256 hash (via `hashToken`), not encrypted, because a credential is only ever verified, never re-signed with. The tokens are high-entropy (`randomBytes`), so slow hashes like bcrypt/argon2 would add per-request cost without any security benefit.

## Key elements
- `mintApiKey()` returns a `MintedApiKey` (`{ plaintext, publicPrefix, hash }`). The plaintext has the form `sk_<prefix>_<secret>`, with both halves base64url. The prefix is 6 random bytes and the secret is 32 random bytes. The plaintext is meant to be shown to the caller once. The prefix and hash are what get stored.
- `parseApiKeyToken(token)` returns `{ publicPrefix }`, or `undefined` if the token isn't one of ours. It checks the `sk_` prefix, then that a `_` follows the fixed-length prefix. It does this before any database lookup or hashing.
- `verifyApiKey(plaintext, storedHash)` hashes the presented plaintext and compares the digest to the stored hash in constant time.
- `displayIdOf(publicPrefix)` returns `sk_<prefix>`. This display-safe identifier is used for things like the audit trail's `actorCredentialId`, in place of the database `_id`.
- `MintedApiKey` is the exported interface for a freshly minted key.
- `PREFIX_BYTES`, `PUBLIC_PREFIX_LENGTH` and `SECRET_BYTES` are private constants.

## Relationships
- `src/infrastructure/security/hash-token.ts` supplies `hashToken`, used when minting and when verifying.
- `src/infrastructure/security/constant-time.ts` supplies `constantTimeEqual`, used in `verifyApiKey`.
- `src/kernel/authentication.ts` supplies `API_KEY_TOKEN_PREFIX` (the `sk_` prefix), used in minting, parsing and display IDs.
- `src/modules/api-keys/services/api-keys.ts` and `src/modules/api-keys/services/resolver.ts` are the neighboring service files in the same module. The resolver relates to the "credential-resolve path" that `parseApiKeyToken` serves as a first, cheap rejection.
- `src/modules/api-keys/tests/unit/credentials.test.ts` and `src/modules/api-keys/tests/integration/api-keys.test.ts` are the tests that cover this module.

## Notes
- The prefix is parsed by position, not by `split('_')`. The base64url alphabet includes `_`, so either half of a real token may contain one. This works because 6 bytes always encode to exactly 8 base64url characters, so `PUBLIC_PREFIX_LENGTH` is fixed (8). Changing `PREFIX_BYTES` means updating `PUBLIC_PREFIX_LENGTH` too.
- The public prefix is not secret. It is stored and indexed so verification is one indexed lookup instead of a collection scan.
- `verifyApiKey` compares digests, not plaintexts. Every comparison is therefore the same fixed length, whatever the length of the presented token.
- The file's own doc comment cites the same hashing approach as already used by the account module's token service (`src/modules/account/services/tokens.ts`).
