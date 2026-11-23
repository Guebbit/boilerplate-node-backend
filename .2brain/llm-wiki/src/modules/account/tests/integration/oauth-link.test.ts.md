---
source: src/modules/account/tests/integration/oauth-link.test.ts
source_sha256: b3aa7514770c1bf1aeb2178677ea1609ef83e3aa20f3bd5cbbad90fdfa192052
context_sha256: c3b5f7e3a31707f650528d5f9a9d3770bd34c811edb664005575c4813d8f720d
generated_at: 2026-11-22T03:57:33.624315+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/oauth-link.test.ts

## Purpose
Integration tests, run against the real test database, for the OAuth find-or-create logic in `src/modules/account/services/oauth.ts`. They cover `loginOrCreateFromOAuth`'s branches and the signed-in "connect a provider" flow, which is the only way a provider gets linked. The file sits in `tests/integration` rather than `tests/unit` because it touches the database (identity lookup, linking `$push`, user creation).

## Key elements
- **Module mocks**
  - The audit port is replaced with `auditPortMock()` from `@tests/ports`.
  - `emitAnalyticsEvent` is a `jest.fn()`, and the rest of the analytics module stays real.
  - `rehostRemoteImage` resolves `undefined`, so no download happens.
  - `enqueueEmail` is replaced by a stub that pushes `{ to, template, data }` into `mockOutbox`.
- **`mockOutbox`**: collects queued mails. It is cleared in `beforeEach`, and `afterEach` calls `jest.clearAllMocks()`.
- **`identity(overrides)`**: builds an `OAuthIdentity` that is verified by default (`providerId: 'subject-1'`, `oauth-user@example.com`).
- **`oauthAccountsOf(userId)`**: re-reads `oauthAccounts` through `userRepository.findByIdWithCredentials`, because the field is `select: false`.
- **`connecting(overrides)`**: creates a verified user and starts a link attempt with `startOAuthLink`. It returns `{ user, token }`.
- **Case 1 (already-linked identity)**: resolves the existing account with `outcome: 'login'`. It creates no user and emits no audit or analytics event.
- **Case 2 (verified email matches an existing account)**: refuses to link and leaves the account unchanged. The errors are:
  - `OAuthAccountExistsError` for a normal account, and also for a 2FA account.
  - `OAuthEmailUnverifiedError` when the provider doesn't vouch for the email.
  - `OAuthAccountUnverifiedError` for an account that never proved its address. Its `verifiedAt` stays null.
- **Connecting from a signed-in session**
  - The link attempt token lives exactly 5 minutes (checked on the `oauth-link` token row via `tokenRowsOf`).
  - `linkProviderToSignedInAccount` links to the account that started the attempt, whatever email the provider holds. It emits an `AUTH_OAUTH_LINKED` audit event.
  - A mail with template `account.sign-in-method-changed` is queued. It names the provider and contains no URL.
  - The token is single-use. A replay, or a missing or unknown token, throws `OAuthLinkExpiredError`.
  - A link token used while the browser is signed in as a different user is refused. The visible part of this test ends before its assertions.
- The imports also bring in `presentClaim`, `unlinkOAuthProvider`, `OAuthIdentityTakenError`, `OAuthAccountUnavailableError` and `accountAnalyticsEvents`. Their tests are not visible in the shown portion.

## Relationships
- **`../../services/oauth`**: the subject under test.
- **`../../audit`** (`accountAuditActions`) and **`../../analytics`** (`accountAnalyticsEvents`): supply the event names asserted against.
- **`@infrastructure/observability/audit` and `analytics`**: mocked ports. They are observed through `observePort` from `tests/support/ports.ts`.
- **`@infrastructure/adapters/remote-image`**: mocked so the avatar download doesn't run.
- **`@modules/users/tests/factories` and `../factories`**: `createUser` and `userRepository` seed and inspect users. `tokenRowsOf` reads token rows.
- **`@tests/setup-test-db`**: `setupTestDb()` provides the database lifecycle.
- **`@tests/callers`**: supplies `testCallerContext`.
- **`../../oauth/providers/port`**: supplies the `OAuthIdentity` type.

## Notes
- A login via an already-linked identity deliberately emits no audit or metric. The controller (`get-oauth-callback.ts`) records login success once a session exists, so emitting here would hardcode `actorRole: 'user'` and skip `authLoginTotal`.
- A sign-in whose email only matches an existing account never auto-links, as NIST SP 800-63C-4 §3.8.1 requires. The owner must connect from a signed-in session.
- The unverified-account refusal guards against pre-account-takeover. It has its own error because the remedy is a password reset, which proves the mailbox.
- The 5-minute lifetime is asserted as a literal, not the code's constant, because it is what the consent flow promises.
- The audit port is replaced, not spied on, per the comment in `tests/support/ports.ts`.
