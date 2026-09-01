# src/modules/delivery/controllers/post-courier-advance.ts

## Purpose

Handles the `POST /delivery/advance` admin endpoint. Because this repository deliberately has no scheduler, an operator (or a demo admin button) acts as the cron job: calling this endpoint simulates one courier "tick," advancing every parcel currently on a truck to its destination.

## Key elements

- **`postCourierAdvance(request, response)`** (exported) — The sole export. Extracts the caller context via `callerContextOf`, delegates to `deliveryService.runCourierAdvance(ctx)`, then returns the `advanced` count in a `successResponse`. Errors are routed through `catchAs(response, 'postCourierAdvance')`.

## Relationships

- **`src/modules/delivery/service.ts`** — Calls `deliveryService.runCourierAdvance()`; all domain logic (marking parcels as delivered, updating state) lives in the service.
- **`src/modules/delivery/routes.ts`** — Wires this handler to the `POST /delivery/advance` path.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, the shared error-serialization helper used here.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, the standard JSON-success envelope.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, which pulls the authenticated caller's context off the Express request.

## Notes

- This is an **admin-gated** endpoint (the comment references the same admin pattern as the token-cleanup endpoint). There is no in-process timer or queue worker; the endpoint *is* the scheduler.
- The JSDoc `@module` tag and the route comment are the canonical source of intent; the implementation is a thin pass-through with no branching logic.
- `advanced` in the response is whatever the service resolves to (expected to be a count), but the controller does not shape or validate it.
