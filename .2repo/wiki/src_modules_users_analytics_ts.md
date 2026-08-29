# src/modules/users/analytics.ts

## Purpose
Defines the analytics event names emitted by the users module for **administrative** account-lifecycle actions (operator creating or deactivating an account, as opposed to a self-service sign-up). It declares those names locally via module augmentation so the infrastructure observability layer remains domain-agnostic.

## Key elements
- **`usersAnalyticsEvents`** (`as const`) — the two event-name constants: `USER_CREATED` (`'user_created'`) and `USER_DEACTIVATED` (`'user_deactivated'`).
- **`declare module '@infrastructure/observability/analytics'`** — augments `AnalyticsEventMap` with a `users` key typed to the union of the above values, so type-safe emission is available without a shared central list.

## Relationships
- **`src/modules/users/service.ts`** — the users service (and/or its controllers) imports this file directly to reference the event-name constants when emitting analytics events. No re-export or publication layer sits between them.
- **`scripts/contracts/analytics-events-bundle.ts`** — a build/contract script that aggregates event names across modules. This file's local declaration is one of the inputs that script collects, keeping the catalogue distributed by module ownership.

## Notes
- **Do not add a shared event-name registry.** The deliberate pattern (mirrored by `./audit.ts`) is per-module declaration + augmentation; `infrastructure` must never learn a domain name.
- **`USER_DEACTIVATED` is a dual-purpose event.** It is both an administrative action and a product/churn signal. Do not replace it with a generic "updated" event.
- **Frontend visibility is separate.** Only `shared/contracts/analytics.frontend.ts` publishes events to the paired frontend. Events defined here are server-observed only; adding them to the frontend contract would cause double-counting.
- Naming convention is governed by `docs/tools/analytics.md#naming`.
