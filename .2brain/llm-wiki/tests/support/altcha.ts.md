---
source: tests/support/altcha.ts
sha256: d283b463bd2c3bfe6f3e6e52bd4a3bd71d65d8bb963ecb3adb81be2efde36c39
generated_at: 2026-10-29T07:05:55.082979+00:00
model: ollama:qwen3.8:27b
---

# tests/support/altcha.ts

## Purpose

Test helper that enables the ALTCHA anti-bot provider and solves challenges the way a real browser widget would—fetch a challenge, compute the proof, and return the header a guarded API call expects. Exists so integration tests can exercise protected endpoints without a real browser.

## Key elements

- **`useAltcha()`** — Sets three environment variables (`NODE_ANTIBOT_PROVIDER`, `NODE_ANTIBOT_ALTCHA_SECRET`, `NODE_ANTIBOT_ALTCHA_COST`) to activate the ALTCHA provider with a known secret and a low work cost (500). Intended for `beforeEach` because environment overrides reset per test case.
- **`solvedChallenge()`** — Fetches a fresh challenge via `GET /antibot/challenge`, solves it with `altcha-lib`'s `solveChallenge` + PBKDF2 `deriveKey`, and returns a header object: `{ 'antibot-challenge-token': btoa(JSON.stringify({ challenge, solution })) }`.
- **`CHALLENGE_HEADER`** — Constant (`'antibot-challenge-token'`) naming the header consumed by guarded calls.

## Relationships

- **`tests/support/http.ts`** — Provides the `api()` client used to request the challenge.
- **`tests/support/body-of.ts`** — Provides `bodyOf()` to extract and type-narrow the challenge response body.
- **`tests/support/environment.ts`** — Provides `setEnvironment()` to inject the provider/secret/cost overrides for the current test case.
- **`tests/integration/journeys/an-accounts-whole-security-life.test.ts`** — Consumes `useAltcha` and `solvedChallenge` to drive guarded calls in the security-life journey.
- **`scripts/contracts/shared-rules-render.ts`** — Source of the generated `@api/schemas.zod` module that supplies `GetAntibotChallenge200Response`.

## Notes

- A solved challenge is **single-use**; call `solvedChallenge()` once per guarded request rather than reusing the result.
- The signing secret is hardcoded to a test-only value (`'journey-altcha-signing-secret'`); do not reuse it in non-test contexts.
- The returned header value is base64-encoded JSON, not a raw token string—do not parse or re-encode it manually.
