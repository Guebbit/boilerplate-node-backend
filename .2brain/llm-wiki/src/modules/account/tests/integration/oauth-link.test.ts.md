---
source: src/modules/account/tests/integration/oauth-link.test.ts
sha256: 4142ee0b2323eaaee774d4d02901e054553b89f6ae6c5fe746760a7afe8c16dc
generated_at: 2026-11-08T04:38:43.715343+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/oauth-link.test.ts

## Purpose
Integration tests for the OAuth callback service (`loginOrCreateFromOAuth`) and the signed-in provider-link flow (`linkProviderToSignedInAccount`, `startOAuthLink`). Because these paths perform real database operations (identity lookup, `$push` link, user creation), the tests live here rather than in `tests/unit`. They cover the full decision tree: linked-identity login, email-match refusal, unverified-email refusal, signed-in connect, token expiry, and cross-identity misuse.

## Key elements

- **`identity(overrides?)`** – Factory returning a default `OAuthIdentity` (verified, `subject-1`); the shape `exchangeCode` hands to the service.
- **`oauthAccountsOf(userId)`** – Reads `oauthAccounts` via `userRepository.findByIdWithCredentials` because the schema marks the field `select: false`, so a plain `findById` never returns it.
- **`connecting(overrides?)`** – Creates a verified owner, calls `startOAuthLink`, and returns `{ user, token }` for link-flow tests.
- **`mockOutbox`** – Array capturing every `enqueueEmail` call; used to assert notification content (provider named, no URLs).
- **`jest.mock` blocks** – Replace (not spy) `auditPort.emitAuditEvent`, `analyticsPort.emitAnalyticsEvent`, `rehostRemoteImage`, and `enqueueEmail`. See `tests/support/ports.ts` for the "replace vs. spy" convention.
- **Test suites**
  - *case 1 (already-linked)* – Asserts the account resolves as `'login'`, nothing is created, and **no** audit/analytics event fires (that is the controller's job).
  - *case 2 (email match, unlinked)* – Asserts `OAuthAccountExistsError`, `OAuthEmailUnverifiedError`, and `OAuthAccountUnverifiedError`; verifies no link is saved and no audit emitted; checks the account is not promoted (verifiedAt stays null).
  - *signed-in connect* – Token lifetime (5 min, asserted as a literal), link saved regardless of provider email, notification mail content, single-use token (replay → `OAuthLinkExpiredError`), missing/unknown token, and cross-identity refusal.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/services/oauth.ts` | Primary module under test: imports `loginOrCreateFromOAuth`, `linkProviderToSignedInAccount`, `startOAuthLink`, `presentClaim`, `unlinkOAuthProvider`, and all `OAuth*Error` classes. |
| `src/modules/account/audit.ts` | Imports `accountAuditActions` to assert the `action` field in audit-event expectations. |
| `src/modules/account/analytics.ts` | Imports `accountAnalyticsEvents` (referenced for analytics assertions). |
| `src/modules/account/oauth/providers/port.ts` | Imports the `OAuthIdentity` type used by the `identity()` helper. |
| `src/modules/account/tests/factories.ts` | Imports `tokenRowsOf` to inspect the `oauth-link` token row in the DB. |
| `src/modules/users/tests/factories.ts` | Imports `createUser` and `userRepository` for account setup and assertions. |
| `src/modules/users/repository.ts` | Indirectly exercised through `userRepository` calls (link, count, findById). |
| `src/infrastructure/observability/audit.ts` | Replaced via `jest.mock` → `auditPortMock()` from `tests/support/ports.ts`. |
| `src/infrastructure/observability/analytics/index.ts` | Partially mocked: `emitAnalyticsEvent` stubbed; other exports kept. |
| `src/infrastructure/adapters/remote-image.ts` | Fully mocked; `rehostRemoteImage` resolves to `undefined`. |
| `tests/support/ports.ts` | Provides `observePort` (assertion helper) and `auditPortMock`. |
| `tests/support/callers.ts` | Provides `testCallerContext` passed as the service's caller argument. |
| `tests/support/setup-test-db.ts` | Called once via `setupTestDb()` before the suite; tears down real Mongo in-memory. |

## Notes

- **Audit/analytics are the controller's job.** The "case 1" test explicitly asserts *zero* audit or analytics calls; the service only resolves the account. Emitting here would hardcode `actorRole` and skip `authLoginTotal`.
- **Token is single-use.** After a successful link the token is spent; a second call with the same token throws `OAuthLinkExpiredError`.
- **5-minute lifetime is asserted as a literal** (`5 * 60 * 1000`) rather than importing the constant, so the test pins the consent-flow contract independently of a renamed constant.
- **NIST SP 800-63C-4 §3.8.1** is cited in comments: linking requires an authenticated session with the target account; an email match alone is insufficient.
- **`select: false` on `oauthAccounts`** means any test that needs to read linked providers must go through `findByIdWithCredentials`; a naive `findById` will return an empty array and mask a real link.
