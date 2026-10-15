---
source: tests/unit/scenarios/oauth-providers.test.ts
sha256: 59e0d143e73cf24522b03c78ce0caff4ebeb24a550129c101f21ef8dd71ed00f
generated_at: 2026-10-15T13:24:32.018133+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/oauth-providers.test.ts

## Purpose

Unit tests for the OAuth provider registry — verifying *which providers are visible* based on environment credentials and explicit registration, and exercising the `fake` OAuth provider double through a full PKCE round-trip. It intentionally covers only registry visibility, not per-provider token-exchange parsing (those live in per-provider files).

## Key elements

- **`OAUTH_ENV_KEYS`** — tuple of the four `NODE_OAUTH_*` env vars; passed to `withoutEnvironmentInThisFile` so each test starts/ends with a clean slate.
- **`callbackWith(code)`** — builds a `URL` for the standard `/callback?code=…&state=the-state` shape that `exchangeCode` expects.
- **`describe('the OAuth provider registry')`** — five tests around `enabledProviders()`, `resolveOAuthProvider()`, and `registerOAuthProvider()` (empty state, google gated on both id+secret, github independent, fake via manual registration, unknown name → `undefined`).
- **`describe('fakeOAuthProvider')`** — four tests covering `authorizeUrl` (returns the callback URL directly with code/challenge/state) and `exchangeCode` (happy path with a valid PKCE verifier, rejection of an unrecognised code, rejection of a mismatched verifier).

## Relationships

- **`src/modules/account/oauth/providers/index.ts`** — module under test; the file imports `enabledProviders`, `resolveOAuthProvider`, `registerOAuthProvider`.
- **`scenarios/support/doubles/oauth-fake.ts`** — supplies `fakeOAuthProvider` and `FAKE_OAUTH_CODE`; the second `describe` block exercises its `authorizeUrl` and `exchangeCode` methods.
- **`src/modules/account/oauth/state.ts`** — source of `generateCodeVerifier` and `codeChallengeOf`, used to construct realistic PKCE pairs for the round-trip tests.
- **`tests/support/environment.ts`** — provides `setEnvironment` (to simulate provider credentials) and `withoutEnvironmentInThisFile` (to snapshot/restore the env keys around the whole file).

## Notes

- The `fake` provider is **not** registered in production code; the test calls `registerOAuthProvider('fake', …)` manually to reproduce what the dev preload does. This is the only registration that happens here.
- `fakeOAuthProvider.authorizeUrl` does not redirect to an external site — it returns the *callback* URL itself, so the "authorise" step is a no-op redirect to the same origin.
- PKCE rejection tests confirm two distinct failure modes: wrong code (`/unrecognised code/`) and wrong verifier (`/PKCE verifier/`).
- The file header explicitly scopes itself to "which providers show up at all," drawing a parallel to `payments/tests/unit/providers.test.ts`.
