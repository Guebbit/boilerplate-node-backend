---
source: src/modules/inventory/controllers/post-reservations-sweep.ts
source_sha256: 492deb41f709a0f61c8fad8ebd00e28f0a0bf13156065982970c30282fe43e21
context_sha256: c34342a13404c0e70142bbd3095ae9bbe84fe9d2bda83042af9e611d38d1f032
generated_at: 2026-11-22T05:17:57.564853+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/controllers/post-reservations-sweep.ts

## Purpose
Express controller for `POST /inventory/reservations/sweep`, an on-demand way to trigger the reservation expiry sweep. The recurring schedule is `npm run job sweep:reservations` (via `docker/crontab`), which never goes through this route. The endpoint exists for operators or platform schedulers that prefer HTTP.

## Key elements
- `postReservationsSweep(request, response)`: the only export. It calls `inventoryService.runReservationSweep(callerContextOf(request))`. On success it responds with status 200 and `{ expired }`, typed as `ReservationSweepResponse`. Errors go to `catchAs(response, 'postReservationsSweep')`.

## Relationships
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `successResponse` sends the 200 payload.
- `src/infrastructure/http/controller.ts`: `catchAs` handles failures from the promise chain.
- `src/modules/inventory/services/index.ts`: supplies `inventoryService`, which does the sweep.
- `src/types/index.ts`: supplies the `ReservationSweepResponse` type.
- `src/modules/inventory/routes.ts`: the route file for the inventory module. It presumably wires this handler to the path, but the wiring is not visible in this file.

## Notes
- Per the module doc, the sweep is audited once per run, not per order. The orders' own cancel path covers the per-order records. This gives a record for customers asking why an order vanished.
- The controller itself writes no audit. The doc comment describes the auditing, but the code here only passes the caller context to the service.
