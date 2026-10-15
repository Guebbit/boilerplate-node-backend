---
source: src/modules/notifications/controllers/post-read-all.ts
sha256: bcbc4cb48a97a63b979b80910525684c1c29a60bed262c94cbf4e21136be87ad
generated_at: 2026-10-15T10:50:02.943047+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/controllers/post-read-all.ts

## Purpose

Thin HTTP adapter that exposes the `POST /notifications/read-all` endpoint. It extracts the authenticated user's ID from the request, delegates to the notifications service, and maps the result (or error) onto an Express response. Exists so route wiring stays decoupled from business logic.

## Key elements

- **`postReadAll(request, response)`** – The sole export. Calls `notificationsService.notificationsReadAll(request.authContext!.id)`, then either sends a 200 via `successResponse` (passing `result.data` and `result.message`) or routes the rejection through `catchAs(response, 'readAllNotifications')`.

## Relationships

- **`src/infrastructure/http/response.ts`** – Supplies `successResponse`, used to shape the 200 JSON reply.
- **`src/infrastructure/http/controller.ts`** – Supplies `catchAs`, the shared error-to-HTTP translator.
- **`src/modules/notifications/services/index.ts`** – Exports `notificationsService`, whose `notificationsReadAll` method contains the actual "mark all read" logic.
- **`src/modules/notifications/routes.ts`** – Imports `postReadAll` and registers it on the `POST /notifications/read-all` route (the entry point that makes this file reachable over HTTP).

## Notes

- `request.authContext!` uses a non-null assertion, assuming upstream auth middleware has already populated it; no guard is present here.
- The catch label is `'readAllNotifications'` (verb-noun), which differs from the export name `postReadAll`—search for the former when tracing error logs.
- Success returns **200** with a body (`data` + `message`), not a 204/empty body.
- Uses promise `.then/.catch` rather than `async/await`, consistent with the project's controller style.
