---
source: src/modules/webhooks/asyncapi.yaml
sha256: de39111ed2b0f89eaa167c0650c47b9ef63421d42df07fd73062feba105a9301
generated_at: 2026-10-15T12:17:18.972631+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/asyncapi.yaml

## Purpose

The shared (non-channel) half of the webhooks public event catalogue. It defines the `subscriberEndpoint` server (the variable, per-subscription HTTPS URL) and the `WebhookHeaders` schema that every delivery carries. Individual event channels are *not* here — they live in each owning module's fragment and are merged in by the bundler while this file exists.

## Key elements

- **`servers.subscriberEndpoint`** — A variable AsyncAPI server (`{subscriberHost}` / `{subscriberPath}`) representing the subscriber's configured HTTPS URL. Not a server this application runs; it is the *reverse* direction (outbound delivery).
- **`components.schemas.WebhookHeaders`** — The three Standard Webhooks headers on every delivery: `webhook-id` (dedup key, shared across fanned-out subscriptions and retries), `webhook-timestamp` (Unix seconds, folded into the HMAC), `webhook-signature` (one or more `v1,<base64 HMAC-SHA256>` values).
- **Envelope convention** — Every event body follows the Standard Webhooks shape `{ type, timestamp, data }`; `type` disambiguates events for multi-type subscribers, `timestamp` is stable across retries, `data` is the per-event payload.

## Relationships

- **`scripts/contracts/asyncapi-bundles.ts`** — Merges this file (as the `shared` section) into both `asyncapi.yaml` and `asyncapi.public.yaml`. Also merges the per-module channel fragments into the same output.
- **`asyncapi.public.yaml`** — The published bundle this file contributes to; subscribers read the merged document rather than this file in isolation.
- **`src/modules/webhooks/asyncapi.internal.yaml`** — Defines the backend-only queue `worker.webhook.deliver`. Separate document; not merged into the public catalogue.
- **`src/modules/webhooks/module.ts`** — Its `onRegistered` hook subscribes generically to every domain event a registered module's manifest names a `publicEvents` entry for, then republishes (signed) to the subscriber URL. This YAML documents what that republishing delivers; the module does not import constants from here.

## Notes

- The `subscriberEndpoint` server uses template variables, which is intentional: every subscription names its own URL, so no single address can be printed. Spectral rules (`asyncapi-servers` / `asyncapi-channel-servers`) still pass because the merged channels *do* bind to this server.
- `webhook-id` is **not** repeated in the body; it exists only in the headers.
- This file is the `shared` section in the merged output — it contains no `channels` key of its own. Adding a new webhook event means adding a fragment in the owning module (see `example`), not editing this file.
