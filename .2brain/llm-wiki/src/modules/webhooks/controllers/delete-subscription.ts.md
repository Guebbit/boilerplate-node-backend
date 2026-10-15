---
source: src/modules/webhooks/controllers/delete-subscription.ts
sha256: b2bf898e6a7b63a6e6768f03cc6eca9ab63b5f1523a0aa8816138169d564413f
generated_at: 2026-10-15T12:17:59.076610+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/delete-subscription.ts

## Purpose

Hand-written Express handler for `DELETE /webhooks/subscriptions/:id`. It permanently removes a single webhook subscription (its delivery log is intentionally left in place). It bypasses the `createDeleteController` factory because that factory is designed for soft/hard delete triplets, and this module only performs a permanent delete.

## Key elements

- **`deleteWebhookSubscription`** (exported) — The sole route handler. Accepts `(request, response)`, validates the `:id` param, delegates to `webhooksService.removeSubscription`, and writes the HTTP response (200 on success, 404/403 on refusal or malformed id).
- **`requireId`** — Validates the path-parameter id *before* any database call; a malformed id short-circuits with a generic 404 response.
- **`refused`** — Inspects the service result and, if the operation was denied, sends the appropriate refusal response and halts the chain.
- **`successResponse`** — Emits a 200 JSON body carrying `result.message` on successful deletion.
- **`catchAs(response, 'deleteWebhookSubscription')`** — Terminal `.catch` handler that translates thrown errors into the standard error envelope, tagged with the handler name for logging.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Source of `catchAs` and `refused`, the two utility helpers for error translation and refusal handling.
- **`src/infrastructure/http/ids.ts`** — Provides `requireId`, which parses/validates the `:id` path parameter.
- **`src/infrastructure/http/request.ts`** — Provides `tenantCallerContextOf`, extracting tenant and caller context from the request for the service call.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, the shared helper for emitting 200 JSON responses.
- **`src/modules/webhooks/services/index.ts`** — Exports `webhooksService`; its `removeSubscription(id, ctx)` method performs the actual deletion.
- **`src/modules/webhooks/routes.ts`** — Registers this handler on the `DELETE /webhooks/subscriptions/:id` route.

## Notes

- Deliberately **not** built on `createDeleteController`; that factory assumes a soft/hard pair, which doesn't apply here.
- A malformed id returns **404** (treated as "unknown"), not 400, so the API doesn't reveal id format to callers.
- Success returns **200** (not 204) with a message body, matching the convention of other webhook endpoints.
