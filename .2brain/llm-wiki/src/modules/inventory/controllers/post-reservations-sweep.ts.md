---
source: src/modules/inventory/controllers/post-reservations-sweep.ts
sha256: 492deb41f709a0f61c8fad8ebd00e28f0a0bf13156065982970c30282fe43e21
generated_at: 2026-10-29T03:59:47.855768+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/post-reservations-sweep.ts

## Purpose

HTTP controller for `POST /inventory/reservations/sweep`. It exposes the reservation-expiry sweep as an on-demand endpoint so an operator or a platform scheduler that prefers HTTP can trigger it. The recurring schedule is handled by a separate CLI job (`npm run job sweep:reservations` via `docker/crontab`) that never reaches this route.

## Key elements

- **`postReservationsSweep`** (exported function) – Express handler that calls `inventoryService.runReservationSweep(callerContextOf(request))`, then sends a `200` with the count of expired reservations (`ReservationSweepResponse { expired }`). Errors are delegated to `catchAs`.

## Relationships

- **`src/modules/inventory/services/index.ts`** – Provides `inventoryService.runReservationSweep`, the actual sweep logic this controller delegates to.
- **`src/modules/inventory/routes.ts`** – Registers this handler at the `POST /inventory/reservations/sweep` path.
- **`src/infrastructure/http/request.ts`** – Supplies `callerContextOf` to extract the caller's identity for auditing.
- **`src/infrastructure/http/response.ts`** – Supplies `successResponse` used to shape the JSON reply.
- **`src/infrastructure/http/controller.ts`** – Supplies `catchAs` for uniform error handling.
- **`src/types/index.ts`** – Declares the `ReservationSweepResponse` shape returned to the client.

## Notes

- The cron job and this endpoint are two independent entry points into the same sweep. Do not assume the cron path exercises this controller.
- Auditing is recorded **once per run**, not per expired order. Per-order audit records come from the individual order-cancel path. This is intentional: an operator asking why an order disappeared has a single sweep-run log entry to point to.
- The handler is a thin, promise-chained wrapper (no `async/await`), consistent with the module's other controllers.
