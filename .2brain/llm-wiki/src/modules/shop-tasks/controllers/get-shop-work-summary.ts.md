---
source: src/modules/shop-tasks/controllers/get-shop-work-summary.ts
sha256: 16b6c64459f209fbceb752d3d73a3db86b664f3c61480a59b7c97a51b69da3a4
generated_at: 2026-11-08T08:14:11.617201+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/controllers/get-shop-work-summary.ts

## Purpose

Thin HTTP controller that handles `GET /shop-tasks/summary`. It retrieves aggregate work counts (used for staff navigation badges) from the `workSummary` service and returns them as a JSON success response. All business logic lives in the service; this file only bridges the request to the response.

## Key elements

- **`getShopWorkSummary`** (exported const) — The sole handler for `GET /shop-tasks/summary`. Reads `request.authContext` (populated by a preceding `isAuth` middleware), passes it to `workSummary()`, and on success writes the counts to the response with status 200. Failures are delegated to `catchAs`.

## Relationships

- **`src/modules/shop-tasks/services/work-summary.ts`** — Consumes the `workSummary` service; the controller is the only caller in the module.
- **`src/infrastructure/http/response.ts`** — Uses `successResponse` to shape the JSON body and set the status code.
- **`src/infrastructure/http/controller.ts`** — Uses `catchAs` as the unified error handler (logs, maps status, writes the error envelope).
- **`src/modules/shop-tasks/routes.ts`** — Registers `getShopWorkSummary` as the handler for the `/summary` route (staff-scoped).

## Notes

- `request.authContext` is asserted non-null (`!`). This is safe **only** if the route is mounted behind the `isAuth` middleware; adding this handler to an unauthenticated route will throw at runtime.
- The controller is intentionally a one-liner: no validation, no branching. Add business rules to `workSummary` service, not here.
- Error handling is fully delegated to `catchAs` — there is no local `try/catch` or status-code logic in this file.
