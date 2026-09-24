---
source: src/modules/account/services/oauth.ts
sha256: 2a450d2bff0d9356adc28e2e92ceb2928e17d07c5c5b4ce6cd7c642d1f9e660f
generated_at: 2026-09-23T18:09:10.116848+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/oauth.ts

## Purpose

Service layer for OAuth login/signup. Resolves a provider-issued `OAuthIdentity` into a `UserDocument` via exactly three outcomes — **login** (identity already linked), **link** (email matches an existing account that both sides have verified), or **signup** (fresh, password-less account). It sits one layer above the provider mechanics in `../oauth/` and below the callback controller, handling audit, analytics, role assignment, and the two email-verification security checks.

## Key elements

- **`loginOrCreateFromOAuth(provider, identity, context)`** — Main entry point. Looks up by `providerId` first (unique identity key), then falls back to email match. Returns `{ user, outcome: OAuthOutcome }`. Throws `OAuthEmailUnverifiedError` or `OAuthAccountUnverifiedError` on security refusal.
- **`recordOAuthFailure(context, provider, reason)`** — Emits an `AUTH_OAUTH_FAILED` audit for attempts that never resolved to a user (bad state, denied consent, provider error). Called only by the callback controller.
- **`OAuthOutcome`** (`'login' | 'link' | 'signup'`) — Tells the controller whether _it_ still owes an `AUTH_LOGIN` audit/analytics (only for `'login'`); the link and signup branches already record their own events here.
- **`OAuthEmailUnverifiedError`** — Thrown when the provider does not vouch for the email; prevents account takeover via a registered OAuth app under a victim's address.
- **`OAuthAccountUnverifiedError`** — Thrown when the existing account never self-verified its own address; prevents a pre-registered squatter from absorbing the victim's OAuth login.
- **`linkToExistingAccount`** (internal) — Calls `userService.linkOAuthAccount`, then reads roles fresh via `rolesOf`, records `AUTH_OAUTH_LINKED` audit, and conditionally emits `USER_LOGGED_IN` analytics (suppressed when 2FA is armed, since no session is minted yet).
- **`signupFromOAuth`** (internal) — Creates a verified, active, password-less user via `userService.registerFromOAuth`, assigns `VERIFIED_CUSTOMER_ROLE` (with compensation via `discardFailedSignup` on grant failure), then records `AUTH_SIGNED_UP` audit and analytics.

## Relationships

- **`get-oauth-callback.ts`** — The sole controller caller. It interprets `OAuthOutcome` to decide whether to mint a session, issue a 2FA challenge, or record its own `AUTH_LOGIN`. It translates the two error classes into `?error=email_unverified` / `?error=account_unverified` redirects.
- **`oauth/providers/port.ts`** — Supplies the `OAuthIdentity` type consumed here.
- **`users/index.ts`** — All user CRUD (`findByOAuthIdentity`, `findByEmail`, `linkOAuthAccount`, `registerFromOAuth`, `discardFailedSignup`) goes through `userService` from this module.
- **`access/index.ts` / `access/service.ts`** — `assignRole`, `rolesOf`, and `VERIFIED_CUSTOMER_ROLE` for the signup and link paths.
- **`kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` scopes role reads/writes.
- **`kernel/permissions.ts`** — `isUnrestrictedRole` determines the `actor_role` label in audit entries.
- **`infrastructure/observability/audit.ts`** — `recordAudit` for link, signup, and failure events.
- **`infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` / `buildAnalyticsBase` for login and signup analytics.
- **`infrastructure/i18n`** — `getCurrentLocale` sets the locale on newly created accounts.
- **`modules/account/analytics.ts` / `audit.ts`** — Provide the `accountAnalyticsEvents` and `accountAuditActions` constant names used in the calls above.
- **`services/index.ts`** — Re-exports this module's public API.
- **`tests/integration/oauth-link.test.ts`** — Integration tests exercising the link path.

## Notes

- **Case 1 (login) records nothing here.** The `AUTH_LOGIN` audit and analytics are deferred to the controller, which is the only place that knows whether a session actually materialized (vs. a 2FA challenge). Emitting it unconditionally in this file was a prior double-count bug.
- **Two independent verification gates.** The provider must vouch for the email (`identity.emailVerified`) _and_ the account must have self-verified (`verifiedAt`). Either check failing produces a distinct, specific error — never a generic failure — so the frontend can present the correct remediation.
- **Concurrency on signup.** A simultaneous signup for the same identity is resolved by the `users_oauth_identity` unique index; the loser's insert rejects with E11000, which the controller surfaces as `?error=provider_error`. The retry then hits case 1.
- **`findByOAuthIdentity` is called with credentials** (unlike other lookups in this file) because the controller may need `twoFactorMethods` to build a login challenge.
