---
source: src/modules/api-keys/tests/unit/credentials.test.ts
sha256: 23bd702707233dc9672a3db7a95d80b115bf3f869fe33fd2939777f821f45ee7
generated_at: 2026-09-23T18:26:03.311084+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/unit/credentials.test.ts

## Purpose

Unit tests for the one-way hashing half of the API-key credential lifecycle: minting, parsing, verifying, and formatting. Each test exercises a single exported function from `credentials.ts` in isolation, covering both happy paths and rejection/edge cases.

## Key elements

- **`describe('mintApiKey')`** — verifies the `sk_` prefix, 8-character `publicPrefix`, that the hash differs from the plaintext, that successive calls yield distinct secrets/prefixes, and that the produced hash passes `verifyApiKey`.
- **`describe('parseApiKeyToken')`** — confirms round-trip recovery of the public prefix from a minted token; rejects tokens that are too short, missing the `_` separator after the 8th char, or are foreign (e.g. a JWT). Critically asserts that a token whose prefix or secret legitimately contains underscores is still parsed by position-based slicing, not `split('_')`.
- **`describe('verifyApiKey')`** — rejects a tampered plaintext against the correct hash and the correct plaintext against an unrelated hash.
- **`describe('displayIdOf')`** — asserts the `sk_` prefix is reattached to a bare public prefix for UI display.

## Relationships

- **`src/modules/api-keys/credentials.ts`** (imported) — the sole production dependency; provides `mintApiKey`, `parseApiKeyToken`, `verifyApiKey`, and `displayIdOf`. All four are exercised directly; no other module is imported.

## Notes

- Tests are self-contained: `mintApiKey()` is called inside each test to generate fixtures, so there is no shared state or setup/teardown.
- The underscore-in-token test (`sk_ab_cdefg_z9-_-secret-with-underscores_and-dashes`) documents an intentional design choice: the parser uses fixed-position slicing rather than `split('_')`, because base64url includes `_` in its alphabet. This is the most subtle behavioral contract in the file.
- The import path uses the `@modules/` alias, consistent with the project's tsconfig path mapping.
