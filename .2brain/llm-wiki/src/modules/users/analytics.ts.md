---
source: src/modules/users/analytics.ts
sha256: 2ab7077703169d96ed949ac4b23c1f4b541acccfb3c4a2edafb67651d364f5d2
generated_at: 2026-11-08T08:42:45.661998+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/analytics.ts

## Purpose

Declares the analytics event names for admin-initiated user lifecycle actions (account creation and deactivation) and registers them into the app-wide analytics event map. It exists so that event names live in one typed location and are available to any service that fires them, without duplicating string literals.

## Key elements

- **`usersAnalyticsEvents`** — `as const` object with two keys: `USER_CREATED` (`'user_created'`) and `USER_DEACTIVATED` (`'user_deactivated'`). These represent the admin-facing half of account lifecycle, as opposed to the self-service `USER_SIGNED_UP` event owned by the `account` module.
- **Module augmentation of `@infrastructure/observability/analytics`** — adds a `users` key to `AnalyticsEventMap`, constraining its value to the union of the two event strings. This is the same pattern used by `./audit.ts` for audit actions.

## Relationships

- **`src/modules/users/services/create.ts`** — consumes `usersAnalyticsEvents.USER_CREATED` when an admin creates a user account.
- **`src/modules/users/services/activation.ts`** — consumes `usersAnalyticsEvents.USER_DEACTIVATED` when an admin deactivates a user.
- **`src/modules/users/tests/integration/service.test.ts`** — asserts that the above services emit the expected event names.

## Notes

- Events are always sent **as the acting admin**, never as the subject user. An event about another person belongs to the actor.
- `USER_DEACTIVATED` is intentionally a distinct event (not a generic "updated") because it is the signal churn dashboards count.
- Naming convention is governed by `docs/tools/analytics.md#naming`.
