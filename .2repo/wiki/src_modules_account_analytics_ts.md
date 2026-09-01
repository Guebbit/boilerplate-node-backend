# src/modules/account/analytics.ts

## Purpose

Declares the analytics event names owned by the account module and registers them into the shared analytics port's type map. It exists so that every account-domain event has exactly one authoritative name and a compile-time-safe reference, keeping the event catalogue distributed alongside the module that owns each name.

## Key elements

- **`accountAnalyticsEvents`** (exported const object) — the five event names this module may emit: `USER_SIGNED_UP`, `USER_LOGGED_IN`, `USER_LOGGED_OUT`, `USER_PROFILE_VIEWED`, `ACCOUNT_DELETED`. All are snake_case strings; the object is `as const`.
- **`declare module '@infrastructure/observability/analytics'`** — augments `AnalyticsEventMap` with an `account` key whose type is the union of all values above, giving callers type-safe event names at the point of emission.

## Relationships

- **`src/modules/account/services/authentication.ts`** and **`src/modules/account/controllers/post-login.ts`** — consumers of the auth/onboarding events (`USER_SIGNED_UP`, `USER_LOGGED_IN`, `USER_LOGGED_OUT`). The logout event is emitted server-side from the controller because both logout routes are real API requests.
- **`src/modules/account/services/profile.ts`** — consumer of `USER_PROFILE_VIEWED` and `ACCOUNT_DELETED`.
- **`src/modules/account/tests/integration/self-service.test.ts`** and **`src/modules/account/tests/integration/service.test.ts`** — integration tests that assert the above services emit the correct event names.
- **`tests/unit/infrastructure/observability/analytics.test.ts`** — unit-level tests for the analytics port; exercises the `AnalyticsEventMap` augmentation that this file provides.

## Notes

- `USER_LOGGED_OUT` is intentionally server-side. The comment notes that both logout routes are real HTTP requests this API answers, so the server reports the one that actually succeeded rather than relying on a client-side signal.
- The naming convention is governed by `docs/tools/analytics.md#naming`; the paired frontend emits no custom events, so each name has exactly one emitter.
- This file is purely declarative (constant + type augmentation). It has no runtime side effects and imports nothing from its neighbors—neighbors import *it*.
