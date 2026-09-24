---
source: src/modules/account/tests/integration/oauth-link.test.ts
sha256: f77d05f4b59641c08ab09d179e448e67b4fa7c73457c4608917f0e47f1d87ab4
generated_at: 2026-09-23T18:13:33.836557+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/oauth-link.test.ts

## Purpose

Integration test for `loginOrCreateFromOAuth` (from `services/oauth.ts`), covering its three branches — already-linked login, email-match link, and new signup. Runs against a real test database because the logic performs identity lookups, an `oauthAccounts` `$push`, and a user insertion that pure unit tests cannot exercise.

## Key elements

- **`identity(overrides?)`** — helper that builds a default verified `OAuthIdentity` (provider `google`, subject `subject-1`, email `oauth-user@example.com`).
- **`oauthAccountsOf(userId)`** — fetches `oauthAccounts` via `userRepository.findByIdWithCredentials` because the field is `select: false` in the schema and a plain `findById` never returns it.
- **`describe` blocks (3 cases)** — one per branch:
  - *Case 1 (login):* resolves an already-linked account; asserts no audit/analytics emission and no new user.
  - *Case 2 (link):* verified-email match links the identity, audits with the account's real role; 2FA-armed variant still audits but skips analytics; unverified-provider-email and unverified-account refusals (`OAuthEmailUnverifiedError`, `OAuthAccountUnverifiedError`) leave state unchanged.
  - *Case 3 (signup):* creates a password-less pre-verified account and emits a `USER_SIGNED_UP` analytics event; same `providerId` under different providers yields distinct accounts.
- **`jest.mock` for `@infrastructure/observability/audit`** — replaces `emitAuditEvent` with a spy and reroutes `recordAudit` through that spy (because `recordAudit` closes over its own module's real `emitAuditEvent`).
- **`jest.mock` for `@infrastructure/observability/analytics`** — replaces `emitAnalyticsEvent` with a spy.
- **`setupTestDb()`** — one-time real-DB bootstrap; `afterEach` restores all mocks.

## Relationships

- **`src/modules/account/services/oauth.ts`** — the SUT; provides `loginOrCreateFromOAuth`, `OAuthEmailUnverifiedError`, `OAuthAccountUnverifiedError`.
- **`src/modules/account/audit.ts`** — supplies `accountAuditActions` (e.g. `AUTH_OAUTH_LINKED`) used in assertions.
- **`src/modules/account/analytics.ts`** — supplies `accountAnalyticsEvents` (e.g. `USER_SIGNED_UP`) used in assertions.
- **`src/modules/account/oauth/providers/port.ts`** — type-only import for `OAuthIdentity`.
- **`src/modules/users/repository.ts`** — `userRepository` (imported via the test factories re-export) performs all DB reads/writes under test.
- **`src/modules/users/tests/factories.ts`** — `createUser` factory and the `userRepository` instance used throughout.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the real test database.
- **`tests/support/callers.ts`** — `testCallerContext` provides the caller identity passed to the service.
- **`tests/support/ports.ts`** — `observePort` wraps a port function in a spy and returns it, centralising the "replace-not-spy" mocking strategy.
- **`src/infrastructure/observability/audit.ts`** / **`analytics/index.ts`** — the real ports that are mocked here so test assertions can inspect emitted events in isolation.

## Notes

- The audit mock is deliberately a **full module replacement**, not a `jest.spyOn`, because `recordAudit` in the real module closes over its own `emitAuditEvent` binding. The mock re-implements `recordAudit` to call the replaced `emitAuditEvent`, keeping a single observation point.
- `oauthAccounts` is `select: false` in the schema; always use `findByIdWithCredentials` (or the `oauthAccountsOf` helper) when asserting link state.
- The "login" branch (case 1) intentionally emits **no** audit or analytics events — login recording is the controller's job (`get-oauth-callback.ts` → `recordLoginSuccess`), not the service's.
- Case 2's "unverified account" refusal is an account-takeover guard: linking requires the target account to have independently verified its email (e.g. via reset), not merely that the provider reports the address as verified.
- Uniqueness of OAuth identities is scoped to the composite `(provider, providerId)` pair, not `providerId` alone — two providers can legitimately share the same subject string.
