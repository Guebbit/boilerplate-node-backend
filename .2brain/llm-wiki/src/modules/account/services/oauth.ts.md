---
source: src/modules/account/services/oauth.ts
sha256: 96da8f59cb2318525f99bd95ebe9e5cc6e0ccd94c19ddcd956acd6792b8fb24a
generated_at: 2026-09-27T14:29:57.229078+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/oauth.ts

## Purpose

Resolves an `OAuthIdentity` (provider + providerId) to a `UserDocument` via one of three mutually exclusive outcomes: **login** (identity already linked), **link** (email matches an existing verified account, new provider attached), or **signup** (fresh password-less account created). Sits one layer above the provider mechanics in `../oauth/` and handles the account-level decisions: security checks, role assignment, audit, and analytics. It does **not** mint sessions or issue 2FA challenges — that is the callback controller's job.

## Key elements

- **`loginOrCreateFromOAuth(provider, identity, context)`** — main entry point. Looks up by `providerId` first; falls back to email lookup for the link path. Returns `{ user, outcome }` where `outcome: OAuthOutcome` tells the caller which branch fired.
- **`recordOAuthFailure(context, provider, reason)`** — audits OAuth attempts that never reached the identity resolution (bad `state`, declined consent, provider error). No user is involved.
- **`OAuthOutcome`** — `'login' | 'link' | 'signup'` union, consumed by the controller to decide whether *it* still owes an `AUTH_LOGIN` audit record.
- **`OAuthEmailUnverifiedError`** — thrown when an email match exists but the provider did not vouch for it (blocks account takeover via unverified email).
- **`OAuthAccountUnverifiedError`** — thrown when the matching account itself never proved its address (blocks squatter takeover).
- **`linkToExistingAccount`** (module-private) — case-2 tail: writes the OAuth link, audits `AUTH_OAUTH_LINKED`, emits `USER_LOGGED_IN` analytics *only if 2FA is not armed*.
- **`signupFromOAuth`** (module-private) — case-3 tail: creates the user, assigns `VERIFIED_CUSTOMER_ROLE`, audits `AUTH_SIGNED_UP`, emits `USER_SIGNED_UP`. Compensates by discarding the row if role assignment is refused.

## Relationships

- **`src/modules/account/controllers/get-oauth-callback.ts`** — sole caller of `loginOrCreateFromOAuth` and `recordOAuthFailure`. Converts the two error types into `?error=email_unverified` / `?error=account_unverified` redirects. Mints the session and records `AUTH_LOGIN` for the `'login'` outcome; issues a 2FA challenge when `twoFactorMethods` is present.
- **`src/modules/account/oauth/providers/port.ts`** — supplies the `OAuthIdentity` type that flows into this module.
- **`src/modules/users/index.ts`** — `userService` provides all data access (`findByOAuthIdentity`, `findByEmail`, `linkOAuthAccount`, `registerFromOAuth`, `discardFailedSignup`); also exports `UserDocument` and `DEFAULT_USER_IMAGE_URL`.
- **`src/modules/access/index.ts`** — `assignRole` and `VERIFIED_CUSTOMER_ROLE` used in the signup path.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` passed to `assignRole`.
- **`src/modules/account/roles.ts`** — `isUnrestrictedCaller` used to determine the actor role for the link audit.
- **`src/modules/account/analytics.ts` / `src/modules/account/audit.ts`** — `accountAnalyticsEvents` and `accountAuditActions` enums that name the specific events/actions.
- **`src/infrastructure/observability/analytics/index.ts` / `audit.ts`** — `emitAnalyticsEvent`, `buildAnalyticsBase`, `recordAudit` primitives.
- **`src/infrastructure/i18n/index.ts`** — `getCurrentLocale` stamped onto new accounts at signup.
- **`src/modules/account/services/index.ts`** — barrel re-export.
- **`src/modules/account/tests/integration/oauth-link.test.ts`** — integration tests for the link path.

## Notes

- **`providerId` is the primary key, email is not.** An email match never silently logs in; it only triggers the link path after both verification checks pass. This is the core anti-takeover invariant.
- **The `'login'` outcome records nothing here.** Audit and analytics for a completed login are the controller's responsibility (`recordLoginSuccess`), because this function cannot know the caller's resolved role or whether a session was actually minted. Link and signup, by contrast, audit themselves in-file.
- **`findByOAuthIdentity` is called with credentials** (to expose `twoFactorMethods`, which is `select: false`) — a deliberate exception to the file's otherwise credential-free lookups, needed by the controller for 2FA challenge construction.
- **Signup skips the `unverified` state entirely.** The provider's vouching substitutes for an email-verification loop; the `verifiedAt` timestamp is set at creation. If `assignRole` is refused, the row is discarded as compensation.
- **2FA suppression on link:** when `twoFactorEnabledAt` is set, the `USER_LOGGED_IN` analytics event is *not* emitted during the link, because the callback will issue a challenge rather than mint a session — the login is not yet complete.
