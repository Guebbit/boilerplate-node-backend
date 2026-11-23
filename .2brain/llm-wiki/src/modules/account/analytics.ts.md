---
source: src/modules/account/analytics.ts
generated_at: 2026-11-22T03:19:16.192354+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/analytics.ts

## Purpose
Declares the analytics event names the account module emits. Signup and login anchor the funnel that other rates are measured against. The names live in this file only: the paired frontend emits no custom events, so each name has exactly one emitter. The file extends the analytics port's name map (the same pattern `./audit.ts` uses for audit actions), so the event catalogue grows with the modules that own the names.

## Key elements
- `accountAnalyticsEvents`: a `as const` object mapping keys to event-name strings.
  - `USER_SIGNED_UP`: `'user_signed_up'`
  - `USER_LOGGED_IN`: `'user_logged_in'`
  - `USER_LOGGED_OUT`: `'user_logged_out'`. It is emitted server-side, because both logout routes are real requests this API answers. That lets it report the logout that succeeded instead of the one that was attempted.
  - `USER_PROFILE_VIEWED`: `'user_profile_viewed'`
  - `ACCOUNT_DELETION_SCHEDULED`: `'account_deletion_scheduled'`
  - `ACCOUNT_RESTORED`: `'account_restored'`
- `declare module '@infrastructure/observability/analytics'`: augments `AnalyticsEventMap` with an `account` entry. Its type is the union of the values of `accountAnalyticsEvents`.

## Relationships
- The neighbors in `services/` (`signup.ts`, `logout.ts`, `oauth.ts`, `profile.ts`, `account-deletion.ts`) and `src/modules/account/session/login-observability.ts` are the likely emitters, since they sit in the graph next to the signup, login, logout, profile and deletion events this file names. The file itself does not show which one fires which event.
- The integration tests (`oauth-link.test.ts`, `self-service.test.ts`, `service.test.ts`) and `tests/unit/infrastructure/observability/analytics.test.ts` are related in the graph and likely reference these names or the analytics port.
- The `@infrastructure/observability/analytics` port provides `AnalyticsEventMap`, which this file augments.

## Notes
- The account-purge flow deliberately fires no event, because there is no request and no consent behind it.
- Keep new account event names in this file only, so that every name keeps a single emitter.
- The file's header points to `docs/understand/analytics.md#naming` for further naming rules.
