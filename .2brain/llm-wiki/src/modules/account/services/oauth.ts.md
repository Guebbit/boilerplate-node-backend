---
source: src/modules/account/services/oauth.ts
sha256: 1f3ff52296094bd2b511e0612d1b35d4cca0716ef9e757fede06e7a299be5ec4
generated_at: 2026-10-15T10:01:01.371273+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/oauth.ts

## Purpose

Orchestrates the OAuth login/signup flow, sitting one layer above the provider-specific mechanics in `../oauth/`. Given an `OAuthIdentity` from a provider token exchange, it resolves to a `UserDocument` via exactly three outcomes: **login** (identity already linked), **link** (new identity attached to an existing verified account), or **signup** (fresh password-less account created). It owns the audit/analytics side-effects for link and signup, and enforces the email-verification security gates that prevent account takeover.

## Key elements

- **`loginOrCreateFromOAuth`** *(exported, main entry point)* — Resolves an `OAuthIdentity` to a `UserDocument`, returning a tuple tagged with `OAuthOutcome`. Looks up by `providerId` first; email match is only a secondary path and only ever *links*, never silently logs in.
- **`OAuthOutcome`** *(exported type)* — `'login' | 'link' | 'signup'`. Tells the callback controller whether it still owes an `AUTH_LOGIN` audit (only for `'login'`; link and signup already recorded their own).
- **`presentClaim`** *(exported)* — Normalises a raw OIDC claim: trims whitespace, returns `undefined` for blank/missing. Guards against non-conformant providers sending `''`.
- **`OAuthEmailUnverifiedError`** *(exported)* — Thrown when the provider does **not** assert the email as verified and an existing account holds that address. Prevents an attacker who registers an OAuth app under a victim's address from linking in.
- **`OAuthAccountUnverifiedError`** *(exported)* — Thrown when the provider *does* verify the email but the existing account never proved it. Prevents pre-account-takeover (squatter scenario).
- **`OAuthAccountUnavailableError`** *(exported)* — Thrown when the matched account is banned or soft-deleted. Refused before any write; surfaced as generic `provider_error` to the caller.
- **`linkToExistingAccount`** *(private)* — Calls `userService.linkOAuthAccount`, records `AUTH_OAUTH_LINKED` audit only if the link was new, and emits `USER_LOGGED_IN` analytics unless 2FA is armed (no session is minted in that case).
- **`signupFromOAuth`** *(private)* — Rehosts the avatar, then atomically creates the user + assigns `VERIFIED_CUSTOMER_ROLE` inside a DB transaction. On failure, discards the rehosted avatar. Emits `AUTH_SIGNED_UP` audit and `USER_SIGNED_UP` analytics.
- **`discardAvatar`** *(private)* — Removes a rehosted avatar via `imageStore.remove` before rethrowing the original error.

## Relationships

- **`src/modules/account/controllers/get-oauth-callback.ts`** — The sole caller. Catches the three error classes and maps them to `?error=…` redirects. For `'login'` outcome it mints the session and calls `recordLoginSuccess` itself.
- **`src/modules/account/oauth/providers/port.ts`** — Supplies the `OAuthIdentity` type that all functions here consume.
- **`src/infrastructure/adapters/remote-image.ts`** — `rehostRemoteImage` downloads the avatar once so the stored URL is local (no viewer IP leaks to the provider host).
- **`src/infrastructure/adapters/image-store.ts`** — `imageStore.remove` cleans up the avatar when a signup transaction fails.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` makes user creation and role assignment commit atomically.
- **`src/modules/access/index.ts` / `service.ts`** — `assignRole` and `VERIFIED_CUSTOMER_ROLE` grant the `customer` role at signup time.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` scopes the role assignment.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` used for the signup audit entry.
- **`src/infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` / `buildAnalyticsBase` for `USER_LOGGED_IN` and `USER_SIGNED_UP` events.
- **`src/modules/account/analytics.ts`** — `accountAnalyticsEvents` event-name constants.
- **`src/modules/account/audit.ts`** — `accountAuditActions` action-name constants.
- **`src/infrastructure/i18n/index.ts`** — `getCurrentLocale()` stamps the new user's locale at signup.

## Notes

- **Login case records nothing here.** The `AUTH_LOGIN` audit is deliberately the controller's job (it knows the post-session role). Link and signup audit themselves because they *are* the fact.
- **`providerId` is the identity key**, not email. An email match alone can only *link* a new identity onto an existing account; it never logs the user in, closing the "borrow a victim's email" vector.
- **2FA suppresses `USER_LOGGED_IN`** on the link path: the callback issues a 2FA challenge instead of a session, so no login has actually completed.
- **Signup skips `unverified`** — the provider's verification is treated as sufficient (same rationale as the admin-creation path). The `customer` role grant is the membership write, not a document field.
- **Concurrent signup race** for the same identity is handled by the `users_oauth_identity` unique index: the loser gets E11000, surfaced as `provider_error`; a retry hits case 1.
- **`presentClaim` is exported** because `get-oauth-callback.ts` (or tests) may need the same normalisation logic outside this module.
