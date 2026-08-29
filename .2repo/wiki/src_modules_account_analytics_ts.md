# src/modules/account/analytics.ts

## Purpose

Declares the analytics event names owned by the account domain and registers them in the shared `AnalyticsEventMap` type via a module augmentation. This keeps the event catalogue distributed across the modules that emit each event, so `infrastructure` never needs to know about any specific domain.

## Key elements

- **`accountAnalyticsEvents`** (exported const) — The four event-name strings this module is responsible for: `USER_SIGNED_UP`, `USER_LOGGED_IN`, `USER_PROFILE_VIEWED`, `ACCOUNT_DELETED`.
- **Module augmentation of `@infrastructure/observability/analytics`** — Adds an `account` key to `AnalyticsEventMap` typed as a union of the values above, giving the infrastructure layer a typed view without it importing any domain code.

## Relationships

- **`scripts/contracts/analytics-events-bundle.ts`** — Consumes this module's events (alongside other domain modules) to produce a bundled contract for the frontend.
- **`src/modules/account/controllers/post-login.ts`** — Imports `accountAnalyticsEvents` to fire `USER_LOGGED_IN` (and likely `USER_SIGNED_UP`) at the point the event occurs.
- **`src/modules/account/services/authentication.ts`** — Source of `USER_SIGNED_UP` and `ACCOUNT_DELETED` emissions.
- **`src/modules/account/services/profile.ts`** — Source of `USER_PROFILE_VIEWED` emissions.
- **`src/modules/account/tests/integration/self-service.test.ts`** — Asserts that the expected events are emitted during self-service flows.
- **`tests/unit/infrastructure/observability/analytics.test.ts`** — Exercises the analytics port against the augmented `AnalyticsEventMap`, which includes the `account` key declared here.

## Notes

- Nothing in this file *publishes* or *sends* events. It is purely a name catalogue + type declaration; the actual firing lives in controllers/services that import this constant directly.
- `shared/contracts/analytics.frontend.ts` is a separate, frontend-facing contract. Events that appear in **both** files risk being double-counted; this module's events are intentionally **not** published to that contract.
- Naming convention is governed by `docs/tools/analytics.md#naming` (snake_case values, `SCREAMING_SNAKE` keys).
- The augmentation pattern mirrors `./audit.ts`: each domain module extends the shared map in its own file rather than editing a central registry.
