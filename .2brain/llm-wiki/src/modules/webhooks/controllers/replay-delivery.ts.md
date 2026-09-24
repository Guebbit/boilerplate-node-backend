---
source: src/modules/webhooks/controllers/replay-delivery.ts
sha256: 7d0e9cb18a41c8804e7ec34f23eba64b59329f29d6fc8b0c176a4958f2a6942b
generated_at: 2026-09-23T19:39:10.064609+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/replay-delivery.ts

## Purpose

Controller for `POST /webhooks/deliveries/:id/replay`. It re-sends a previously recorded webhook delivery synchronously against the subscription's **current** URL and secret ring (not the original ones at delivery time). Documented as the single most-requested support action in `docs/modules/webhooks.md`.

## Key elements

- **`replayWebhookDelivery(request, response)`** — the sole export. Validates the `:id` path param, delegates to the service, and shapes the HTTP response (success or refusal). No request body is read.

## Relationships

- **`@infrastructure/http/request`** — calls `extractAndValidateId` (coerces & validates the path param as an ObjectId) and `tenantCallerContextOf` (derives the tenant scope from the incoming request).
- **`@infrastructure/http/controller`** — calls `refused` (short-circuits when the service signals refusal) and `catchAs` (unifies error → HTTP mapping).
- **`@infrastructure/http/response`** — calls `successResponse` to serialize the `WebhookDelivery` payload.
- **`../services` (`webhooksService`)** — invokes `replayDelivery(id, callerContext)`; all business logic lives there.
- **`src/modules/webhooks/routes.ts`** — registers this handler on the `POST /webhooks/deliveries/:id/replay` path.
- **`@types`** — imports the `WebhookDelivery` type for the response shape.

## Notes

- **Params-only route.** Unlike the sibling `write` controller (params-then-body), this endpoint reads no request body.
- **ID is pre-validated.** `extractAndValidateId` rejects malformed ObjectIds before the service call, so `replayDelivery` cannot throw a `CastError`; the `.catch` handler only deals with genuine service failures.
- **Synchronous re-send.** The delivery is fired against the subscription's *current* URL and secret ring at replay time, not the values captured at the original delivery.
