---
source: src/modules/notifications/openapi.yaml
sha256: ea89e1bc33d6f757b657f37913ecd9f69043c7a551a353de3b535dcb6aed3afe
generated_at: 2026-11-08T06:32:20.227118+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the notifications module: the signed-in user's in-app inbox (personal notifications) and shop work notices for staff. It defines the REST endpoints, the SSE live stream, the schema variants for notification payloads, and the account-data-export section contributed by this module.

## Key elements

- **`/notifications` GET** (`listNotifications`) — returns the caller's full inbox (bounded by a per-user cap, never paginated) plus staff work notices the caller still holds permission for.
- **`/notifications` DELETE** (`dismissAllNotifications`) — hard-deletes all of the caller's notifications; optional `audience` query param limits the deletion to `own` or `staff`.
- **`/notifications/stream` GET** (`getNotificationsStream`) — Server-Sent Events endpoint delivering `notifications.created`, `notifications.deleted`, `notifications.read` events (payloads defined in `asyncapi.yaml`). Uses **cookie auth** because `EventSource` cannot set an `Authorization` header.
- **`/notifications/read-all` POST** (`readAllNotifications`) — sets `readAt` on every unread notification; idempotent.
- **`/notifications/{id}` GET / DELETE** — fetch or permanently delete a single notification; foreign/unknown/malformed ids all return the same 404.
- **`x-personal-data`** — declares the `notifications` and `staffNotifications` sections added to the `POST /account/export` response by the bundler.
- **`components/schemas`** — `NotificationSeverity` (enum: info/success/warning/error), `NotificationAudience` (own/staff), and per-code params schemas (`WebhookDisabledParams`, `TaskOpenedParams`, `TaskAssignedParams`, …) following a discriminated-union pattern where the client switches on `code` to get typed `params`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — every standard response (401, 403, 404, 422, 204) and the `IdPathParam` parameter are `$ref`-imported from this file; the `Id` type used in params schemas is also pulled from here.
- **`src/modules/observability/openapi.yaml`** — the SSE stream endpoint explicitly mirrors its per-process delivery model and its cookie-auth fallback on the observability module's `GET /observability/events` endpoint.

## Notes

- **Auth split:** all REST paths use `bearerAuth`; the stream path uses `cookieAuth` (HttpOnly refresh cookie) because the browser `EventSource` API cannot attach an `Authorization` header.
- **Per-process SSE:** a notification written by another worker process will *not* appear on an open stream; the client recovers via a fresh `GET /notifications` on reconnect.
- **Routing order:** the literal path `/notifications/stream` is mounted above the parameterised `/{id}` route so Express does not treat `stream` as an id.
- **No 404 on list:** an empty inbox is the same state as "no notifications yet"; the endpoint always returns 200 (or 401/403), never 404.
- **Staff visibility is permission-gated and time-bound:** a staff member sees only work notices written while their role was active; losing the role hides prior notices, gaining it does not retroactively show old ones.
- **Payloads are code + params, never rendered text:** the backend stores a `code` string and a typed `params` object; the frontend localises from its own locale files (same convention as the account module's `ReauthRequest`).
