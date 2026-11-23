---
source: src/modules/account/tests/unit/oauth-state.test.ts
source_sha256: 7bde7cfa9a3aaab5d77ec776917261f90ccb3ec7b0be77b3f36c7262804222a3
context_sha256: 1ade783eda3380f5905fe638421ba9b14f15af91dcfbe01f9abc221497549d50
generated_at: 2026-11-22T04:07:07.328631+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/oauth-state.test.ts

## Purpose
Unit tests for the pure helper functions in `src/modules/account/oauth/state.ts`: the OAuth CSRF `state` token, the PKCE verifier/challenge pair, and the guards for the `continue` path and locale tag. Cookie handling is deliberately not covered here; the module header says the integration/contract suites exercise it end to end.

## Key elements
- **`generateOAuthState`**: expects a 32-character lowercase hex string (128 bits), different on each call.
- **`stateMatches`**: true only for an identical, non-empty string pair. It rejects mismatches, a missing side, two empty strings, and an array on one side (Express returns an array for a repeated query param).
- **`generateCodeVerifier`**: expects a 43-character base64url string (256 bits), different on each call.
- **`codeChallengeOf`**: deterministic and 43 characters of base64url. Different verifiers give different challenges. It reproduces the RFC 7636 Appendix B worked example (`dBjf…jXk` → `E9Me…s-cM`).
- **`isSameOriginPath`**: accepts a path with a single leading slash, such as `/checkout`. It rejects:
  - protocol-relative `//host` paths
  - a backslash, or a tab, after the leading slash (`/\host`, `/\t/host`)
  - absolute URLs
  - paths with no leading slash
  - non-strings, including arrays, `undefined` and numbers
- **`isLocaleTag`**: accepts `it`, `en`, `pt-BR`, `zh-Hant-TW` and `fil`. It rejects:
  - an empty string or a single letter
  - URLs and paths
  - markup
  - CRLF header injection
  - underscore forms like `pt_BR`
  - too many subtags
  - arrays and `undefined`

  The rejections use `it.each`.

## Relationships
Imports `generateOAuthState`, `stateMatches`, `generateCodeVerifier`, `codeChallengeOf`, `isSameOriginPath` and `isLocaleTag` from `src/modules/account/oauth/state.ts` (via `../../oauth/state`) and tests them directly. No mocks or other dependencies.

## Notes
- Several cases are security regressions: open-redirect vectors, header injection, and the array-valued query param trap. The `isSameOriginPath` array test notes that it is the same trap `stateMatches` guards against.
- Entropy is checked only through output format and non-repetition across two calls, not statistically.
