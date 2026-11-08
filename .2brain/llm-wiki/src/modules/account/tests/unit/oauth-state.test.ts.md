---
source: src/modules/account/tests/unit/oauth-state.test.ts
sha256: 7bde7cfa9a3aaab5d77ec776917261f90ccb3ec7b0be77b3f36c7262804222a3
generated_at: 2026-11-08T04:48:13.750968+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/oauth-state.test.ts

## Purpose

Unit tests for the pure comparison and token-generation helpers in `oauth/state.ts`. Covers the OAuth CSRF state mint/compare logic, the PKCE verifier/challenge pair, and the two input-validation guards (`isSameOriginPath`, `isLocaleTag`). Cookie and HTTP plumbing is deliberately left to the integration/contract suites; this file exercises only the decision logic.

## Key elements

- **`generateOAuthState` (describe block)** — Verifies the output is a 32-char lowercase hex string (128 bits) and that successive calls never repeat.
- **`stateMatches` (describe block)** — Validates the CSRF state comparison: identical non-empty strings match; mismatches, `undefined` sides, empty-string pairs, and the Express repeated-param array shape are all rejected.
- **`generateCodeVerifier` (describe block)** — Confirms a 43-char base64url string (256 bits) with uniqueness across calls.
- **`codeChallengeOf` (describe block)** — Checks determinism, shape (43-char base64url), distinctness for different verifiers, and conformance to the RFC 7636 §B worked example.
- **`isSameOriginPath` (describe block)** — Accepts a single leading-slash path; rejects protocol-relative (`//`), backslash, tab-injected, absolute-URL, slash-less, and non-string (array, number, `undefined`) inputs.
- **`isLocaleTag` (describe block)** — Table-driven: accepts valid BCP-47 tags (`it`, `pt-BR`, `zh-Hant-TW`, `fil`); rejects empty strings, single letters, URLs, paths, HTML markup, CRLF injection, underscore forms, excessive subtags, arrays, and `undefined`.

## Relationships

- **`src/modules/account/oauth/state.ts`** — The sole import target. Every `it` block calls one of its six exported pure functions; the test file introduces no additional dependencies.

## Notes

- The module docstring explicitly scopes this file to *pure* functions. If a test here starts asserting on `req`/`res` or cookie setting, it belongs in the integration suite.
- Several cases encode Express-specific pitfalls (repeated query params arriving as arrays) rather than generic JS behavior; these guard against a real framework quirk, not a hypothetical one.
- The RFC 7636 example in `codeChallengeOf` is a fixed vector — if the hash algorithm or encoding changes, that assertion will fail and should be the first signal to investigate.
