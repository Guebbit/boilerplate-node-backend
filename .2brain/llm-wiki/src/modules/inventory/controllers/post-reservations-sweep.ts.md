---
source: src/modules/inventory/controllers/post-reservations-sweep.ts
sha256: 35692dd7b9992716bd605ee269a3b9a637049f06e0f8ccfffe9ca6e35ad50b68
generated_at: 2026-10-14T15:53:47.523770+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/post-reservations-sweep.ts

## Purpose

HTTP controller for `POST /inventory/reservations/sweep`. It is the on-demand entry point an operator or platform scheduler can hit to expire overdue reservations. The recurring crontab (`docker/crontab` → `npm run sweep:reservations`) is the actual schedule and never reaches this route. The handler is intentionally thin: it delegates the sweep to the inventory service and reports how many reservations were expired.

## Key elements

- **`postReservationsSweep(request, response)`** (exported) – Express handler. Calls `inventoryService.runReservationSweep(callerContextOf(request))`, then sends a `200` `successResponse` with `{ expired: <number> }` and the localized string `inventory.sweep-success`. Errors are forwarded to `catchAs`.
- **`catchAs(response, 'postReservationsSweep')`** – Imported error-catch helper; serialises thrown errors into an HTTP error response tagged with the handler name.
- **`callerContextOf(request)`** – Extracts the authenticated caller's identity from the Express request so the service can attribute the sweep run.
- **`t('inventory.sweep-success')`** – i18n lookup for the human-readable success message.

## Relationships

- **`routes.ts`** – Registers `postReservationsSweep` as the handler for `POST /inventory/reservations/sweep`.
- **`services/index.ts`** – Exports `inventoryService`, whose `runReservationSweep` method performs the actual expiry logic.
- **`@infrastructure/http/controller.ts`** – Provides `catchAs` for uniform error serialisation.
- **`@infrastructure/http/request.ts`** – Provides `callerContextOf` to derive the caller identity.
- **`@infrastructure/http/response.ts`** – Provides `successResponse` to build the JSON envelope.
- **`@infrastructure/i18n`** – Provides `t()` for the localised success message; `context.ts` supplies the request-scoped locale.
- **`@types`** – Defines the `ReservationSweepResponse` shape (`{ expired: number }`).

## Notes

- Audit granularity: the sweep is logged **once per run**, not per individual order. Per-order cancellation auditing lives on the orders' own cancel path. This is deliberate—see the module docblock.
- The handler is a single chained expression (no explicit `try/catch`); all error handling is delegated to `catchAs`.
- `successResponse` is typed with the generic `ReservationSweepResponse`, so the response body is `{ expired: number }` — no additional fields.
