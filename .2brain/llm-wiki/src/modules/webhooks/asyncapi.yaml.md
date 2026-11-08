---
source: src/modules/webhooks/asyncapi.yaml
sha256: 242d09189abb88f7798f8c7dfa894bf1500413ce2353358cfed52d2ad9115341
generated_at: 2026-11-08T08:59:48.817202+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/asyncapi.yaml

## Purpose

The shared (module-agnostic) half of the public webhook event catalogue. It defines the single variable `subscriberEndpoint` server and the cross-event schemas (`WebhookHeaders` plus four copied scalar types) that every webhook delivery carries. The bundler merges this document with per-module channel fragments into the final `asyncapi.yaml` and `asyncapi.public.yaml`. It exists so the catalogue a subscriber reads at `GET /webhooks/events` stays in lockstep with the events that can actually fire.

## Key elements

- **`servers.subscriberEndpoint`** — A *variable* server (`{subscriberHost}` / `{subscriberPath}`) representing the subscriber's own HTTPS URL. Not a host this application listens on; the application opens the connection outbound.
- **`components.schemas.Id`** — Resource identifier scalar (string, 1–64 chars, `[0-9A-Za-z_-]+`). Copied from the OpenAPI spec because AsyncAPI documents cannot `$ref` an OpenAPI file.
- **`components.schemas.CurrencyCode`** — ISO 4217 alphabetic code (3 uppercase letters). Copied for the same reason.
- **`components.schemas.DecimalAmount` / `NonNegativeDecimalAmount`** — Money-as-string scalars. Copied for the same reason.
- **`components.schemas.WebhookHeaders`** — The three Standard Webhooks headers on every delivery: `webhook-id` (dedup key, shared across retries and fan-out), `webhook-timestamp` (Unix seconds, folded into signature), `webhook-signature` (one or more `v1,<base64 HMAC-SHA256>` values).

## Relationships

- **`src/modules/webhooks/module.ts`** — Its `onRegistered` hook subscribes generically (via `kernel/registry.ts`'s `PublicEventTarget`) to every domain event a registered module names in `publicEvents`, then republishes matching events signed to the subscriber URL. This file documents the headers and envelope that signing produces.
- **`kernel/registry.ts`** — Supplies `PublicEventTarget`, the abstraction the webhooks module uses to discover and subscribe to events declared by other modules.
- **`scripts/contracts/asyncapi-bundles.ts`** — Merges this file's `servers` and `components` section with per-module channel fragments into the shipped `asyncapi.yaml` and `asyncapi.public.yaml`.
- **`src/modules/users/asyncapi.webhooks.yaml`** — One of the per-module channel fragments (alongside `orders`, `payments`, `returns`, `example`) that the bundler merges *into* this document's section; each fragment owns its own event channels and references the schemas defined here.
- **`transport/webhook-signing.ts`** — Implements the HMAC-SHA256 signing and the `webhook-id` / `webhook-timestamp` / `webhook-signature` header construction that `WebhookHeaders` documents for subscribers.

## Notes

- The `Id`, `CurrencyCode`, `DecimalAmount`, and `NonNegativeDecimalAmount` schemas are **copies** of their OpenAPI counterparts, not references. If the OpenAPI definitions change, these must be updated by hand.
- The `subscriberEndpoint` server is intentionally a placeholder; Spectral rules (`asyncapi-servers`, `asyncapi-channel-servers`) still pass because the merged-in channel fragments bind to it.
- `webhook-id` appears **only** in the headers, never repeated in the message body. The body follows the Standard Webhooks envelope `{ type, timestamp, data }`.
- Adding a new webhook event does **not** touch this file — it is a one-fragment addition in the owning module's `asyncapi.webhooks.yaml` (see `example` for the shape).
