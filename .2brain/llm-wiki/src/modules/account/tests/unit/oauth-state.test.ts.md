---
source: src/modules/account/tests/unit/oauth-state.test.ts
sha256: 83c08982cd2df1362e63f168734da2b76254ba1c9cd40e705fd215cfa8cf4fac
generated_at: 2026-09-27T14:36:38.898792+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/oauth-state.test.ts

## Purpose

Unit tests for the pure-function layer of the OAuth state module (`oauth/state.ts`). It verifies the CSRF state token, the PKCE code verifier / code challenge pair, and the `continue`-path guard. Cookie and HTTP plumbing is deliberately left to integration/contract suites; this file exercises only the comparisons and token shapes.

## Key elements

- **`generateOAuthState` (tests)** — Asserts the return value is a 32-char lowercase hex string (128 bits of entropy) and that two consecutive calls never produce the same value.
- **`stateMatches` (tests)** — Covers the happy path, mismatch, `undefined` on either side, an Express-style array (repeated query param), and the empty-string edge case (`''` vs `''` must be rejected).
- **`generateCodeVerifier` (tests)** — Asserts a 43-char base64url string (256 bits of entropy) and uniqueness across calls.
- **`codeChallengeOf` (tests)** — Verifies determinism, distinctness for different verifiers, and conformance to the RFC 7636 §B worked example.
- **`isSameOriginPath` (tests)** — Confirms acceptance of a single leading slash and rejection of protocol-relative (`//`), absolute URLs, slash-less paths, `undefined`, arrays, and non-string values.

## Relationships

- **`src/modules/account/oauth/state.ts`** — Sole import target. Every `describe` block exercises a named export from that module. No other files are imported or referenced.

## Notes

- No mocks or spies are used; the tests call the functions directly.
- The "repeated query param" guard (Express returns an array for `?state=a&state=a`) is tested in **both** `stateMatches` and `isSameOriginPath`, reflecting that Express's array-injection can hit either guard.
- The PKCE test includes a literal RFC 7636 Appendix B vector as a regression anchor; if the implementation changes hash algorithm, this line will fail intentionally.
