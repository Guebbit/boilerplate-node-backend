---
source: src/modules/account/tests/integration/oauth-link.test.ts
sha256: 5da5919b9c4035b484bf4a402571b26be64b7060185c9b77bdbd3bfd0f7b9a83
generated_at: 2026-09-27T14:35:03.134394+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/oauth-link.test.ts

## Purpose

Integration tests for `loginOrCreateFromOAuth` (in `services/oauth.ts`), covering its three resolution branches — **login** (identity already linked), **link** (verified email matches an existing account), and **signup** (fresh identity). Runs against a real database because the logic performs an identity lookup, a `$push` link, and a user insert. Lives in `tests/integration` rather than `tests/unit` for that reason.

## Key elements

- **`identity(overrides?)`** — factory returning a default-verified `OAuthIdentity` (`providerId: 'subject-1'`, `email: 'oauth-user@example.com'`); pass overrides to flip `emailVerified` or swap fields.
- **`oauthAccountsOf(userId)`** — helper that reads `oauthAccounts` via `findByIdWithCredentials` because the field is `select: false` on the schema and invisible to a plain `findById`.
- **Case 1 (login)** — asserts the branch resolves the existing account with `outcome: 'login'`, creates no new users, and emits **no** audit or analytics events (recording a login is a controller responsibility).
- **Case 2 (link)** — four sub-tests:
  - Links the identity, asserts audit carries the account's **real** role (`admin`), not a hardcoded `'user'`.
  - With 2FA armed: still audits the link but emits no analytics (not a completed login).
  - `OAuthEmailUnverifiedError` when the provider doesn't vouch for the email; no mutation, no audit.
  - `OAuthAccountUnverifiedError` when the account itself never proved the address (account-takeover guard); account is left unproven on the way out.
- **Case 3 (signup)** — two sub-tests:
  - Creates a password-less, pre-verified, active account with the OAuth identity stored; emits `USER_SIGNED_UP` analytics.
  - Same `providerId` under two different providers creates two distinct accounts (uniqueness is scoped to `(provider, providerId)`, not `providerId` alone).
- **Audit / Analytics mocks** — `jest.mock` blocks replace `emitAuditEvent` / `emitAnalyticsEvent` with `jest.fn()` stubs. The audit mock additionally **re-routes `recordAudit`** through the replacement (see Notes).

## Relationships

| Neighbor | Role in this test |
|---|---|
| `src/modules/account/services/oauth.ts` | **SUT** — imports `loginOrCreateFromOAuth`, `OAuthEmailUnverifiedError`, `OAuthAccountUnverifiedError`. |
| `src/modules/account/audit.ts` | Provides `accountAuditActions` enum values used in `expect` assertions. |
| `src/modules/account/analytics.ts` | Provides `accountAnalyticsEvents` enum values used in `expect` assertions. |
| `src/infrastructure/observability/audit.ts` | Mocked; `emitAuditEvent` replaced, `recordAudit` re-routed (see Notes). |
| `src/infrastructure/observability/analytics/index.ts` | Mocked; `emitAnalyticsEvent` replaced. |
| `src/modules/account/oauth/providers/port.ts` | `OAuthIdentity` type used by the `identity()` helper and the service call. |
| `src/modules/users/repository.ts` | `userRepository` (from the test factory) used for `count`, `findById`, `linkOAuthAccount`, `findByIdWithCredentials` assertions. |
| `src/modules/users/tests/factories.ts` | `createUser` and `userRepository` test factories. |
| `tests/support/callers.ts` | `testCallerContext` — the caller context passed to the service. |
| `tests/support/ports.ts` | `observePort` — the replace-not-spy helper used to attach spies to the mocked port functions. |
| `tests/support/setup-test-db.ts` | `setupTestDb` — initialises the real test database before any test runs. |

## Notes

- **`recordAudit` mock trap.** `recordAudit` in the real audit module closes over its *own* `emitAuditEvent` binding, so a plain module-level replacement of `emitAuditEvent` is invisible to it. The mock therefore re-implements `recordAudit` as a thin wrapper that calls the *replaced* `emitAuditEvent` after building the event with the real `buildAuditEvent`. Without this, spies on `emitAuditEvent` would silently miss every `recordAudit` call.
- **Login branch emits nothing.** A deliberate design decision (tagged **B4** in inline comments): the service resolves the account and tags the outcome, but does **not** record a login or emit analytics. The controller (`get-oauth-callback.ts`) calls `recordLoginSuccess` with the account's real role after a session is actually created.
- **Account-takeover guard.** Linking requires *both* `emailVerified` (provider side) **and** `verifiedAt` (account side). A user who squatted an email with only a password cannot be linked onto by an OAuth arrival; the service throws `OAuthAccountUnverifiedError` and leaves the account's `verifiedAt` untouched.
- **`select: false` on `oauthAccounts`.** Any assertion that inspects linked OAuth accounts must go through `findByIdWithCredentials`; a standard `findById` will return `undefined` for the field.
- **`observePort` (replace, not spy).** The project convention (documented in `tests/support/ports.ts`) is to replace the target function with a spy rather than `jest.spyOn` the original, ensuring the mock boundary is explicit and no real I/O leaks.
