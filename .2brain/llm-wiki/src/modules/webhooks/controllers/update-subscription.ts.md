---
source: src/modules/webhooks/controllers/update-subscription.ts
sha256: bd176b339ee64b513af246e295a8c2a5451de2bb246f8bd7f4bb74d20d458e69
generated_at: 2026-11-08T09:02:13.655388+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/update-subscription.ts

## Purpose

Builds the `PUT /webhooks/subscriptions/:id` (full replace) and `PATCH .../:id` (partial merge) handlers for webhook subscriptions. It delegates to the shared `createUpdateController` factory so both verbs share validation, 404 handling, and response-shaping logic, while the actual write goes through `webhooksService.updateSubscription`.

## Key elements

- **`replaceWebhookSubscription`** — handler for `PUT`; validates the body against `ReplaceWebhookSubscriptionBody` and passes the full change set to the service.
- **`updateWebhookSubscription`** — handler for `PATCH`; validates the body against `UpdateWebhookSubscriptionBody` and passes a partial change set.
- **`createUpdateController(...)` call** — the single factory invocation that produces both handlers. Configured with `versioned: false`, entity name `'webhookSubscription'`, not-found key `'generic.error-item-gone'`, and the two Zod schemas.
- **`update` callback** — forwards `(id, changes, request)` to `webhooksService.updateSubscription`, deriving tenant context via `tenantCallerContextOf(request)`.
- **`present` callback** — shapes the response by calling `viewSubscription(subscription, caller)`.

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** — provides the `createUpdateController` factory that generates the PUT/PATCH handler pair from the config object in this file.
- **`src/infrastructure/http/request.ts`** — provides `tenantCallerContextOf`, used to extract the tenant-scoped caller context from the incoming request for both the service call and the view function.
- **`src/modules/webhooks/services/index.ts`** — re-exports `webhooksService`, whose `updateSubscription` method performs the actual write.
- **`src/modules/webhooks/services/actions.ts`** — exports `viewSubscription`, used to project the stored record into the API response shape.
- **`src/modules/webhooks/routes.ts`** — the route table that wires `replaceWebhookSubscription` / `updateWebhookSubscription` to their respective HTTP method + path.

## Notes

- Neither verb may mutate the secret ring or the enabled/disabled flag. Those concerns are intentionally isolated to dedicated action routes (rotate-secret, remove-secret, enable, disable), each with its own controller. Passing a secret or `enabled` field in the body is out of scope here.
- The controller is **not versioned** (`versioned: false`), meaning it does not participate in any versioned-route prefix.
