---
source: src/modules/webhooks/controllers/post-subscription.ts
sha256: c8ee94995d520dbdf83727f2092425af90429e55947c6f2610351e78dd0d85f0
generated_at: 2026-11-14T22:42:30.457108+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/post-subscription.ts

## Purpose

HTTP controller for `POST /webhooks/subscriptions`. Parses and validates the incoming body, delegates subscription creation to the webhooks service, and emits a `201 Created` response carrying the new subscription plus its one-time secret.

## Key elements

- **`createWebhookSubscription`** (exported) – The sole handler. Steps:
  1. `parseBody` validates the raw body against the `CreateWebhookSubscriptionBody` Zod schema; short-circuits with an error response if invalid.
  2. `tenantCallerContextOf` extracts the authenticated tenant/caller identity.
  3. Calls `webhooksService.createSubscription(body, context)`.
  4. On success: shapes the record via `viewSubscription`, constructs the `location` path (`/webhooks/subscriptions/{id}`), writes the resource answer (`answerAsResource`), and sends `createdResponse` with `{ ...subscription, secret }`.
  5. On service-level rejection: `refused` writes the appropriate error status.
  6. On unexpected error: `catchAs` maps the thrown value to a structured error response.

## Relationships

- **`src/modules/webhooks/routes.ts`** – Registers this handler for the `POST /webhooks/subscriptions` route.
- **`src/modules/webhooks/services/index.ts`** – Exports `webhooksService`, whose `createSubscription` method this controller invokes for the business logic.
- **`src/modules/webhooks/services/actions.ts`** – Provides `viewSubscription`, which filters/shapes the persisted subscription into the caller-facing representation.
- **`src/infrastructure/http/controller.ts`** – Supplies `parseBody`, `refused`, and `catchAs` (shared request-validation / error helpers).
- **`src/infrastructure/http/request.ts`** – Supplies `tenantCallerContextOf` (identity extraction).
- **`src/infrastructure/http/response.ts`** – Supplies `createdResponse` (201 response builder).
- **`src/infrastructure/http/preconditions.ts`** – Supplies `answerAsResource` (writes the resource-answer header).
- **`src/types/index.ts`** – Source of the `CreateWebhookSubscriptionRequest` and `WebhookSubscriptionCreated` types used in the handler signature and response payload.

## Notes

- The **one-time `secret`** appears only in the `201` body (`result.data.secret` spread into the payload). The resource answer written by `answerAsResource` intentionally excludes it, so the secret is returned exactly once.
- The `location` path is `/webhooks/subscriptions/{id}`; the `id` comes from the *viewed* representation (`viewSubscription` output), not the raw stored record.
- URL safety: the `https://` prefix is enforced by the Zod schema at creation time, but the SSRF guard re-resolves and re-validates the target IP on **every** delivery attempt (see `@infrastructure/adapters/ssrf-guard.ts`). This means a subscription whose DNS changes after creation will be re-checked.
