---
source: src/modules/notifications/controllers/delete-notifications.ts
sha256: 5e8aae6bb753e8f27d6327382e806c3cd0d6bc73f6b7192a3028ac177fbfbf41
generated_at: 2026-11-08T06:30:30.107781+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/controllers/delete-notifications.ts

## Purpose
Thin HTTP adapter that handles the `DELETE /notifications` endpoint, delegating to `notificationsService.dismissAll` to remove all of the caller's notifications (optionally scoped to a single `audience`). It exists to keep route wiring in `routes.ts` decoupled from the service layer.

## Key elements
- **`deleteNotifications`** (exported function) — Express handler. Parses `request.query` against `DismissAllNotificationsQueryParams`, calls `notificationsService.dismissAll(userId, audience)`, and responds `204 No Content` on success.

## Relationships
- **`src/infrastructure/http/controller.ts`** — Imports `parseBody` (validates query against a Zod schema, short-circuits the handler on failure) and `catchAs` (standardises error serialisation for the `dismissAll` call).
- **`src/infrastructure/http/response.ts`** — Imports `noContentResponse` to send the `204` response.
- **`src/modules/notifications/services/index.ts`** — Imports `notificationsService`; the sole business-logic call in this file is `dismissAll`.
- **`src/modules/notifications/routes.ts`** — The route file that binds `deleteNotifications` to `DELETE /notifications` (this file is the controller target).

## Notes
- Despite the name `deleteNotifications`, the underlying operation is a *dismiss*, not a hard delete — the service method is `dismissAll`.
- The function reads `request.query` (not `request.body`) via `parseBody`, so clients must pass `audience` as a query parameter.
- `request.authContext!.id` is asserted non-null; the route is expected to sit behind an auth middleware that populates `authContext`.
- The handler is fire-and-forget on the promise chain (`.then` / `.catch`); no `async`/`await` is used, which is the convention for this codebase's controllers.
