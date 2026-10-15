---
source: src/modules/account/tests/contract/oauth.contract.test.ts
sha256: 586e6ef90adf9a7c654c503d480b5807efa849a4043b2951f44ca8137b997abb
generated_at: 2026-10-15T10:09:38.501637+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/oauth.contract.test.ts

## Purpose

Contract tests for the public OAuth surface: the provider-list endpoint, the start (redirect) step, and the full callback round trip. Exercises the real routes, real CSRF/PKCE cookies, and a real database using a `fake` provider registered the same way the dev preload does, so the suite catches regressions in the exact path a browser would walk.

## Key elements

- **`unverifiedOAuthProvider`** — a wrapper around `fakeOAuthProvider` that flips `emailVerified` to `false` in the exchanged identity; registered as `'fake-unverified'`.
- **`beforeAll`** — registers both `'fake'` and `'fake-unverified'` via `registerOAuthProvider`; production seeds no fake entry, so the suite must create its own.
- **`attemptCookies(start)`** — helper that packs the `oauth_state` and `oauth_verifier` cookies from a start response into a single `Cookie` header for callback requests.
- **`describe('GET /account/oauth/providers')`** — asserts the fake provider appears in the list once registered.
- **`describe('GET /account/oauth/:provider')`** — covers 404 for unknown providers, 302 redirect to callback, cookie attributes (Max-Age=300, HttpOnly, SameSite=Lax), `continue`/`locale` cookie persistence, and rejection of open-redirect or non-tag `locale` values.
- **`describe('GET /account/oauth/:provider/callback')`** — covers 404, 400 on missing/mismatched state or missing PKCE verifier, full round-trip (user creation, session cookies, `device` cookie, terms recording), cookie cleanup, unverified-email → `email_unverified` redirect, banned/soft-deleted → `provider_error`, and `continue`/`locale` passthrough + clearing on both success and failure redirects.

## Relationships

- **`scenarios/support/doubles/oauth-fake.ts`** — supplies `fakeOAuthProvider`, the concrete double whose `exchangeCode` the tests call (directly or via `unverifiedOAuthProvider`).
- **`src/modules/account/oauth/providers/index.ts`** — exports `registerOAuthProvider`, the same registry the app uses; the test calls it to seed the fake entries.
- **`src/modules/account/tests/contract/support.ts`** — exports `claimedAmr` (used in the truncated portion of the suite for AMR-related assertions).
- **`src/modules/users/repository.ts`** — `userRepository` is queried after a round trip to assert the created user's `verifiedAt`, `termsAcceptedAt`, `termsVersion`; also `linkOAuthAccount` for pre-seeded banned/deleted cases.
- **`src/modules/users/tests/factories.ts`** — `createUser` factory builds user records for the banned/soft-deleted and linked-account scenarios.
- **`tests/support/contract.ts`** — imported as a side-effect; sets up shared contract-test conventions (e.g., response-shape assertions).
- **`tests/support/cookies.ts`** — `setCookie` / `cookieHeader` parse and re-emit cookie headers from responses.
- **`tests/support/http.ts`** — `api()` provides the HTTP client; `bearerForCookie` is imported for token-exchange scenarios in the truncated section.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` configures a per-suite database.
- **`tests/support/totp.ts`** — `codeFor` is imported for TOTP-related assertions in the truncated portion.

## Notes

- The fake provider is **not** in production seeds; any test that needs it must call `registerOAuthProvider` itself (done in `beforeAll`). Omitting that call silently changes which providers the list endpoint returns.
- Both `oauth_state` **and** `oauth_verifier` cookies must be present at callback time. The suite explicitly tests that a missing verifier yields 400 *before* any token exchange, guarding against a regression that skips PKCE.
- On state-mismatch or missing-verifier failures the state cookie is **cleared** (`oauth_state=`), preventing replay of the same state.
- `continue` is validated as same-origin: protocol-relative (`//evil`), absolute URLs, and paths lacking a leading slash are all rejected. `locale` must parse as a valid tag; URLs are dropped.
- Session cookies set by a completed OAuth login are browser-session (no `Max-Age`/`Expires`), matching the password-login path.
- Banned and soft-deleted accounts both map to the same generic `provider_error` redirect so the caller learns nothing about account state.
