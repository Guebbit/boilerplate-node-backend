# src/app/system-routes.ts

## Purpose
Defines a minimal Express router that exposes a single liveness/ping endpoint (`GET /`). It exists so that external monitors, load-balancers, or operators can confirm the process is alive without hitting any business-logic routes.

## Key elements
- **`router`** (exported `Router` instance) – the sole export; consumed by the parent routing layer.
- **`GET /`** – returns HTTP 200 with body `{ status: 'ok' }` and the message `"API is running"`. The handler is intentionally stateless (request param is unused).

## Relationships
- **`src/app/routes.ts`** – imports the exported `router` and mounts it into the application's route tree (e.g. `app.use('/system', router)` or similar), making the ping reachable at a top-level or sub-path URL.
- **`src/infrastructure/http/response.ts`** – provides the `successResponse` helper used here to serialize the standard success envelope (status code, data, message) so the response shape stays consistent with the rest of the API.

## Notes
- The route path is `/` *relative to wherever the router is mounted*; the absolute URL depends on how `routes.ts` wires it in.
- Because the handler ignores the request object entirely, it is safe behind rate-limiters or can be whitelisted for uptime checks.
