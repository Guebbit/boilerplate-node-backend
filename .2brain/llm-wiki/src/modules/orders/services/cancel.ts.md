---
source: src/modules/orders/services/cancel.ts
sha256: 3ea153d31ca3612780361812bdf34f8f9049810aface86fd4475467b35c8cfc5
generated_at: 2026-09-23T19:06:17.371045+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/cancel.ts

## Purpose

Handles order cancellation as a single conditional status write followed by its side effects (inventory release, refund intent, domain-event broadcast, audit, analytics, and a conditional expiry email). Also exposes the sweep function that discharges refund effects that failed on the happy path, making the cancel at-least-once durable without an in-app scheduler.

## Key elements

- **`cancelById(id, authContext?, options?, context?)`** — Core cancellation. Performs a `updateStatusIfIn` (conditional move, not read-check-write) scoped to the actor's allowed statuses, then sequentially: releases the inventory hold, emits `ORDER_CANCELLED`, clears the refund marker only if every listener settled, optionally sends a bank-transfer expiry email (system-only), records audit and analytics. Returns `200` / `409` / `404`.
- **`retryPendingEffects()`** — External sweep (invoked by `scripts/ops/sweep-order-effects.ts`). Finds up to 200 orders still carrying the `refund` pending-effect marker older than the configured grace window, re-emits `ORDER_CANCELLED` for each, and clears the marker only on full listener success. Returns the count settled.
- **`PENDING_REFUND`** — Frozen `['refund']` array written into the order document alongside the status change.
- **`SWEEP_BATCH_SIZE`** (200) — Cap per sweep run; hitting it logs a warning to re-run.

## Relationships

- **`@kernel/permissions`** — `actorOf` resolves the caller's role; `callerForSubject(SYSTEM_ACTOR, …)` fabricates the system-actor context used when the sweep triggers the cancel.
- **`@kernel/events`** — `emitDomainEvent(ORDER_CANCELLED, …)` is the single broadcast point; its boolean return gates whether the refund marker is cleared.
- **`@modules/inventory`** → **`inventoryService`** — `releaseForOrder` returns held stock after the conditional write succeeds (at-most-once via the same `$in` guard).
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape the HTTP response.
- **`@infrastructure/i18n`** — `t` localizes user-facing messages; `getDefaultLocale` supplies the fallback for the expiry email when the buyer has no stored locale.
- **`@infrastructure/adapters/mailer`** — `enqueueEmail` sends the `bankTransferExpiredEmail` (fire-and-forget, system expiry only).
- **`@infrastructure/observability/audit`** — `recordAudit` logs the action with role/user overrides for system expiry.
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` + `buildAnalyticsBase` emit either `ORDER_CANCELLED` or `ORDER_RESERVATION_EXPIRED`.
- **`@infrastructure/runtime/environment`** — `environmentNumber` reads the retry grace-window minutes from env.
- **`@infrastructure/adapters/logger`** — `logger.warn` / `logger.info` in the sweep path.
- **`../analytics`** (`ordersAnalyticsEvents`) / **`../audit`** (`ordersAuditActions`) — module-local enum constants naming the audit and analytics events.

## Notes

- **Refund is non-waivable for non-admins.** `options.refund` is only honoured when the actor is `admin`; a customer or operator (moderator/warehouse) always gets `refund: true`.
- **The refund marker is the at-least-once contract.** It is written in the same document write as the status change, cleared only when `emitDomainEvent` returns `true` (all listeners succeeded), and is the sole input to `retryPendingEffects`. A failed listener therefore leaves the marker in place for the next sweep.
- **Idempotency is downstream.** `retryPendingEffects` may re-emit `ORDER_CANCELLED` for an already-refunded order; the payments listener's own conditional `succeeded → refunded` move makes the second announcement a no-op.
- **No in-app scheduler.** Both the reservation sweep and this effect sweep are driven by external scripts; the app ships no cron/timer.
- **Stryker annotations** (`// Stryker disable …` / `// Stryker restore …`) suppress mutation testing on the logging lines in the sweep — a convention, not functional logic.
