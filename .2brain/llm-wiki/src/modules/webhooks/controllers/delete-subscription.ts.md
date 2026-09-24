---
source: src/modules/webhooks/controllers/delete-subscription.ts
sha256: 45b04c67543973960a0ac342d8e0c4f9ee72caac6b0b93bf7e78c1b870f26807
generated_at: 2026-09-23T19:38:38.609288+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/delete-subscription.ts

## Purpose

Handles `DELETE /webhooks/subscriptions/:id`. It permanently removes a webhook subscription (delivery log is left in place). Hand-written rather than built on `createDeleteController`, which is designed for the soft/hard delete triplet and doesn't fit this single-permanent-delete use case.

## Key elements

- **`deleteWebhookSubscription`** (exported) — Express handler. Extracts and validates the `:id` path param as a well-formed ObjectId, delegates to `webhooksService.removeSubscription` with tenant caller context, then responds with `successResponse` (200) or early-returns on refusal/catch.

## Relationships

- **`@infrastructure/http/controller`** — Provides `catchAs` (uniform error mapping) and `refused` (short-circuit on denied results).
- **`@infrastructure/http/request`** — Provides `extractAndValidateId` (ObjectId validation, early-exit on failure) and `tenantCallerContextOf` (tenant scope for the service call).
- **`@infrastructure/http/response`** — Provides `successResponse` for the 200 reply.
- **`../services` (webhooksService)** — The domain service whose `removeSubscription(id, tenantCtx)` performs the actual deletion.
- **`../routes`** — Registers this handler on the `DELETE /webhooks/subscriptions/:id` route.

## Notes

- The route is **params-only** (no body), unlike the `write` handler's params-then-body shape.
- Because `extractAndValidateId` guarantees a well-formed ObjectId before the service call, `removeSubscription` will never raise a CastError; no not-found mapping is needed in the `.catch`.
- The JSDoc explicitly documents why this file is not generated via the factory — future contributors should not "refactor" it into `createDeleteController` without re-evaluating the soft/hard triplet assumption.
