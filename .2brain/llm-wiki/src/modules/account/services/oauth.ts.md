---
source: src/modules/account/services/oauth.ts
sha256: ae9ca9a1f77e0ccd89837a0c64b70bb327d3c32032f98624884dfe2f155f0c76
generated_at: 2026-10-14T08:49:53.250116+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/oauth.ts

## Purpose

Resolves an `OAuthIdentity` (from any registered provider) into a concrete `UserDocument`, handling the three possible outcomes: logging in an already-linked identity, linking a new provider onto an existing verified email match, or signing up a fresh password-less account. It sits one layer above the provider mechanics in `../oauth/` and is the OAuth counterpart to `login`/`signup` in the sibling modules.

## Key elements

- **`loginOrCreateFromOAuth`** (main export, truncated in source) — the single entry point the callback controller calls. Looks up by `providerId` first, then by email (link-only, never silent login). Returns `{ user, outcome: OAuthOutcome }`. Throws the three error classes below on refusal.
- **`OAuthOutcome`** (exported type) — `'login' | 'link' | 'signup'`. Tells the controller whether *it* still owes an `AUTH_LOGIN` audit (only for `'login'`); link and signup already audited themselves.
- **`presentClaim`** (exported) — normalises a provider claim string: trims whitespace, maps empty/blank to `undefined`. Prevents blank values from violating the `required` username constraint or storing an empty `imageUrl`.
- **`OAuthEmailUnverifiedError`** (exported) — provider did not mark the email as verified; prevents OAuth-app-registered-address takeover. Controller maps to `?error=email_unverified`.
- **`OAuthAccountUnverifiedError`** (exported) — existing account never proved its own mailbox (pre-account-takeover guard). Controller maps to `?error=account_unverified`.
- **`OAuthAccountUnavailableError`** (exported) — matched account is banned or soft-deleted; refused before any write. Controller maps to generic `?error=provider_error`.
- **`linkToExistingAccount`** (private) — calls `userService.linkOAuthAccount`, then conditionally records `AUTH_OAUTH_LINKED` audit and suppresses `USER_LOGGED_IN` analytics when 2FA is armed (no session minted yet).
- **`signupFromOAuth`** (private) — re-hosts the avatar image, then in a single DB transaction calls `userService.registerFromOAuth` + `assignRole(VERIFIED_CUSTOMER_ROLE)`. On failure, discards the re-hosted avatar. Emits `AUTH_SIGNED_UP` audit and `USER_SIGNED_UP` analytics.
- **`discardAvatar`** (private) — removes the re-hosted image via `imageStore.remove`, then rethrows the original error.

## Relationships

- **`src/modules/account/controllers/get-oauth-callback.ts`** — sole caller. Catches the three error classes to produce specific redirect queries, mints the session (or 2FA challenge) for the `'login'` case, and records `recordLoginSuccess` only when a session actually exists.
- **`src/modules/account/oauth/providers/port.ts`** — supplies the `OAuthIdentity` type that parameterises every function here.
- **`src/modules/access/index.ts`** — `assignRole` and `VERIFIED_CUSTOMER_ROLE` used in the signup transaction to grant tenant membership atomically with account creation.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` constant passed to `assignRole`.
- **`src/infrastructure/adapters/remote-image.ts`** — `rehostRemoteImage` downloads the provider avatar locally so the stored URL never points at the provider's host.
- **`src/infrastructure/adapters/image-store.ts`** — `imageStore.remove` used to clean up the re-hosted avatar when signup fails.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps the signup create + role-assign so both commit atomically.
- **`src/infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` / `buildAnalyticsBase` for `USER_LOGGED_IN` and `USER_SIGNED_UP` events.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` for `AUTH_OAUTH_LINKED` and `AUTH_SIGNED_UP`.
- **`src/modules/account/analytics.ts`** — `accountAnalyticsEvents` enum.
- **`src/modules/account/audit.ts`** — `accountAuditActions` enum.
- **`src/infrastructure/i18n/index.ts`** — `getCurrentLocale` stamps the locale on new accounts.

## Notes

- **No `AUTH_LOGIN` audit is emitted here for case 1.** The controller records it after minting the session, because it is the only place that knows the caller's effective role. Emitting it here would always write `'user'` (the linked document's own perspective) and double-count when a link or signup already recorded its own event.
- **`providerId` is the identity key, not email.** Email is consulted only as a *link* trigger when no identity row exists. This prevents an attacker from walking into an account by matching someone else's email with a self-registered OAuth app.
- **Signup skips the `unverified` state entirely.** The provider's verified-email claim is treated the same as an operator-created account: `verifiedAt` is set, `active` is `true`, and the `customer` role grant replaces what would otherwise be an `unverified` role.
- **Concurrent signup race** for the same `providerId` is resolved by a unique index (`users_oauth_identity`); the loser gets E11000, which the controller surfaces as `provider_error`. The caller simply retries and lands in case 1.
- **`presentClaim` is exported** because the callback controller and potentially other callers need the same normalisation for display-name fallback and image-URL validation.
