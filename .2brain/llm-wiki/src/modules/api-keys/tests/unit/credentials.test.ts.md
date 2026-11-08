---
source: src/modules/api-keys/tests/unit/credentials.test.ts
sha256: 23bd702707233dc9672a3db7a95d80b115bf3f869fe33fd2939777f821f45ee7
generated_at: 2026-11-08T05:06:53.997955+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/unit/credentials.test.ts

## Purpose

Unit tests covering the mint/parse/verify half of the API-key credential lifecycle. Exists to lock in the token format (`sk_{publicPrefix}_{secret}`), the one-way hash contract, and edge-case behavior (underscores in prefix/secret, foreign tokens, tampered values) for the functions exported by `credentials.ts`.

## Key elements

- **`describe('mintApiKey')`** — asserts the `sk_` prefix, 8-char `publicPrefix`, uniqueness across calls, and round-trip compatibility with `verifyApiKey`.
- **`describe('parseApiKeyToken')`** — verifies prefix recovery from a real token, `undefined` return for too-short / foreign / non-matching tokens, and correct slicing when the prefix or secret legitimately contains `_` (position-based, not `split`-based).
- **`describe('verifyApiKey')`** — confirms rejection of a tampered plaintext and of a plaintext matched against an unrelated hash.
- **`describe('displayIdOf')`** — confirms the bare prefix is re-prefixed with `sk_` for human-facing display, with no secret component.

## Relationships

- **`src/modules/api-keys/credentials.ts`** — sole import target; provides `mintApiKey`, `parseApiKeyToken`, `verifyApiKey`, and `displayIdOf`. Every test in this file exercises one or more of those exports; no other module is touched.

## Notes

- Token format is fixed: `sk_` + 8-char base64url prefix + `_` + secret. The 8-char prefix is chosen from base64url, whose alphabet includes `_` and `-`; `parseApiKeyToken` therefore relies on position-based slicing rather than `split('_')` to avoid misparses.
- `parseApiKeyToken` returns `undefined` (not an empty object or throws) for any token that doesn't match the expected shape — callers must null-check.
- Tests are self-contained (no mocks, no network, no DB); `mintApiKey` is the only source of fixtures, so changing its output format will surface failures across all four describe blocks.
