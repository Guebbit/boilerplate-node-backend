---
source: src/modules/returns/module.ts
generated_at: 2026-11-22T07:26:08.082951+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/module.ts

## Purpose
Manifest entry for the `returns` module (sending goods back and the EU withdrawal button). It declares the module's routes, jobs, config slice, rate limits, public webhook events, domain-event subscriptions, personal-data export, locales/templates and a test scenario, all as a default export checked with `satisfies AppModule`. The docblock states it depends on `orders`, `inventory`, `payments` and `delivery`, while `orders` knows nothing of this module.

## Key elements
- **`publicEvents`** (private const): maps `RETURN_REQUESTED`, `RETURN_RECEIVED` and `RETURN_CLOSED` to `toPublicEvent` projections producing `return.requested`, `return.received` and `return.closed`. Optional fields (`statedVia` on requested, `remedy` on closed) are included only when present.
- **Default export (`AppModule`)**:
  - `name: 'returns'`
  - `mounts`: the `router` at `/returns`
  - `jobs`: `returnsJobs`
  - `config`: `[returnsConfig.slice]`
  - `rateLimits`: `returnsRateLimits`
  - `publicEvents`
  - `locales` and `templates`: the `locales` and `templates` directories next to the file
- **`subscribe()`**:
  - On `PAYMENT_REFUNDED` with a `returnId`, calls `closeReturn(returnId)`.
  - On `RETURN_REQUESTED`, `RETURN_DECIDED` and `RETURN_CLOSED`, calls `returnService.mailReturnRequested`, `mailReturnDecided` and `mailReturnClosed` to send the customer's mails.
- **`personalData`**: a single `returns` section whose `collect` calls `collectPersonalData(subject.userId)`. There is no `erase`.
- **`scenario`**: `{ shop: ['return.requested', 'return.requestedSecond'] }`. These are two defective-goods requests, each on its own order delivered today, opened through `POST /returns` so a journey can approve one and decline the other. The ids are return ids.

## Relationships
- `src/kernel/registry.ts`: supplies the `AppModule` and `PublicEventTarget` types. Public events go through the registry's `resolvePublicEvents`, so `webhooks` never imports this module by name.
- `src/kernel/events.ts`: supplies `onDomainEvent` and `DomainEventMap`, which type the event payloads.
- `src/modules/payments/index.ts`: supplies `PAYMENT_REFUNDED`, the only cross-module import. `src/modules/payments/module.ts` is the sibling manifest and is not imported here.
- `src/modules/returns/routes.ts`, `rate-limits.ts`, `config.ts`, `jobs.ts`: provide the router, budgets, config slice and jobs that are wired into the manifest.
- `src/modules/returns/events.ts`: supplies the `RETURN_*` event constants, imported directly rather than through the module's own barrel.
- `src/modules/returns/services/close.ts`, `services/index.ts` and `services/personal-data.ts`: provide `closeReturn`, `returnService` and `collectPersonalData`.
- `src/modules.ts`: presumably where manifests are collected. This file does not show it.
- `src/modules/returns/tests/integration/cancel.test.ts` and `cancel-remainder.test.ts`: integration tests for this module. This file does not show how they use it.

## Notes
- Imports of `./events` bypass the module barrel on purpose (CLAUDE.md, "Module barrels").
- A return is keyed by `orderId`, not `userId`, so account erasure needs no `erase` hook (see `src/modules/returns/services/personal-data.ts`).
- Closing a return is the same conditional move whether the `PAYMENT_REFUNDED` listener or the request that received the goods gets there first. A refund can land in the request, or later when the payment sweep completes one the provider first refused.
- A comment in `subscribe` says the customer's mails are built from this module's own facts in a `notify` service. That file is not among the graph neighbors.
