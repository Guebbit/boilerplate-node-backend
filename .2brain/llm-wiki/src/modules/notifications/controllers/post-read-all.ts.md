---
source: src/modules/notifications/controllers/post-read-all.ts
sha256: d4e2cef195219ce10874cc22cbca8310f1250b79334c58c8196f18b91042b044
generated_at: 2026-11-08T06:31:01.879932+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/controllers/post-read-all.ts

## Purpose

Thin HTTP adapter that handles `POST /notifications/read-all`. It extracts the caller's ID from the authenticated request, delegates the "mark all read" work to `notificationsService.readAll`, and returns a 204 No Content on success or a structured error on failure.

## Key elements

- **`postReadAll(request, response)`** (exported const) — Express handler for `POST /notifications/read-all`. Reads `request.authContext!.id`, calls `notificationsService.readAll(id)`, then either sends a 204 via `noContentResponse` or routes the rejection through `catchAs(response, 'readAllNotifications')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs`, the shared error-catch helper that formats and sends the HTTP error response.
- **`src/infrastructure/http/response.ts`** — Supplies `noContentResponse`, which writes the 204 (no body) success response.
- **`src/modules/notifications/services/index.ts`** — Source of `notificationsService`; the controller's sole business-logic dependency (specifically the `readAll` method).
- **`src/modules/notifications/routes.ts`** — Wires `postReadAll` to the `POST /notifications/read-all` route.

## Notes

- The `authContext` is accessed with a non-null assertion (`!`); the file assumes upstream middleware has already guaranteed authentication. No local guard or 401 path exists here.
- The function returns the Promise chain (`.then().catch()`) rather than using `async/await`, matching the convention in the surrounding controller layer.
- No request body or query params are read — the operation is purely derived from the authenticated user identity.
