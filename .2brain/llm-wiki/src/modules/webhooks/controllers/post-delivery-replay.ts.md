---
source: src/modules/webhooks/controllers/post-delivery-replay.ts
sha256: d7ebdc396870405ab25e7894a56b69af1d5ba5b87a0b2f0cef9808630931c82f
generated_at: 2026-11-08T09:01:29.019036+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/post-delivery-replay.ts

## Purpose

HTTP controller for `POST /webhooks/deliveries/:id/replay`. It re-sends a previously stored webhook delivery synchronously, targeting the subscription's *current* URL and secret ring rather than the original. Documented as the most-requested support action in the webhooks module.

## Key elements

- **`replayWebhookDelivery(request, response)`** — The sole export. Validates the `:id` param via `requireId` (malformed IDs short-circuit as a generic not-found before any DB access), then delegates to `webhooksService.replayDelivery(id, tenantContext)`. On success it returns the `WebhookDelivery` via `successResponse`; on refusal (`refused`) it exits early; on unexpected error it funnels through `catchAs`.

## Relationships

- **`src/modules/webhooks/routes.ts`** — Registers `replayWebhookDelivery` as the handler for the `POST /webhooks/deliveries/:id/replay` route.
- **`src/modules/webhooks/services/index.ts`** — Exports `webhooksService`, whose `replayDelivery` method performs the actual re-send.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs` (uniform error mapping) and `refused` (short-circuits rejected operations).
- **`src/infrastructure/http/ids.ts`** — Provides `requireId` for param validation with a `notFound` fallback message key.
- **`src/infrastructure/http/request.ts`** — Provides `tenantCallerContextOf` to extract the tenant identity from the incoming request.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for shaping the JSON 200 reply.
- **`src/types/index.ts`** — Supplies the `WebhookDelivery` type used as the response payload type parameter.

## Notes

- The delivery is replayed against the subscription's **current** URL and secret ring, not whatever values were present at original delivery time.
- `requireId` is called with `{ notFound: 'generic.error-item-gone' }`, so a syntactically invalid UUID yields a 404-equivalent rather than a 400 — intentional to avoid leaking format expectations.
- The handler is intentionally thin: all business logic (looking up the delivery, re-signing, HTTP send) lives in `webhooksService.replayDelivery`.
