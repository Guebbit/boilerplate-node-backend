---
source: src/modules/account/analytics.ts
sha256: c5348910c52c3f8d4dafd0b3198b0da9ecf0b3517ef1eb68bdde2e5a95c3a4b0
generated_at: 2026-10-29T02:25:07.825375+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/analytics.ts

## Purpose

Declares the analytics event names emitted by the account module and registers them in the analytics port's type map. It is a pure declaration file — no runtime logic — that lets the account services reference a shared, type-safe catalogue of event strings while keeping ownership of each name in one place.

## Key elements

- **`accountAnalyticsEvents`** — `as const` object mapping semantic keys (`USER_SIGNED_UP`, `USER_LOGGED_IN`, `USER_LOGGED_OUT`, `USER_PROFILE_VIEWED`, `ACCOUNT_DELETION_SCHEDULED`, `ACCOUNT_RESTORED`) to their `snake_case` wire strings.
- **Module augmentation** (`declare module '@infrastructure/observability/analytics'`) — extends `AnalyticsEventMap` with an `account` key typed as the value union of `accountAnalyticsEvents`, so the analytics port type-checks against this module's names.

## Relationships

- **Services (signup, logout, oauth, profile, account-deletion)** — consume `accountAnalyticsEvents` as the set of event names they fire. Each service is the sole emitter for its respective event(s).
- **`session/login-observability.ts`** — related to the `USER_LOGGED_IN` event; likely composes or wraps the login analytics signal.
- **Test files** (`tests/integration/*.test.ts`, `tests/unit/.../analytics.test.ts`) — assert that the correct event names from this module are emitted by the services.

This file has no runtime imports; all listed neighbors import *from* it.

## Notes

- **Naming convention** is governed by `docs/tools/analytics.md#naming`; each event name has exactly one emitter and the frontend emits no custom events of its own.
- `USER_LOGGED_OUT` is server-side only: both logout routes are real API requests, so the server reports which one actually succeeded.
- `ACCOUNT_DELETION_SCHEDULED` fires at scheduling time; the purge itself fires nothing (no request, no consent gate).
- The module-augmentation pattern mirrors `./audit.ts` (audit actions), keeping the catalogue distributed across the modules that own their names rather than centralised.
