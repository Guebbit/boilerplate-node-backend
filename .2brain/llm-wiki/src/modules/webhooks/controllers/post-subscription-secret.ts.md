---
source: src/modules/webhooks/controllers/post-subscription-secret.ts
sha256: b7e28f1d1fcf68dc7d78560b95bec51ce77fe313e2c460570c6061dc73ad53f7
generated_at: 2026-11-14T22:42:06.190223+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/post-subscription-secret.ts

## Purpose

HTTP controller for `POST /webhooks/subscriptions/:id/secrets`. It mints a new ring secret for a webhook subscription and returns the plaintext secret exactly once in the response body. The previous secret remains active until explicitly revoked via `DELETE .../secrets/:secretId`.

## Key elements

- **`createWebhookSubscriptionSecret(request, response)`** (exported) – The sole handler. Validates the `:id` param, builds the tenant/caller context, delegates to `webhooksService.createSubscriptionSecret`, then composes the response (subscription view + one-time `newSecret`).
- **`requireId`** – Extracts and validates the `:id` route param; short-circuits with `410 Gone` if missing.
- **`viewSubscription`** – Shapes the raw subscription entity into a caller-scoped view before it goes into the response.
- **`refused` / `catchAs`** – Standard error paths: `refused` handles a rejected promise result; `catchAs` maps unexpected throws to a structured error response.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/controller.ts` | Imports `catchAs` and `refused` for error handling. |
| `src/infrastructure/http/ids.ts` | Imports `requireId` to read/validate the `:id` param. |
| `src/infrastructure/http/preconditions.ts` | Imports `answerAsResource` to set resource-related headers (Location, ETag) on the response. |
| `src/infrastructure/http/request.ts` | Imports `tenantCallerContextOf` to derive the tenant/caller context. |
| `src/infrastructure/http/response.ts` | Imports `successResponse` to send the final `201`-style body. |
| `src/modules/webhooks/services/index.ts` | Imports `webhooksService` – the service that performs the actual secret creation. |
| `src/modules/webhooks/services/actions.ts` | Imports `viewSubscription` to project the subscription for the response. |
| `src/types/index.ts` | Imports the `WebhookSubscriptionCreated` type used as the response payload shape. |
| `src/modules/webhooks/routes.ts` | Registers this handler on the `POST /webhooks/subscriptions/:id/secrets` route (consumer side). |

## Notes

- The plaintext secret (`result.data.newSecret`) is included **only** in this one-time response; it is not persisted in readable form.
- `answerAsResource` is called *before* `successResponse` to set the resource-related headers (Location, ETag, etc.) on the subscription object, while `successResponse` writes the JSON body. Both mutate the same `Response` object.
- The subscription id is typed as `string` in the Express route params, but the service layer is responsible for casting/validation — the controller does not.
