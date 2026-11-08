---
source: src/modules/webhooks/controllers/post-subscription.ts
sha256: 06c68493a167539f66f8beb14930ec1bdb4a26e43df9d1f13cf1c2b8dac32494
generated_at: 2026-11-08T09:02:05.737790+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/post-subscription.ts

## Purpose

Single-purpose controller handler for `POST /webhooks/subscriptions`. Parses the request body against the generated Zod schema, delegates to the webhooks service, and returns a `201 Created` response containing the subscription (projected) plus the one-time `secret`.

## Key elements

- **`createWebhookSubscription`** (exported) — The sole export. Accepts Express `Request`/`Response`, validates the body with `CreateWebhookSubscriptionBody`, extracts tenant/caller context, calls `webhooksService.createSubscription`, and either returns `201` with the projected subscription + secret, a `4xx` via `refused`, or a standard error via `catchAs`.
- **`viewSubscription`** (imported from `../services/actions`) — Projects the raw subscription into the caller-facing shape before it is serialized in the response.

## Relationships

- **`@infrastructure/http/controller`** — Provides the shared handler utilities used here: `parseBody` (schema validation), `refused` (rejects with 4xx when the service returns a refusal), and `catchAs` (maps thrown/rejected errors to a JSON error response).
- **`@infrastructure/http/request`** — `tenantCallerContextOf` extracts the authenticated tenant and caller from the request headers.
- **`@infrastructure/http/response`** — `createdResponse` sends the `201` status, `Location` header, and body.
- **`../services`** — `webhooksService.createSubscription` performs the actual persistence/registration work.
- **`../services/actions`** — `viewSubscription` shapes the stored subscription for the response.
- **`@types`** — `CreateWebhookSubscriptionRequest` types the request body; `WebhookSubscriptionCreated` types the response payload.
- **`src/modules/webhooks/routes.ts`** — Registers this handler at the `POST /webhooks/subscriptions` route.

## Notes

- The `secret` appears **only** in this creation response. Subsequent reads (e.g. via `viewSubscription` in GET handlers) do not include it.
- URL `https://` enforcement is done twice: at creation by the schema's `pattern`, and again on every delivery against the **resolved IP** (see `@infrastructure/adapters/ssrf-guard.ts`), because DNS can change after the subscription is stored.
- The handler uses a `.then`/`.catch` promise chain rather than `async`/`await`, consistent with the rest of the controller layer.
