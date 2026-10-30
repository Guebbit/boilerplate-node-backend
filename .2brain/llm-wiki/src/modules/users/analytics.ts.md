---
source: src/modules/users/analytics.ts
sha256: 2ab7077703169d96ed949ac4b23c1f4b541acccfb3c4a2edafb67651d364f5d2
generated_at: 2026-10-29T06:10:17.018519+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/analytics.ts

## Purpose

Defines the analytics event names emitted by the users module for admin-facing account lifecycle actions, and registers them into the app-wide `AnalyticsEventMap` type via module augmentation. It exists so that event emission is type-safe at the call site and so the analytics port's union stays a single source of truth.

## Key elements

- **`usersAnalyticsEvents`** (exported `as const` object) — the two event-name constants:
  - `USER_CREATED: 'user_created'` — administrative account creation.
  - `USER_DEACTIVATED: 'user_deactivated'` — deactivation; counts toward churn dashboards and is not covered by a generic "updated" signal.
- **`declare module '@infrastructure/observability/analytics'`** — augments `AnalyticsEventMap` with a `users` key whose type is the union of the values above, making the names available type-safely wherever the port is consumed.

## Relationships

- **`src/modules/users/services/create.ts`** — expected consumer of `USER_CREATED`; fires the event when an admin creates an account.
- **`src/modules/users/services/activation.ts`** — expected consumer of `USER_DEACTIVATED`; fires the event when an admin deactivates an account.
- **`src/modules/users/tests/integration/service.test.ts`** — integration tests that assert the correct events are emitted (and not others) during create/deactivate flows.
- **`@infrastructure/observability/analytics`** (port) — the interface this file augments; the single type that unions all modules' event names.

## Notes

- Events are always attributed to the **acting admin**, never to the subject user. An event about another person belongs to the actor.
- `USER_CREATED` is deliberately distinct from `USER_SIGNED_UP` (the `account` module's self-signup event).
- Naming convention is governed by `docs/tools/analytics.md#naming`.
- The augmentation pattern mirrors `./audit.ts`'s approach for audit actions — keep the `as const` + `typeof` extraction in sync when adding events.
