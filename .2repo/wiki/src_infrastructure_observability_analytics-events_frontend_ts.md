# src/infrastructure/observability/analytics-events.frontend.ts

## Purpose

Read-only, generated list of the four analytics event names this **client** app is allowed to emit into the shared Umami namespace. It exists so both repos reference identical event names (the "contract") while keeping the client's list minimal—only events that no API call can carry (app lifecycle, local token discard, a request that never left the browser).

## Key elements

- **`analyticsEvents`** — `as const` object with four keys: `APP_STARTED`, `APP_READY`, `USER_LOGGED_OUT`, `CHECKOUT_REQUEST_FAILED`. Values are the wire names (snake_case strings) sent to Umami.
- **`AnalyticsEventName`** — Union type of all valid event-name values, derived from `analyticsEvents` via `typeof` + `keyof`. Use this as the parameter type when calling the analytics emitter.

## Relationships

- **`scripts/contracts/analytics-events-bundle.ts`** (backend) — Producer. The backend's `contracts:bundle` task generates the byte-identical content of this file; the frontend copy arrives via `sync:frontend`.
- **`tests/cross-cutting/contract-bundles.test.ts`** — Consumer of the identity gate. This test (run by `check:spec-identity`) verifies the frontend copy is byte-identical to the backend copy and that no client event name collides with a server-emitted one.

## Notes

- **Do not hand-edit.** The identity gate fails the build on the commit that forks the two copies. Any new event name must be added in the backend contract fragment and re-bundled.
- **`const` object, not `enum`.** The frontend's lint bans non-`E`-prefixed enums; the backend's does not. A plain `const` object is the only construct both repos accept, so this file deliberately avoids `enum` syntax.
- **`CHECKOUT_REQUEST_FAILED` ≠ `checkout_failed`.** The former means the request never reached the server (network drop, browser crash); the latter means the server received and rejected it. They must stay separate—merging them would conflate an infrastructure outage with a declined payment.
- **The list is intentionally short.** Every event that has an API call behind it (signup, login, cart, order, payment) is emitted by the backend only. Adding a client-side duplicate of one of those is a bug.
