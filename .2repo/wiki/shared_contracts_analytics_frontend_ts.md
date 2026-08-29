# shared/contracts/analytics.frontend.ts

## Purpose

Declares the analytics event names that only a browser client can emit — the half of a shared Umami event namespace that this (server) service can never observe. By giving those names a single, owned declaration point, the file lets `contract-bundles.test.ts` enforce collision-freedom between client and server event names, and lets `npm run contracts:bundle` publish a frontend-importable catalogue.

## Key elements

- **`frontendAnalyticsEvents`** (exported const object) — the complete set of client-only event names:
  - `APP_STARTED` / `APP_READY` — application lifecycle events with no server equivalent (the server is always running).
  - `USER_LOGGED_OUT` — token discard in the browser; no API request to attribute it to.
  - `CHECKOUT_REQUEST_FAILED` — a request that never reached the server (dropped connection, client-side failure). Deliberately distinct from `checkout_failed`, which is the server rejecting a request it received.

## Relationships

- **`shared/contracts/asyncapi.workers.yaml`** — the "mirror image": holds the server-only channels. Together they partition one Umami event namespace; `contract-bundles.test.ts` cross-checks both for collisions.
- **`scripts/contracts/analytics-events-bundle.ts`** — the bundling script (`npm run contracts:bundle`) that reads this file and publishes it as the catalogue the frontend repo imports.
- **`docs/tools/analytics.md`** — defines the naming convention (`#naming`) that the event string values in this file must follow.

## Notes

- **No `declare module` augmentation is intentional.** Unlike every `src/modules/<name>/analytics.ts`, this file does *not* extend `AnalyticsEventMap`. That absence makes `emitAnalyticsEvent` a compile-time reject for these names, so the server cannot accidentally emit a client event.
- **`CHECKOUT_REQUEST_FAILED` ≠ `checkout_failed`.** They describe different facts (outage vs. declined card) and must not be merged into one event.
- The file is the *only* source of truth for the client half of the namespace; adding a name here without a matching module declaration will fail the contract-bundle test.
