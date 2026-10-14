---
source: src/modules/account/tests/unit/oauth-state.test.ts
sha256: 7bde7cfa9a3aaab5d77ec776917261f90ccb3ec7b0be77b3f36c7262804222a3
generated_at: 2026-10-14T09:21:53.496013+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/oauth-state.test.ts

## Purpose

Unit tests for the pure-function OAuth security helpers in `oauth/state.ts`. Covers the CSRF state comparison, PKCE verifier/challenge generation, the `continue` redirect-path guard, and locale-tag validation. Cookie/session plumbing is intentionally excluded here (covered by integration/contract suites); this file isolates the comparison logic and token-shape guarantees.

## Key elements

- **`describe('generateOAuthState')`** — Asserts output is a 32-char lowercase-hex string (128 bits) and that successive calls differ.
- **`describe('stateMatches')`** — Verifies the CSRF state comparison: equal non-empty strings pass; mismatches, `undefined`, empty strings, and Express array values (repeated query params) are all rejected.
- **`describe('generateCodeVerifier')`** — Asserts a 43-char base64url string (256 bits) and uniqueness across calls.
- **`describe('codeChallengeOf')`** — Confirms determinism (same verifier → same challenge), uniqueness for different verifiers, and correctness against the RFC 7636 §B worked example.
- **`describe('isSameOriginPath')`** — Guards the `continue` redirect parameter: accepts a single leading slash; rejects protocol-relative URLs, backslash/whitespace tricks, absolute URLs, missing leading slash, and non-string inputs (arrays, numbers, `undefined`).
- **`describe('isLocaleTag')`** — Table-driven tests for locale-tag validation: accepts BCP-47 forms (`it`, `pt-BR`, `zh-Hant-TW`); rejects empty strings, single letters, URLs, paths, markup, CRLF injection, underscore form, excessive subtags, arrays, and `undefined`.

## Relationships

- **`src/modules/account/oauth/state.ts`** — The sole import target. All six functions under test (`generateOAuthState`, `stateMatches`, `generateCodeVerifier`, `codeChallengeOf`, `isSameOriginPath`, `isLocaleTag`) are imported directly from this module. This test file is the only unit-level consumer; integration/contract suites cover the surrounding cookie and request plumbing.

## Notes

- The Express "repeated query param → array" edge case is tested in *both* `stateMatches` and `isSameOriginPath` because Express decodes `?state=a&state=b` into an array before either function sees it.
- `isSameOriginPath` treats backslash and tab as path-separator equivalents (browsers normalise `/\` and `/\t` to `//`), so both are explicitly rejected.
- The PKCE challenge test hard-codes the RFC 7636 appendix-B vector (`dBjftJeZ…` → `E9Melhoa…`) as a regression anchor for the SHA-256 + base64url pipeline.
- All tested functions are pure; there is no mocking, fixture setup, or async/await in this file.
