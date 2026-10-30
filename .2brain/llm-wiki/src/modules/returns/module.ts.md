---
source: src/modules/returns/module.ts
sha256: bdb7af71b04f016d8998522db8e817d0a117617a2fc44b80af30a1e99d06ce15
generated_at: 2026-10-29T05:39:43.539281+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/module.ts

## Purpose

Module manifest (entry point) for the **returns** module. It declares everything the kernel needs to mount and operate the module—routes, jobs, config, rate limits, public (webhook-visible) events, domain-event subscriptions, personal-data hooks, and a test scenario. It also wires the cross-module side effect: reacting to a `PAYMENT_REFUNDED` event to close a return once the provider's refund lands.

## Key elements

- **`publicEvents`** (local const) — Maps three internal domain events (`RETURN_REQUESTED`, `RETURN_RECEIVED`, `RETURN_CLOSED`) to outward-facing webhook payloads (`return.requested`, `return.received`, `return.closed`) with flattened data. Resolved by the kernel's `resolvePublicEvents`; `webhooks` never imports this module by name.
- **`default export`** (`AppModule`) — The manifest object the registry consumes:
  - `mounts` — Mounts `router` at `/returns`.
  - `jobs` — Passes through `returnsJobs`.
  - `config` / `rateLimits` — Passes through `returnsConfig.slice` and `returnsRateLimits`.
  - `subscribe` — Registers four `onDomainEvent` listeners:
    - `PAYMENT_REFUNDED` → calls `closeReturn(returnId)` when the payload carries a `returnId` (handles both immediate and provider-delayed refunds).
    - `RETURN_REQUESTED` / `RETURN_DECIDED` / `RETURN_CLOSED` → delegate to `returnService.mailReturn*` for customer email.
  - `personalData` — A single `'returns'` section that calls `collectPersonalData(userId)`; **no `erase` hook** (returns are keyed by `orderId`, so account erasure is a no-op here).
  - `locales` / `templates` — Filesystem paths relative to `__dirname`.
  - `scenario` — Seeds two pending defective-goods returns (`return.requested`, `return.requestedSecond`) on distinct orders for integration testing.

## Relationships

- **`@kernel/events`** (`src/kernel/events.ts`) — Provides `onDomainEvent` and the `DomainEventMap` type used to type event payloads.
- **`@kernel/registry`** (`src/kernel/registry.ts`) — Provides the `AppModule` and `PublicEventTarget` types that shape this module's default export; also hosts `resolvePublicEvents` which reads `publicEvents` at runtime.
- **`@modules/payments`** (`src/modules/payments/index.ts`) — Source of the `PAYMENT_REFUNDED` constant; the returns module subscribes to this event but payments has no dependency back.
- **`./events`** (`src/modules/returns/events.ts`) — Source of the four `RETURN_*` constants (and their event declarations). Imported directly per the module-barrel rule.
- **`./services/close`** (`src/modules/returns/services/close.ts`) — Provides `closeReturn`, the conditional close operation triggered by the `PAYMENT_REFUNDED` listener.
- **`./services/index`** (`src/modules/returns/services/index.ts`) — Provides `returnService` (mail handlers for customer notifications).
- **`./services/personal-data`** (`src/modules/returns/services/personal-data.ts`) — Provides `collectPersonalData` for the GDPR data-export section.
- **`./routes`**, **`./config`**, **`./jobs`**, **`./rate-limits`** — Leaf modules whose exports are passed through into the manifest.
- **`src/modules.ts`** — The top-level module barrel that the kernel iterates over; this file is one of the entries it loads.
- **Integration tests** (`tests/integration/cancel.test.ts`, `cancel-remainder.test.ts`, `close-by-hand.test.ts`) — Exercise the `scenario` seed and the `closeReturn` / cancel flows defined here.

## Notes

- **No `erase` in `personalData`.** Because returns are keyed by `orderId` (not `userId`), there is nothing to wipe on account deletion. See `./services/personal-data.ts` docblock for the full rationale.
- **`RETURN_DECIDED` is subscribed but not exposed.** It drives customer mail only; it has no entry in `publicEvents`, so webhooks never see it.
- **Events import bypasses the barrel.** `./events` is imported directly (not via `./services/index` or a module barrel) to satisfy the project's module-barrel rule—see CLAUDE.md.
- **`closeReturn` is idempotent by design.** The `PAYMENT_REFUNDED` listener fires regardless of whether the goods-received handler reached close first; the close operation is conditional on the return's current state.
