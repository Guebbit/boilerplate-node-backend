---
source: src/modules/webhooks/controllers/update-subscription.ts
sha256: 7bab9a5adf3890b8d681a505e7eed2ebb409961169382811cfdf27fbb43d7666
generated_at: 2026-09-23T19:39:20.799141+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/update-subscription.ts

## Purpose

Controller handler for `PATCH /webhooks/subscriptions/:id`. Accepts a partial-update body (including the `rotateSecret` and `removeSecretId` secret-ring actions), delegates to the webhooks service, and returns the updated subscription along with a `newSecret` when a rotation occurred.

## Key elements

- **`updateWebhookSubscription`** (exported function) — The sole export and the only route handler in this file. Steps:
    1. Extracts and validates the `:id` param via `extractAndValidateId`.
    2. Parses `request.body` against the `UpdateWebhookSubscriptionBody` Zod schema (`parseBody`).
    3. Calls `webhooksService.updateSubscription(id, body, tenantCallerContextOf(request))`.
    4. On success, maps `result.data.subscription.toJSON()` plus `result.data.newSecret` into a `successResponse<WebhookSubscriptionCreated>`.
    5. On rejection (`refused`) or error, short-circuits or delegates to `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** — Provides the three guard helpers used here: `parseBody` (Zod validation), `refused` (service-level denial short-circuit), and `catchAs` (uniform error formatting + logging).
- **`@infrastructure/http/request`** — `extractAndValidateId` validates the `:id` param (UUID format) and `tenantCallerContextOf` builds the tenant-scoped caller context passed to the service.
- **`@infrastructure/http/response`** — `successResponse` serialises the final JSON envelope.
- **`../services` (webhooks service)** — The single business-logic call (`updateSubscription`). All domain rules (partial merge, secret rotation overlap, `https://` URL enforcement) live there or in the Zod schema; this controller contains none.
- **`@types`** — Types the request body (`UpdateWebhookSubscriptionRequest`) and the success payload (`WebhookSubscriptionCreated`).
- **`src/modules/webhooks/routes.ts`** — Registers this handler for the `PATCH /webhooks/subscriptions/:id` route (the natural consumer of this export).

## Notes

- The `https://` scheme restriction on the `url` field is **not** checked in this file; it is enforced by the `pattern` in the generated Zod schema (`UpdateWebhookSubscriptionBody`) and only applies when `url` is actually present in the request body.
- `newSecret` is an **additional** field in the response, not part of `WebhookSubscriptionCreated` itself — it is spread alongside the subscription JSON. It will be `undefined` on non-rotation updates.
- The rotation-overlap semantics (old secret remains valid for a grace window) are documented in `openapi.yaml`, not in code here.
- Like its sibling `create-subscription.ts`, this handler returns `undefined` (not a thrown error) after a failed guard check; the guards themselves have already sent the HTTP error response.
