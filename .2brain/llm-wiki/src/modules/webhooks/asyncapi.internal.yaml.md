---
source: src/modules/webhooks/asyncapi.internal.yaml
sha256: ae103f36cac5f1a59e6c59d6320b4202c79026ccfcf6083da3bd6d55af98a89c
generated_at: 2026-11-08T08:59:34.366723+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/asyncapi.internal.yaml

## Purpose

Declares the webhooks module's private RabbitMQ delivery queue (`worker.webhook.deliver`) as an AsyncAPI fragment. It exists separately from the module's public event catalogue (`./asyncapi.yaml`) so that the queue is included in the backend-bundled spec but never leaks into the frontend-facing `asyncapi.public.yaml`.

## Key elements

- **`channels.worker.webhook.deliver`** — The single queue binding to `rabbitmqLocal`. One message per matching subscription; a slow endpoint delays only its own deliveries.
- **`operations.workerWebhookDeliverPublish`** (action: `receive`) — Subscriber enqueues one delivery job per fan-out subscription.
- **`operations.workerWebhookDeliverConsume`** (action: `send`) — Worker signs (Standard Webhooks), SSRF-guards, POSTs with a hard timeout, and records the outcome. Retries are scheduled via `nextAttemptAt`, not requeued here.
- **`components.messages.WebhookDeliverJobMessage`** — Wraps the payload schema.
- **`components.schemas.WebhookDeliverJobPayload`** — Carries only `deliveryId` (the `webhookdeliveries` row PK). All other fields live on the row (Claim Check pattern); the message itself cannot go stale on replay and no event payload is duplicated in the broker.

## Relationships

- **`shared/contracts/asyncapi.workers.yaml`** — Declares the `rabbitmqLocal` server that this fragment `$ref`s. The two sections merge into one document, so this file must not re-declare that server (duplicate keys cause `mergeInto` to reject the merge).
- **`scripts/contracts/asyncapi-bundles.ts`** — Owns the `SHARED_SECTIONS` list that classifies this file as `backend`-only, and provides the `mergeInto` function that combines this fragment into the final `asyncapi.yaml` bundle.
- **`src/modules/webhooks/module.ts`** — The runtime module that produces and consumes the `worker.webhook.deliver` jobs described here.

## Notes

- This file is a **fragment**, not a standalone AsyncAPI document: it has no top-level `asyncapi`, `info`, or `servers` keys. It is deliberately excluded from the `lint:asyncapi:modules` glob for that reason. Validation happens on the *bundled* output via `npm run lint:asyncapi`.
- The `deliveryId` is the only field in the payload and is `required`. The row is inserted (`pending`) *before* the job is published, so a lost message still leaves a queryable trace via `GET /webhooks/deliveries`.
- Retries are **not** handled by requeuing on this channel; they go through the `nextAttemptAt` sweep (see `docs/reference/ops.md#scheduled-jobs`).
