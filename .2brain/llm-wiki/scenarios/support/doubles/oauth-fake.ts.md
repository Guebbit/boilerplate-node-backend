---
source: scenarios/support/doubles/oauth-fake.ts
source_sha256: c67dfe0c9b5f887d7d28fb918255157b3504487d007f7ad352d6d75225e46c25
context_sha256: f4fd42956993bc44713266c7a366d2cc65c72be7f3d15f74fa3d5eec23cd7952
generated_at: 2026-11-22T01:47:25.522813+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/support/doubles/oauth-fake.ts

## Purpose

A test double for an OAuth identity provider. It makes no network call and shows no consent screen: "Continue with Google"-style flows go straight back to the app's own callback route. It is registered into the OAuth registry only by the development doubles and by tests that need it, never by production code. The `state` still round-trips through the real cookie, so the CSRF check is genuinely exercised. PKCE is also checked for real.

## Key elements

- `FAKE_OAUTH_CODE` — the `'fake-oauth-code'` prefix that every fake `code` starts with. `exchangeCode` rejects any code that doesn't carry it.
- `FAKE_IDENTITY` (not exported) — the one fixed, verified identity every fake login resolves to:
  - `providerId` `fake-oauth-subject`
  - `email` `oauth.demo@example.com`
  - `emailVerified: true`
  - `name` `OAuth Demo`
  - no `imageUrl`
- `fakeOAuthProvider` — an `OAuthProvider` (the port) named `'fake'`:
  - `authorizeUrl(state, redirectUri, codeChallenge)` returns `${redirectUri}?code=fake-oauth-code.<challenge>&state=<encoded state>`. It redirects straight to the callback, carrying the PKCE challenge inside `code`.
  - `exchangeCode(callbackUrl, { codeVerifier })` splits `code` into the fixed part and the challenge. It rejects if the prefix is wrong or the challenge is missing. It also rejects if `codeChallengeOf(codeVerifier)` doesn't equal the challenge. Otherwise it resolves with `FAKE_IDENTITY`.

## Relationships

- Implements the `OAuthProvider` type from `src/modules/account/oauth/providers/port.ts`.
- Uses `codeChallengeOf` from `src/modules/account/oauth/state.ts` to re-derive the PKCE challenge at redemption.
- `scenarios/support/development-doubles.ts` is the development-doubles side. The module doc says the doubles register this provider via `./register`.
- The listed contract, integration and unit tests (`oauth.contract.test.ts`, `login-paths.contract.test.ts`, `auth-races.test.ts`, `login-restore.test.ts`, `session-modes.test.ts`, `config.contract.test.ts`, `social-login-with-a-second-factor.test.ts`, `oauth-providers.test.ts`) are graph neighbors. They are the tests that need this double.

## Notes

- A real provider stores the PKCE challenge server-side. This fake has no store, so the challenge travels inside `code` as `fake-oauth-code.<challenge>`. The callback controller treats `code` as opaque and only forwards it.
- The verifier check is deliberate, so a caller that sends the wrong verifier fails here instead of passing unnoticed.
- The `code` is split with `split('.', 2)`, which relies on the challenge being base64url and so containing no `.`.
- The identity is the same on every login, so tests can't distinguish users through this provider.
