---
source: src/modules/inventory/controllers/post-reservations-sweep.ts
sha256: 492deb41f709a0f61c8fad8ebd00e28f0a0bf13156065982970c30282fe43e21
generated_at: 2026-11-08T05:58:16.772866+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/post-reservations-sweep.ts

## Purpose

HTTP handler for `POST /inventory/reservations/sweep`. It triggers a one-shot reservation-expiry sweep on demand, intended for an operator or a platform scheduler that prefers calling an endpoint over relying on the cron-based job (`npm run job sweep:reservations`). The sweep itself is delegated to `inventoryService.runReservationSweep`; this file only wires the request, response, and error handling.

## Key elements

- **`postReservationsSweep`** (exported) – Express handler that calls `inventoryService.runReservationSweep(callerContextOf(request))`, then returns `{ expired: <number> }` as a `ReservationSweepResponse` with status 200. Errors are funneled through `catchAs`.

## Relationships

- **`src/modules/inventory/services/index.ts`** – Source of `inventoryService`, whose `runReservationSweep` method performs the actual expiry work.
- **`src/infrastructure/http/request.ts`** – Provides `callerContextOf` to derive the operator/scheduler identity passed into the sweep for audit purposes.
- **`src/infrastructure/http/response.ts`** – Provides `successResponse` to shape the JSON envelope.
- **`src/infrastructure/http/controller.ts`** – Provides `catchAs` for uniform error-to-HTTP mapping.
- **`src/types/index.ts`** – Defines `ReservationSweepResponse` (carries the `expired` count).
- **`src/modules/inventory/routes.ts`** – Registers this handler at the `POST /inventory/reservations/sweep` path.

## Notes

- This route is **not** the recurring schedule. The production cron (`docker/crontab` → `npm run job sweep:reservations`) never hits this endpoint; it exists as an alternative entry point for on-demand or external-scheduler use.
- Auditing is intentionally **once per run**, not per expired order. Individual order cancellations carry their own audit records, so the sweep-level audit line is the single source of "why did this batch disappear?" for support queries.
- The handler is a thin wrapper: no validation, no pagination, no filters. The sweep logic and its parameters live entirely in the service layer.
