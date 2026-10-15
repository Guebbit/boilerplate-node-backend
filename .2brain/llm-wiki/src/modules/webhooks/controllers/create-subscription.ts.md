---
source: src/modules/webhooks/controllers/create-subscription.ts
sha256: ee85b091137b7ee72ed97daf14311db76087d29acfc13e97ae8c4139dc727193
generated_at: 2026-10-15T12:17:49.333248+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/create-subscription.ts

## Purpose

Express route handler for `POST /webhooks/subscriptions`. It validates the request body against the generated Zod schema, delegates creation to `webhooksService`, and returns a **201** with the created subscription plus its one-time delivery secret.

## Key elements

- **`createWebhookSubscription(request, response)`** – The sole export. Parses the body with `parseBody`, calls `webhooksService.createSubscription(body, tenantContext)`, then either short-circuits on a refused result or builds a `createdResponse` containing the presented subscription spread with `result.data.secret` and the location URI `/webhooks/subscriptions/:id`.

## Relationships

- **`@infrastructure/http/controller`** – Provides the `parseBody`, `refused`, and `catchAs` helpers that structure validation, domain-rejection, and error handling.
- **`@infrastructure/http/request`** – `tenantCallerContextOf` extracts the tenant identity from the incoming request and passes it into the service call.
- **`@infrastructure/http/response`** – `createdResponse` produces the final 201 JSON + `Location` header.
- **`../services`** – `webhooksService.createSubscription` performs the actual domain work; the controller is a thin adapter.
- **`../presenters`** – `presentWebhookSubscription` maps the internal subscription shape to the public API shape.
- **`@types`** – `CreateWebhookSubscriptionRequest` and `WebhookSubscriptionCreated` constrain the request/response generics.
- **`routes.ts`** – Registers this handler on the `POST /webhooks/subscriptions` path.

## Notes

- The delivery `url` is checked twice: a `https://` pattern in the Zod schema at creation time, and an SSRF guard that re-resolves the IP on every delivery (see `@infrastructure/adapters/ssrf-guard.ts`). The controller itself only enforces the first check via the schema.
- The `secret` is returned **only** in this creation response (merged via spread onto the presented subscription). Subsequent reads of the subscription will not include it.
- The handler is asynchronous (returns a Promise from the `.then/.catch` chain); Express handles the eventual `res` call.
