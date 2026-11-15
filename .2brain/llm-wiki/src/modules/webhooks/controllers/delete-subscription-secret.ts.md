---
source: src/modules/webhooks/controllers/delete-subscription-secret.ts
sha256: 203693184f3b8dd00098f989d3812a2fbdc7407db33ffcf44a5d8a76f5fbfe0f
generated_at: 2026-11-14T22:41:07.389151+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/delete-subscription-secret.ts

## Purpose

Controller handler for `DELETE /webhooks/subscriptions/:id/secrets/:secretId`. It removes a single secret from a subscription's signing ring (the "other half" of a secret rotation) and returns `204` on success. It exists to give the HTTP layer a thin, tenant-scoped entry point into the webhooks service's ring-management logic.

## Key elements

- **`deleteWebhookSubscriptionSecret`** (exported) — Express handler accepting `Request<{ id: string; secretId: string }>` and `Response`. Validates the `id` param, extracts tenant/caller context, delegates to the webhooks service, then maps the result to `204`, a `refused` response, or a caught error.

## Relationships

- **`src/modules/webhooks/routes.ts`** — registers this handler on the `DELETE /webhooks/subscriptions/:id/secrets/:secretId` route.
- **`src/modules/webhooks/services/index.ts`** — provides the `webhooksService` instance that this controller calls to perform the ring mutation.
- **`src/infrastructure/http/controller.ts`** — provides `catchAs` (unified error formatting) and `refused` (standard 4xx mapping for rejected service results).
- **`src/infrastructure/http/ids.ts`** — `requireId` validates and extracts the `:id` param, short-circuiting with a 404 on failure.
- **`src/infrastructure/http/request.ts`** — `tenantCallerContextOf` builds the authz/audit context passed into the service call.
- **`src/infrastructure/http/response.ts`** — `noContentResponse` emits the `204` reply.

## Notes

- The `secretId` path param is **not** validated by `requireId`; only the subscription `id` is. An invalid `secretId` surfaces as a service-level 404 rather than a param-validation failure.
- A `refused` result (e.g., the ring would become empty) is mapped to a 422 by the `refused` helper — the controller itself contains no status-code literals.
- The function is async via promise chaining (`.then` / `.catch`) rather than `async/await`, consistent with the surrounding controller style.
