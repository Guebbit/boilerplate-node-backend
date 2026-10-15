---
source: src/modules/webhooks/controllers/replay-delivery.ts
sha256: 7e6e6ad7236e76dfa06e1d648ff9f2da68ba9deb7ec5a06764fecbcd21160b71
generated_at: 2026-10-15T12:18:18.844434+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/replay-delivery.ts

## Purpose

Thin HTTP controller for `POST /webhooks/deliveries/:id/replay`. It validates the delivery ID, delegates the re-send to the webhooks service, and shapes the response. Documented in `docs/modules/webhooks.md` as the single most-requested support action.

## Key elements

- **`replayWebhookDelivery(request, response)`** — the sole export. Validates the `:id` param via `requireId`, calls `webhooksService.replayDelivery(id, tenantCtx)`, then either rejects (via `refused`) or returns a `successResponse` containing the presented `WebhookDelivery`. Errors fall through to `catchAs`.

## Relationships

- **`src/modules/webhooks/services/index.ts`** — calls `webhooksService.replayDelivery` to perform the actual re-send.
- **`src/modules/webhooks/presenters.ts`** — calls `presentWebhookDelivery` to shape the service's raw data into the API response payload.
- **`src/modules/webhooks/routes.ts`** — registers `replayWebhookDelivery` as the handler for the replay route.
- **`src/infrastructure/http/controller.ts`** — imports `catchAs` (error-to-response mapping) and `refused` (rejection short-circuit).
- **`src/infrastructure/http/ids.ts`** — imports `requireId` for ID validation.
- **`src/infrastructure/http/request.ts`** — imports `tenantCallerContextOf` to extract tenant context for the service call.
- **`src/infrastructure/http/response.ts`** — imports `successResponse` to emit the final 200 body.
- **`src/types/index.ts`** — imports the `WebhookDelivery` type used in the response generic.

## Notes

- A **malformed** ID is deliberately answered as **404 Not Found** (not 400), per the inline comment: it is treated as "an unknown one" before the database is consulted.
- The replay targets the subscription's **current** URL and secret ring, not the values captured at the time of the original delivery.
- The function is synchronous with respect to the HTTP request/response cycle (`.then`/`.catch` chain), not fire-and-forget.
