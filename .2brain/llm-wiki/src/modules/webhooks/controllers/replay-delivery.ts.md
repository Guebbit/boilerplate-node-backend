---
source: src/modules/webhooks/controllers/replay-delivery.ts
sha256: d7ebdc396870405ab25e7894a56b69af1d5ba5b87a0b2f0cef9808630931c82f
generated_at: 2026-10-29T06:26:22.153597+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/replay-delivery.ts

## Purpose
Controller handler for `POST /webhooks/deliveries/:id/replay`. Validates the delivery ID, delegates to the webhooks service for a synchronous re-send against the subscription's current URL and secret ring, and shapes the HTTP response. Exists as the thin HTTP edge of the replay flow — the most-requested support action per `docs/modules/webhooks.md`.

## Key elements
- **`replayWebhookDelivery`** (exported) — Express handler. Pipeline: `requireId` → `webhooksService.replayDelivery(id, tenantContext)` → `refused` / `successResponse` → `catchAs` fallback. No local business logic; all domain work lives in the service.

## Relationships
- **`src/modules/webhooks/services/index.ts`** — calls `webhooksService.replayDelivery`; the sole business-logic dependency.
- **`src/modules/webhooks/routes.ts`** — mounts this handler on the `POST /webhooks/deliveries/:id/replay` route.
- **`src/infrastructure/http/ids.ts`** — `requireId` validates the `:id` param; a malformed ID short-circuits with `generic.error-item-gone` before any DB access.
- **`src/infrastructure/http/request.ts`** — `tenantCallerContextOf` extracts the tenant/caller context passed into the service call.
- **`src/infrastructure/http/controller.ts`** — `refused` detects service-level rejections (e.g., no active subscription); `catchAs` maps unhandled errors to a structured error response.
- **`src/infrastructure/http/response.ts`** — `successResponse` wraps `WebhookDelivery` data in the standard success envelope.
- **`src/types/index.ts`** — `WebhookDelivery` type constrains the `data` field in the success response.

## Notes
- The replay always targets the subscription's **current** URL and secret ring, not the values stored at the time of the original delivery.
- ID validation is intentionally before the service call: a malformed `:id` produces a 404-equivalent without a database round-trip.
- The `refused` check runs *before* the success path, so a rejected replay never returns a 200 with `data`.
- Error-tag string passed to `catchAs` is `'replayWebhookDelivery'`, usable for log correlation.
