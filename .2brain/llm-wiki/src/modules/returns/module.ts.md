---
source: src/modules/returns/module.ts
sha256: bdb7af71b04f016d8998522db8e817d0a117617a2fc44b80af30a1e99d06ce15
generated_at: 2026-11-08T08:00:13.115369+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/module.ts

## Purpose

Entry point (module manifest) for the **returns** module — handling customer goods returns and the EU 14-day withdrawal ("cooling-off") flow. It wires together the module's routes, jobs, config, rate limits, public webhook events, domain-event subscriptions, and personal-data collection into a single `AppModule` object consumed by the kernel.

## Key elements

- **`publicEvents`** — Maps internal domain events (`RETURN_REQUESTED`, `RETURN_RECEIVED`, `RETURN_CLOSED`) to public webhook payloads (e.g. `return.requested`, `return.received`, `return.closed`). Projected by `webhooks` via `kernel/registry.ts`'s `resolvePublicEvents`; `webhooks` never imports this module directly.
- **`export default { … } satisfies AppModule`** — The module manifest:
  - `mounts` — Mounts the router from `./routes` at `/returns`.
  - `jobs` — Cron/scheduled work from `./jobs`.
  - `config` / `rateLimits` — Budget and throttling declarations from `./config` and `./rate-limits`.
  - `subscribe` — Registers domain-event listeners:
    - `PAYMENT_REFUNDED` (from the payments module) → triggers `closeReturn(returnId)` when the refund carries a `returnId`.
    - `RETURN_REQUESTED` / `RETURN_DECIDED` / `RETURN_CLOSED` → dispatches customer emails via `returnService.mail*`.
  - `personalData` — Exposes a single `returns` section that **collects** data by `userId` but deliberately provides **no `erase` hook** (returns are keyed by `orderId`).
  - `locales` / `templates` — Filesystem paths for i18n strings and mail templates.
  - `scenario` — Two pre-seeded "defective goods" return requests for automated test journeys.
- **`closeReturn`** (from `./services/close`) — Conditional close logic idempotent with the goods-received request; called from the `PAYMENT_REFUNDED` subscription.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `AppModule` / `PublicEventTarget` types this manifest `satisfies`; also hosts `resolvePublicEvents` which projects `publicEvents` without importing this module.
- **`src/kernel/events.ts`** — Source of `onDomainEvent` and `DomainEventMap` used in the `subscribe` closure and public-event type annotations.
- **`src/modules/payments/index.ts`** — Exports `PAYMENT_REFUNDED`, the cross-module event this module listens to for refund confirmation.
- **`src/modules.ts`** — Aggregate module registry that likely imports this default export to register the `returns` module with the kernel.
- **`src/modules/returns/events.ts`** — Declares `RETURN_REQUESTED`, `RETURN_RECEIVED`, `RETURN_CLOSED`, `RETURN_DECIDED`; imported **directly** (not via the module barrel) per the project's barrel rule.
- **`src/modules/returns/routes.ts`** — Supplies the Hono/router instance mounted at `/returns`.
- **`src/modules/returns/jobs.ts`** — Supplies `returnsJobs` for scheduled work.
- **`src/modules/returns/config.ts`** — Supplies `returnsConfig` (sliced into the manifest).
- **`src/modules/returns/rate-limits.ts`** — Supplies `returnsRateLimits`.
- **`src/modules/returns/services/index.ts`** — Exposes `returnService` (mail dispatch for return lifecycle events).
- **`src/modules/returns/services/close.ts`** — Exposes `closeReturn`, the idempotent close action.
- **`src/modules/returns/services/personal-data.ts`** — Exposes `collectPersonalData`; documents why no `erase` hook exists.
- **`src/modules/returns/openapi.yaml`** / **`authorization.yaml`** / **`asyncapi.webhooks.yaml`** — API contract artifacts co-located with this module (not imported at runtime).

## Notes

- **No `erase` hook.** Returns are keyed by `orderId`, not `userId`, so GDPR/account-erasure flows have nothing to delete here. Do not add an `erase` entry to `personalData` without changing the keying strategy.
- **Barrel rule.** The events (`RETURN_*`) are imported from `./events` directly, never through this module's own barrel (`src/modules/returns/index.ts`). Follow the same pattern when adding new event constants.
- **Idempotent close.** `closeReturn` is designed to be safe under racing: the `PAYMENT_REFUNDED` listener and the goods-received request may both attempt to close the same return.
- **`satisfies` over `as`.** The manifest uses `satisfies AppModule` to retain the concrete literal type of `publicEvents` keys while still checking structural compatibility.
