---
source: src/modules/api-keys/tests/unit/credentials.test.ts
sha256: 77e5b800efbdfb60571fbc3002fcd187063b28c7a6171503dd68f50c529d2719
generated_at: 2026-11-14T19:23:39.556482+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/unit/credentials.test.ts

## Purpose

Unit tests for the four credential functions exported from `credentials.ts` (`mintApiKey`, `parseApiKeyToken`, `verifyApiKey`, `displayIdOf`). Covers the one-way hashing half of the API-key lifecycle: generating a key, extracting its public prefix, verifying a token against its SHA-256 hash, and formatting a display identifier.

## Key elements

- **`describe('mintApiKey')`** — Verifies the returned `{ plaintext, publicPrefix, hash }` shape: `sk_` prefix, 8-char public prefix, hash ≠ plaintext, uniqueness across calls, round-trip with `verifyApiKey`, and an explicit NIST FIPS 180-2 SHA-256("abc") vector.
- **`describe('parseApiKeyToken')`** — Checks prefix recovery from a real token; returns `undefined` for tokens that are too short, have a non-`_` byte after the 8-char prefix, or are unrelated (e.g. a JWT). Confirms that underscores *within* the prefix/secret are handled via position-based slicing rather than `split('_')`.
- **`describe('verifyApiKey')`** — Negative cases: tampered plaintext and mismatched hash both return `false`.
- **`describe('displayIdOf')`** — Confirms the `sk_` prefix is reattached to an 8-char ID for display.

## Relationships

- **`src/modules/api-keys/credentials.ts`** — Sole dependency. All four functions under test (`mintApiKey`, `parseApiKeyToken`, `verifyApiKey`, `displayIdOf`) are imported from this module. No other files are imported or referenced.

## Notes

- The token grammar is `sk_` + **8 base64url chars** + `_` + secret. Because base64url's alphabet itself contains `_` and `-`, the parser must slice by fixed position (index 3 + 8) rather than splitting on underscores; one test explicitly guards against `split('_')` regressions.
- The SHA-256 digest is asserted against a NIST FIPS 180-2 vector (see `docs/modules/api-keys.md` for the full table).
- `verifyApiKey` is a pure plaintext-vs-hash comparison; there is no salt, IV, or HMAC involved in these tests.
