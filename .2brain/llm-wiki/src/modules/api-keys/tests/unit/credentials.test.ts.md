---
source: src/modules/api-keys/tests/unit/credentials.test.ts
source_sha256: 71e2450c31ca50d17b9b20d639b9214c5e753b5905a1c003d33b40c83febcfff
context_sha256: d2b3aa41c8c1769a655f3344c46004d1c1ee0624681baf89ada2017989ccd4bc
generated_at: 2026-11-22T04:25:46.428709+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/tests/unit/credentials.test.ts

## Purpose
Unit tests for the one-way hashing half of an API key's lifecycle: minting, parsing and verifying. They exercise the exports of `src/modules/api-keys/credentials.ts`.

## Key elements
- **`mintApiKey` tests**
  - The plaintext starts with `sk_`, and the public prefix is 8 characters long.
  - The plaintext has the form `sk_<publicPrefix>_...`, and the hash differs from the plaintext.
  - Each call yields a different secret and prefix.
  - The returned hash passes `verifyApiKey`.
  - `verifyApiKey('abc', ...)` accepts the NIST SHA-256 test vector `ba7816bf…15ad`, which confirms the hash is plain SHA-256 of the token.
- **`parseApiKeyToken` tests**
  - A minted token round-trips to `{ publicPrefix }`.
  - It returns `undefined` for a token too short to hold a prefix and separator (`sk_tooshort`).
  - It returns `undefined` when the byte after the 8-character prefix is not `_`.
  - It returns `undefined` for an unrelated bearer token, such as a JWT-like string.
  - Underscores inside the prefix or secret are handled: `sk_ab_cdefg_z9-_-...` parses to prefix `ab_cdefg`.
- **`verifyApiKey` tests**
  - A tampered plaintext (`${plaintext}x`) is rejected against the original hash.
  - The correct plaintext is rejected against an unrelated hash.
- **`displayIdOf` test**
  - `displayIdOf('a1b2c3d4')` returns `sk_a1b2c3d4`, which is the prefix with `sk_` reattached and no secret.

## Relationships
- Imports `mintApiKey`, `parseApiKeyToken`, `verifyApiKey` and `displayIdOf` from `@modules/api-keys/credentials`, which resolves to `src/modules/api-keys/credentials.ts`. That is the only module under test.

## Notes
- The tests use position-based slicing rather than `split('_')`, because base64url's alphabet includes `_`.
- `describe`, `it` and `expect` are used without imports, so they come from the test runner's globals.
- The tests are pure and synchronous. Nothing is mocked and there is no I/O.
