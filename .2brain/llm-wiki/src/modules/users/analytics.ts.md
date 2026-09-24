---
source: src/modules/users/analytics.ts
sha256: 812c74851ace8055a0bc20f6443f353706199d9af9f46db1818c988ab1979caf
generated_at: 2026-09-23T19:31:25.371625+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/analytics.ts

## Purpose

Declares the analytics event names for the user module's administrative actions and registers them into the app-wide `AnalyticsEventMap` type so that emitters (e.g. `service.ts`) can reference them in a type-safe, stringly-typed-free way. The events distinguish operator-initiated account actions from the self-signup path (`USER_SIGNED_UP`) so that dashboards can sum or split them independently.

## Key elements

- **`usersAnalyticsEvents`** (exported const) — a frozen key-value map of the two events this module fires:
  - `USER_CREATED` (`'user_created'`) — admin/operator creates an account for another user.
  - `USER_DEACTIVATED` (`'user_deactivated'`) — account deactivated; doubles as the churn-dashboard signal.
- **Module augmentation** (`declare module '@infrastructure/observability/analytics'`) — adds a `users` key to `AnalyticsEventMap` whose value is the union of the two event-name strings, making them first-class members of the global analytics name type.

## Relationships

- **`src/modules/users/service.ts`** — the primary consumer of `usersAnalyticsEvents`. It emits these events through the analytics port; the module augmentation here is what gives those call sites their type-safe literal values. The file follows the same augmentation pattern that `./audit.ts` uses for audit actions.

## Notes

- The naming convention for event strings is governed by `docs/tools/analytics.md#naming` (linked in the file header).
- `USER_DEACTIVATED` is intentionally a distinct event rather than being folded into a generic "user_updated" signal; it is the unit the churn dashboard counts on.
- This file contains no runtime logic beyond the object literal and a type-level augmentation — it is purely declarative.
