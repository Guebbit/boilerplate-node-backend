# src/modules/users/analytics.ts

## Purpose

Declares the analytics event names for the admin-facing half of the user account lifecycle (operator-initiated creation and deactivation) and registers them into the app-wide `AnalyticsEventMap` via module augmentation, giving the users module a type-safe, self-documenting set of event keys distinct from the self-signup events in the `account` module.

## Key elements

- **`usersAnalyticsEvents`** (`as const`) — the two event-name constants this module emits:
  - `USER_CREATED` (`'user_created'`) — fires when an admin/operator creates a user record.
  - `USER_DEACTIVATED` (`'user_deactivated'`) — fires on deactivation; deliberately a dedicated event (not a generic "updated") so churn dashboards can count it.
- **Module augmentation** (`declare module '@infrastructure/observability/analytics'`) — extends `AnalyticsEventMap` with a `users` key whose type is the union of `usersAnalyticsEvents` values, making every site that dispatches a `users` event checked against this set.

## Relationships

- **`src/modules/users/service.ts`** — the consumer. The service is where the admin account-creation and deactivation flows live and where these event names are actually dispatched; this file provides the typed vocabulary it imports.
- **`@infrastructure/observability/analytics`** — supplies the `AnalyticsEventMap` interface that this file augments; the analytics port reads the map to validate/record dispatched events.
- **`./audit.ts`** (sibling, not a graph neighbor here) — follows the identical augmentation pattern for audit-action names; useful as a reference when adding events.

## Notes

- Event-name strings must follow the convention in `docs/tools/analytics.md#naming` (lowercase, underscore-separated).
- `USER_DEACTIVATED` is intentionally separate from any generic update signal; do not collapse it into an "updated" event or churn reporting breaks.
- The `as const` + augmentation pair means adding a new event here is a one-line change: add a key to `usersAnalyticsEvents` and the type-safe union updates everywhere automatically.
