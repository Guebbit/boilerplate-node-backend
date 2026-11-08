---
source: tests/support/altcha.ts
sha256: d283b463bd2c3bfe6f3e6e52bd4a3bd71d65d8bb963ecb3adb81be2efde36c39
generated_at: 2026-11-08T09:51:08.323977+00:00
model: ollama:qwen3.8:27b
---

# tests/support/altcha.ts

## Purpose

Test helper that lets integration tests exercise ALTCHA human-check (anti-bot) flows. It enables the ALTCHA provider in the test environment and solves a challenge the same way a browser widget would—fetch, compute, return the header a guarded endpoint reads—so tests can call protected routes without a real browser.

## Key elements

- **`CHALLENGE_HEADER`** — constant `'antibot-challenge-token'`; the header name a guarded call carries its solved challenge in.
- **`useAltcha()`** — sets three environment variables (`NODE_ANTIBOT_PROVIDER`, `NODE_ANTIBOT_ALTCHA_SECRET`, `NODE_ANTIBOT_ALTCHA_COST`) so the app under test uses ALTCHA with a known secret and a low work-factor (500).
- **`solvedChallenge()`** — issues `GET /antibot/challenge` via the test `api()`, decodes the body with `bodyOf`, solves it with `altcha-lib` (`solveChallenge` + `deriveKey`), and returns `{ [CHALLENGE_HEADER]: base64JSON }` ready to spread into request headers.

## Relationships

- **`tests/support/http.ts`** — provides the `api()` transport used to fetch the challenge.
- **`tests/support/body-of.ts`** — provides `bodyOf` to decode the challenge response into the Zod-validated shape.
- **`tests/support/environment.ts`** — provides `setEnvironment` so `useAltcha` can flip the provider config for the current case.
- **`tests/integration/journeys/an-accounts-whole-security-life.test.ts`** — consumer; calls `useAltcha` / `solvedChallenge` to pass anti-bot checks on guarded account routes.
- **`tests/integration/stale-bearer-public-routes.test.ts`** — consumer; same pattern for routes that expose stale bearer tokens.

## Notes

- `useAltcha()` is designed for `beforeEach`; environment overrides reset per test case, so calling it once at the describe level is insufficient.
- Each call to `solvedChallenge()` yields a **one-use** solution—every guarded request in a test must call it separately.
- The signing secret is a hard-coded test string (`'journey-altcha-signing-secret'`); it is never the production secret.
- The solution payload is `btoa(JSON.stringify({ challenge, solution }))`—not just the raw solution string.
