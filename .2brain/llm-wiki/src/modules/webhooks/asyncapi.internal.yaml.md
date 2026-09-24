---
source: src/modules/webhooks/asyncapi.internal.yaml
sha256: ae103f36cac5f1a59e6c59d6320b4202c79026ccfcf6083da3bd6d55af98a89c
generated_at: 2026-09-23T19:37:46.302451+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/asyncapi.internal.yaml

## Purpose

Declares the webhooks module's **private** RabbitMQ delivery-queue contract (channel, operations, and message shape) in AsyncAPI. It is a `backend`-only fragment that is merged into `./asyncapi.yaml` but deliberately excluded from any public bundle, so the paired frontend never sees the internal worker queue.

## Key elements

- **`channels.worker.webhook.deliver`** — The single channel: a RabbitMQ queue on `rabbitmqLocal` carrying one `WebhookDeliverJobMessage` per matching subscription.
- **`operations.workerWebhookDeliverPublish`** (action: `receive`) — The webhooks module enqueues one message per subscription fan-out; one event → N messages, isolating slow endpoints.
- **`operations.workerWebhookDeliverConsume`** (action: `send`) — The webhook worker signs (Standard Webhooks), SSRF-validates, POSTs with a hard timeout, and records the outcome. Retries go to a scheduled sweep (`nextAttemptAt`), not re-queueing.
- **`components.messages.WebhookDeliverJobMessage`** — The message envelope wrapping the payload schema.
- **`components.schemas.WebhookDeliverJobPayload`** — Carries only `deliveryId` (Claim Check pattern); the `webhookdeliveries` row is the source of truth for subscription, event, payload, and attempt count, so the message never goes stale on replay.

## Relationships

- **`src/modules/webhooks/asyncapi.yaml`** — This fragment is merged _into_ that file. It also `$ref`s `rabbitmqLocal` (defined there or in the workers file) and `WebhookDeliverJobPayload`'s parent schema from the same bundle.
- **`shared/contracts/asyncapi.workers.yaml`** — Already declares the `rabbitmqLocal` server under its `workers` section; this file references it via `$ref` and must not re-declare it, or `mergeInto` in the bundler will reject the duplicate key.
- **`scripts/contracts/asyncapi-bundles.ts`** — Performs the merge. Classifies this file under `SHARED_SECTIONS` (backend-only), ensuring it lands in the internal bundle and is excluded from `asyncapi.public.yaml`.
- **`src/modules/webhooks/module.ts`** — The runtime module that enqueues on `worker.webhook.deliver` (publish) and whose worker consumer reads it (consume).

## Notes

- **Fragment, not a document.** No top-level `asyncapi`/`info`/`servers` keys. For that reason it is intentionally left out of the `lint:asyncapi:modules` glob; validation happens on the _bundled_ output (`npm run lint:asyncapi`), where `rabbitmqLocal` is already present.
- **Merge is strict.** `mergeInto` refuses any duplicate key, so adding a second `servers` or `channels` entry that collides with the workers file or the main `asyncapi.yaml` will break the build.
- **Retry is out-of-band.** Failures do not re-enqueue on this channel; they set `nextAttemptAt` and rely on the scheduled sweep documented in `docs/reference/ops.md#scheduled-jobs`.
