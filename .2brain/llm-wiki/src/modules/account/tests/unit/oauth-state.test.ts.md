---
source: src/modules/account/tests/unit/oauth-state.test.ts
sha256: 372009ace30d397879697c76d9d50fc9ee219eb6e19b4f1fd4ce87cb2f0fd118
generated_at: 2026-09-23T18:16:21.409899+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/oauth-state.test.ts

## Purpose

Unit tests for the pure functions in `oauth/state.ts` that implement the OAuth 2.0 CSRF state parameter and the PKCE (RFC 7636) code-verifier / code-challenge handshake. Cookie plumbing is deliberately excluded here (covered by integration/contract suites); this file verifies the comparison logic, token shape, entropy, and determinism in isolation.

## Key elements

- **`describe('generateOAuthState')`** — Asserts the output is a 32-char lowercase hex string (128 bits) and that successive calls never collide.
- **`describe('stateMatches')`** — Verifies the CSRF comparison helper: accepts identical non-empty strings, rejects mismatches, `undefined` on either side, Express array values (repeated query param), and the empty-string vs empty-string edge case.
- **`describe('generateCodeVerifier')`** — Asserts the PKCE verifier is a 43-char base64url string (256 bits) and unique per call.
- **`describe('codeChallengeOf')`** — Confirms S256 hashing is deterministic for a given verifier, differs across verifiers, and matches the canonical worked example from RFC 7636 Appendix B.

## Relationships

- **`src/modules/account/oauth/state.ts`** (tested module) — Imports and exercises all four exported functions: `generateOAuthState`, `stateMatches`, `generateCodeVerifier`, `codeChallengeOf`. No other imports or side effects.

## Notes

- The `stateMatches` test for the array case (`['abc123']`) documents a real Express behavior: when the same query/cookie key appears twice, Express returns an array. The comparison must treat that as a mismatch rather than a coincidental string match.
- The RFC 7636 conformance test hard-codes the spec's exact input/output pair; if the implementation's hash changes (e.g., switching from SHA-256 to a different algorithm), this test will fail and must be updated intentionally.
- The file is annotated `@module` (not a named export) — it is a side-effect-only test file, consistent with Jest/Vitest conventions.
