---
source: tests/unit/scenarios/oauth-providers.test.ts
sha256: 59e0d143e73cf24522b03c78ce0caff4ebeb24a550129c101f21ef8dd71ed00f
generated_at: 2026-11-08T10:30:02.697688+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/oauth-providers.test.ts

## Purpose

Verifies the OAuth provider **registry** (which providers appear based on environment credentials or explicit registration) and the **fake OAuth provider** double used in dev/scenario flows. It answers "which providers show up at all" rather than token-exchange parsing, which is covered by the per-provider test files.

## Key elements

- **`describe('the OAuth provider registry')`** — Five tests asserting that `enabledProviders()` and `resolveOAuthProvider()` reflect env-var credentials for Google/GitHub, that an explicitly registered `fake` provider appears without credentials, and that unknown names resolve to `undefined` rather than throwing.
- **`describe('fakeOAuthProvider')`** — Four tests exercising `fakeOAuthProvider.authorizeUrl` and `.exchangeCode`: correct URL construction, a full PKCE round-trip yielding a verified identity, rejection of an unrecognised code, and rejection of a verifier that does not hash to the supplied challenge.
- **`callbackWith(code)`** — Local helper that builds the callback `URL` the controller hands to a provider (fixed origin, `code` + `state` query params).
- **`OAUTH_ENV_KEYS`** — Tuples the four `NODE_OAUTH_*` env vars; passed to `withoutEnvironmentInThisFile` so each test starts with a clean slate.

## Relationships

- **`src/modules/account/oauth/providers/index.ts`** — Source of `enabledProviders`, `resolveOAuthProvider`, `registerOAuthProvider`. This file is the primary subject under test.
- **`scenarios/support/doubles/oauth-fake.ts`** — Supplies `fakeOAuthProvider` and `FAKE_OAUTH_CODE`. The second `describe` block validates the double's contract.
- **`src/modules/account/oauth/state.ts`** — Supplies `generateCodeVerifier` and `codeChallengeOf`, used to set up and verify PKCE in the fake-provider tests.
- **`tests/support/environment.ts`** — Supplies `setEnvironment` (to simulate credentials) and `withoutEnvironmentInThisFile` (to guarantee isolation between tests).

## Notes

- The `fake` provider is **never** seeded in production; only the dev preload calls `registerOAuthProvider('fake', …)`. This test reproduces that call directly to verify registry mechanics.
- Each registry test sets only the env vars it needs; `withoutEnvironmentInThisFile` restores all four to `undefined` after every test, preventing cross-test leakage.
- The fake provider's `exchangeCode` rejects with `/unrecognised code/` for any code that isn't `FAKE_OAUTH_CODE`-derived, and with `/PKCE verifier/` when the verifier doesn't hash to the challenge—no network call is ever made.
