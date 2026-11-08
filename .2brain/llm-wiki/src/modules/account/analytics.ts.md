---
source: src/modules/account/analytics.ts
sha256: c5348910c52c3f8d4dafd0b3198b0da9ecf0b3517ef1eb68bdde2e5a95c3a4b0
generated_at: 2026-11-08T03:59:31.337656+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/analytics.ts

## Purpose

Declares the canonical set of analytics event names owned by the account module and registers them into the shared `AnalyticsEventMap` type. Every account-related event fired anywhere in the backend must use a name from this catalogue, giving the analytics port a single, type-checked vocabulary for the account domain.

## Key elements

- **`accountAnalyticsEvents`** (`as const` object) — the six event-name strings this module is responsible for: `user_signed_up`, `user_logged_in`, `user_logged_out`, `user_profile_viewed`, `account_deletion_scheduled`, `account_restored`.
- **`declare module '@infrastructure/observability/analytics'`** — augments `AnalyticsEventMap` with an `account` key typed to the values of `accountAnalyticsEvents`, so any consumer that emits an `account` event is checked against this catalogue at compile time.

## Relationships

- **`services/signup.ts`, `services/logout.ts`, `services/profile.ts`, `services/account-deletion.ts`, `services/oauth.ts`** — each of these services imports `accountAnalyticsEvents` and passes the relevant name to the analytics port when the corresponding action succeeds. This file is their sole source of truth for the strings they emit.
- **`session/login-observability.ts`** — emits `USER_LOGGED_IN` (and related auth events) defined here as part of the login flow's server-side observability.
- **`tests/integration/oauth-link.test.ts`, `tests/integration/self-service.test.ts`, `tests/integration/service.test.ts`** — assert that the correct event names (referenced from this module) were recorded after each service call.
- **`tests/unit/infrastructure/observability/analytics.test.ts`** — validates the analytics port's dispatch mechanism; the account event names appear as fixtures.

## Notes

- **Single-emitter rule** — each event name has exactly one emitting site in the codebase. The paired frontend does not emit custom account events, so no name is shared across clients.
- **`USER_LOGGED_OUT` is server-side only** — both logout routes are real API requests, so the server reports which one actually succeeded rather than what the client attempted.
- **`ACCOUNT_DELETION_SCHEDULED` is emitted; the purge is not** — the eventual hard-delete fires no event because there is no request or user consent at that point.
- **Module-augmentation pattern** — mirrors `./audit.ts`: each domain module grows the shared `AnalyticsEventMap` with its own slice, keeping the port generic while the catalogue stays co-located with the owners of the names.
- **Naming convention** — see `docs/tools/analytics.md#naming` for the snake_case, past-tense / noun rule applied to these strings.
