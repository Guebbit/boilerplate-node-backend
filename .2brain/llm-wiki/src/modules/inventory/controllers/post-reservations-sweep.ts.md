---
source: src/modules/inventory/controllers/post-reservations-sweep.ts
sha256: 24ec1b76c915e20d8340617456c861a9c0ee772a4f8aeb68543f654dbce6fa65
generated_at: 2026-09-23T18:44:09.815476+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/post-reservations-sweep.ts

## Purpose

Express handler for `POST /inventory/reservations/sweep`. It triggers a one-shot reservation-expiry sweep by delegating to the inventory service, then returns the count of expired reservations. The app ships no internal scheduler; this endpoint is meant to be invoked by an external cron entry, a platform scheduled job, or an operator.

## Key elements

- **`postReservationsSweep`** (exported function) — The sole export. Receives `Request`/`Response`, calls `inventoryService.runReservationSweep(callerContextOf(request))`, and on success sends `{ expired }` with a 200 and an i18n message. Errors are routed through `catchAs(response, 'postReservationsSweep')`.
- **`ReservationSweepResponse`** (imported type) — Shapes the success payload; carries at minimum an `expired` count.

## Relationships

- **`../service`** (`inventoryService.runReservationSweep`) — Performs the actual sweep logic; the controller is a thin I/O wrapper.
- **`src/modules/inventory/routes.ts`** — Registers this handler on the `POST /inventory/reservations/sweep` route.
- **`@infrastructure/http/request`** — Supplies `callerContextOf(request)` so the service knows who initiated the sweep (for auditing).
- **`@infrastructure/http/response`** — Provides `successResponse` to shape the JSON reply.
- **`@infrastructure/http/controller`** — Provides `catchAs` for uniform error serialization.
- **`@infrastructure/i18n`** — Provides `t()` to localise the success message (`inventory.sweep-success`).
- **`src/types/index.ts`** — Exports the `ReservationSweepResponse` type used in the response contract.

## Notes

- Audit granularity is intentionally **once per sweep run**, not per individual order. The docstring states that per-order cancellations are covered by the orders' own cancel path; this run-level record exists so an operator can answer "why did this order vanish?" with a timestamped sweep event.
- The handler is **fire-and-forget from the app's perspective**: no in-process timer or queue triggers it. If nothing external calls this endpoint, reservations are never swept.
