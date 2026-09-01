# src/modules/inventory/controllers/post-reservations-sweep.ts

## Purpose

HTTP handler for `POST /inventory/reservations/sweep`. It triggers the reservation-expiry sweep on demand. The app ships no internal scheduler, so an external caller (cron, CI, operator) invokes this endpoint to tick expirations — the same arrangement as `POST /delivery/advance`. A single audit record is written per sweep run rather than per individual order (each order's own cancellation path records its own audit).

## Key elements

- **`postReservationsSweep`** *(exported handler)* — Accepts an Express `Request`/`Response`, calls `inventoryService.runReservationSweep(callerContextOf(request))`, then:
  - On success: replies **200** with body `{ expired }` and the i18n message `inventory.sweep-success` via `successResponse`.
  - On failure: delegates to `catchAs(response, 'postReservationsSweep')` for standard error formatting.

## Relationships

- **`../service`** (`src/modules/inventory/service.ts`) — Provides `inventoryService.runReservationSweep`, the actual sweep logic.
- **`../routes`** (`src/modules/inventory/routes.ts`) — Registers this handler as the `POST /inventory/reservations/sweep` route.
- **`@infrastructure/http/request`** — `callerContextOf(request)` extracts the caller's identity/context to pass into the service.
- **`@infrastructure/http/response`** — `successResponse` builds the JSON success envelope.
- **`@infrastructure/http/controller`** — `catchAs` wraps errors into a consistent HTTP error response.
- **`@infrastructure/i18n`** — `t('inventory.sweep-success')` localizes the success message.

## Notes

- There is **no built-in scheduler**; the sweep only runs when this endpoint is explicitly called. If the external tick stops firing, reservations will not expire.
- The sweep produces **one** audit entry per invocation (not one per expired reservation). Individual order-level audit trails come from the order cancellation path, not from this sweep.
- The `expired` field in the response body is the count (or list) of reservations that were expired by this run, as returned directly by the service.
