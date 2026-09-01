# src/app/system-routes.ts

## Purpose

Defines system-level HTTP routes that concern the process itself rather than any domain module. Currently it exposes only the root ping endpoint, serving as a liveness check that the API is up. It lives outside `src/modules` because it has no business-logic owner.

## Key elements

- **`router`** (exported) — An Express `Router` instance. `app/routes.ts` mounts it at the application root (`/`).
- **`GET /`** — Returns `200` with body `{ status: "ok" }` and the message `"API is running"`, confirming the process is alive.

## Relationships

- **`src/app/routes.ts`** — The sole consumer of this file's `router` export; it mounts it at `/`.
- **`src/infrastructure/http/response.ts`** — Provides the `successResponse` helper used to shape the ping reply (status code, body, and message in one call).

## Notes

- The module docblock mentions "contract/docs endpoints" as a future or sibling concern mounted alongside this router, but no such routes are defined in this file yet.
- The handler ignores the request object (prefixed `_request`) and always returns the same static payload—there is no conditional logic.
