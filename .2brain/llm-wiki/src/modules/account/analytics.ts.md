---
source: src/modules/account/analytics.ts
sha256: 4184fa62c65c664fa26eaab1f82755c71e3c9612bbe69cfdcf65d91fcb1b96d4
generated_at: 2026-09-23T17:58:15.860604+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/analytics.ts

## Purpose

Declares the canonical set of analytics event names emitted by the account module and augments the shared analytics port's event-name map so TypeScript enforces type-safety at every emit site. It exists to keep the "one name → one emitter" invariant and to let each module grow the catalogue independently (same pattern as `./audit.ts` for audit actions).

## Key elements

- **`accountAnalyticsEvents`** (`as const` object) — The five event-name strings this module owns: `USER_SIGNED_UP`, `USER_LOGGED_IN`, `USER_LOGGED_OUT`, `USER_PROFILE_VIEWED`, `ACCOUNT_DELETED`.
- **`declare module '@infrastructure/observability/analytics'`** — Declaration-merging that adds an `account` key to `AnalyticsEventMap`, constrained to the values above. This is what makes `emit('account', accountAnalyticsEvents.USER_LOGGED_IN)` type-check.

## Relationships

- **`@infrastructure/observability/analytics`** (the analytics port) — Augmented via declaration merging; this file contributes the `account` entry to the shared event-name map.
- **`services/authentication.ts`, `services/oauth.ts`, `services/profile.ts`** — The account services that import `accountAnalyticsEvents` as the sole source of truth for the names they emit (signup, login, logout, profile-view, account-deletion).
- **`session/login-observability.ts`** — Consumes the login-related event names for observability wiring in the session layer.
- **Tests** (`integration/oauth-link.test.ts`, `integration/self-service.test.ts`, `integration/service.test.ts`, `unit/infrastructure/observability/analytics.test.ts`) — Assert that the correct event names are emitted by the services above.

## Notes

- **`USER_LOGGED_OUT` is server-side only.** Both logout routes are real API requests, so the backend reports the route that actually succeeded rather than what the client attempted. Do not add a client-side emit for this name.
- **Naming is governed by `docs/tools/analytics.md#naming`.** Each name keeps exactly one emitter across the system; the paired frontend emits no custom events, so there is no cross-emitter collision to manage here.
- **Declaration merging, not a new interface.** The `declare module` block extends the existing `AnalyticsEventMap`; you do not re-export a separate type. Consumers import from the analytics port, not from this file, when they need the union of all module names.
