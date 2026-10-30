---
source: src/modules/webhooks/controllers/update-subscription.ts
sha256: bd176b339ee64b513af246e295a8c2a5451de2bb246f8bd7f4bb74d20d458e69
generated_at: 2026-10-29T06:26:30.614000+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/update-subscription.ts

## Purpose

Defines the `PUT` (replace) and `PATCH` (merge) handlers for `/webhooks/subscriptions/:id` by composing the shared `createUpdateController` factory. Both verbs delegate to a single service method (`webhooksService.updateSubscription`) and render the response via `viewSubscription`, scoped to the tenant caller extracted from the request.

## Key elements

- **`replaceWebhookSubscription`** — Exported `PUT` handler. Validates the body against `ReplaceWebhookSubscriptionBody` (full replacement), then calls the service with the provided changes.
- **`updateWebhookSubscription`** — Exported `PATCH` handler. Validates the body against `UpdateWebhookSubscriptionBody` (partial merge), then calls the same service method.
- **`createUpdateController({ … })` call** — The single configuration block that wires both handlers: sets `versioned: false`, the entity label, the 404 error key (`generic.error-item-gone`), the two Zod schemas, the `update` callback, and the `present` (response-shaping) callback.

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** — Provides the `createUpdateController` factory; this file is its consumer. The factory returns the `{ replace, update }` pair destructured into the two exports.
- **`src/infrastructure/http/request.ts`** — Provides `tenantCallerContextOf`, used inside both the `update` and `present` callbacks to derive the caller identity passed to the service and view functions.
- **`src/modules/webhooks/services/index.ts`** — Exports `webhooksService`, whose `updateSubscription` method is the sole write path invoked by both handlers.
- **`src/modules/webhooks/services/actions.ts`** — Exports `viewSubscription`, the read-shaping function used in the `present` callback to format the response body for the given caller.
- **`src/modules/webhooks/routes.ts`** — Imports the two exports to attach them to the `PUT` and `PATCH` route definitions for the subscription resource.

## Notes

- Secret-ring operations (rotate, remove a secret) and the on/off toggle are intentionally **excluded** from these handlers; they live on separate action routes with their own controllers. Do not add those concerns here.
- `versioned: false` means the entity does not carry a version/ETag check in this controller — concurrency is handled (or not) at the service layer.
- Both verbs funnel through the *same* service method; the only difference is which Zod schema validates the incoming body (full vs. partial).
