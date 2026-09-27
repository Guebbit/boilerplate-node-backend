---
source: src/modules/inventory/controllers/post-reservations-sweep.ts
sha256: 89eda1c9ec0e300f55f145cc4124eef451db12050a8cc909f7cdcfecea10fd11
generated_at: 2026-09-27T14:54:59.839453+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/post-reservations-sweep.ts

## Purpose

HTTP handler for `POST /inventory/reservations/sweep` — an on-demand trigger for the reservation-expiry sweep. It exists so operators or platform schedulers can invoke the sweep via HTTP; the actual recurring schedule (`npm run sweep:reservations` / crontab) calls the service directly and never hits this route.

## Key elements

- **`postReservationsSweep`** (exported) — Express handler. Calls `inventoryService.runReservationSweep(callerContextOf(request))`, responds 200 with a `ReservationSweepResponse` body (`{ expired }`) and the i18n message `inventory.sweep-success`. Errors are delegated to `catchAs`.

## Relationships

- **`src/modules/inventory/service.ts`** — calls `inventoryService.runReservationSweep()`, the sole business logic this file invokes.
- **`src/modules/inventory/routes.ts`** — mounts this handler at the `/inventory/reservations/sweep` route.
- **`src/infrastructure/http/controller.ts`** — supplies `catchAs` for uniform error serialization.
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf` to extract the authenticated caller's identity for audit/authorization inside the service call.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` to shape the JSON envelope.
- **`src/infrastructure/i18n/index.ts`** / **`context.ts`** — supplies `t()` to resolve the localized success message (`inventory.sweep-success`).
- **`src/types/index.ts`** — defines the `ReservationSweepResponse` shape returned to the caller.

## Notes

- The file's doc comment stresses that the crontab job **never** reaches this endpoint; this route is strictly for on-demand/manual invocation.
- Auditing is per-run (one record), not per-expired-order. Per-order audit records are produced by each order's own cancel path, so an operator can trace *why* a specific order was cancelled.
- The handler is a thin passthrough: no validation, no status-code branching beyond the single 200 success. All logic lives in `inventoryService.runReservationSweep`.
