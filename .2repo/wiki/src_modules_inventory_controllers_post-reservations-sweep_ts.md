# src/modules/inventory/controllers/post-reservations-sweep.ts

## Purpose

Handler for `POST /inventory/reservations/sweep`. Triggers the reservation-expiry tick by delegating to `inventoryService.runReservationSweep`, then returns the count of expired holds. The app ships no internal scheduler, so this endpoint is the external trigger (cron, platform job, or operator), following the same pattern as `POST /delivery/advance`.

## Key elements

- **`postReservationsSweep`** (exported) — Express handler. Calls `inventoryService.runReservationSweep(callerContextOf(request))`, responds `200` with `{ expired }` and the i18n message `inventory.sweep-success`, and funnels errors through `catchAs`.

## Relationships

- **`src/modules/inventory/service.ts`** — source of `inventoryService.runReservationSweep`, the business logic that expires stale holds and cancels the associated orders.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts the authenticated caller's context to pass as the audit actor.
- **`src/infrastructure/http/response.ts`** — `successResponse` builds the 200 JSON body.
- **`src/infrastructure/i18n/index.ts`** — `t('inventory.sweep-success')` supplies the human-readable success message.
- **`src/infrastructure/http/controller.ts`** — `catchAs` wraps unhandled rejections into a standard error response.
- **`src/modules/inventory/routes.ts`** — registers this handler on the `/inventory/reservations/sweep` route.

## Notes

- **External trigger, not internal cron.** The application has no built-in scheduler; something outside the process (cron entry, platform scheduled job, operator) must call this endpoint periodically.
- **Audit granularity is per-run, not per-order.** One audit row records *that* a sweep ran and *how many* holds it expired. Individual order cancellations are audited by the orders' own cancel path. This separation lets an operator trace "who pressed the button" without duplicating per-order audit data.
- The i18n key `inventory.sweep-success` is the only customer-facing string here; the `{ expired }` count is the payload.
