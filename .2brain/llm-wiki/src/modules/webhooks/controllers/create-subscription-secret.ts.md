---
source: src/modules/webhooks/controllers/create-subscription-secret.ts
sha256: ba5ad7c7656650723bca81332c11b5834b1af7879d5da3d12c7d4ef20ccbe50d
generated_at: 2026-10-29T06:24:54.110018+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/create-subscription-secret.ts

## Purpose

HTTP controller that handles `POST /webhooks/subscriptions/:id/secrets`. It mints a new ring secret for an existing webhook subscription and returns the plaintext secret exactly once (`newSecret`) alongside the subscription view. The previously active secret remains valid until it is explicitly revoked via `DELETE .../secrets/:secretId`.

## Key elements

- **`createWebhookSubscriptionSecret`** (exported function) — The sole route handler. Accepts Express `Request<{ id: string }>` / `Response`.
  1. Resolves the subscription `id` from route params via `requireId`; aborts with `generic.error-item-gone` if missing.
  2. Derives tenant context via `tenantCallerContextOf`.
  3. Delegates to `webhooksService.createSubscriptionSecret(id, context)`.
  4. On success, responds with `successResponse` containing the spread of `viewSubscription(subscription, caller)` plus the `newSecret` string.
  5. Handles service-level refusals with `refused` and unexpected errors with `catchAs`.

## Relationships

- **`src/infrastructure/http/ids.ts`** — `requireId` validates and extracts the `:id` route parameter.
- **`src/infrastructure/http/request.ts`** — `tenantCallerContextOf` builds the tenant-scoped caller context from the request.
- **`src/infrastructure/http/response.ts`** — `successResponse` formats the 200 JSON envelope.
- **`src/infrastructure/http/controller.ts`** — `catchAs` converts thrown errors to a standard error response; `refused` short-circuits when the service returns a refusal (e.g. cross-tenant access).
- **`src/types/index.ts`** — Provides the `WebhookSubscriptionCreated` type that shapes the response payload.
- **`src/modules/webhooks/services/index.ts`** — Exports `webhooksService`, whose `createSubscriptionSecret` performs the actual secret-minting logic.
- **`src/modules/webhooks/services/actions.ts`** — `viewSubscription` projects the subscription entity into the shape safe for the requesting tenant/caller.
- **`src/modules/webhooks/routes.ts`** — Registers this handler on the `POST /webhooks/subscriptions/:id/secrets` route.

## Notes

- The plaintext secret is delivered **only in this one response**; it is not stored in retrievable form afterward. Clients must persist it immediately.
- Creating a new secret does **not** invalidate the old one — rotation is a two-step process (create → delete old).
- The response type is `WebhookSubscriptionCreated`, which extends the standard subscription view with the extra `newSecret` field.
- The controller follows the project's promise-chain style (`.then`/`.catch`) rather than `async/await`, consistent with sibling controllers.
