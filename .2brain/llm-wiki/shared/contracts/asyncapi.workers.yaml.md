---
source: shared/contracts/asyncapi.workers.yaml
sha256: a725a0f2a05e634bbbae9c36fbe3123a2790d73c705cac57f0a42648d34d5cce
generated_at: 2026-11-14T17:44:30.220122+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/asyncapi.workers.yaml

## Purpose

Standalone AsyncAPI 3.0.0 contract for application-level worker queues that do not belong to any domain (`worker.email.send`, `worker.image.digest`). It exists so these cross-cutting job definitions live beside the root rather than inside whichever module happens to enqueue them most, and so `npm run lint:asyncapi:modules` can validate them like any module document.

## Key elements

- **`servers.rabbitmqLocal`** — Local RabbitMQ broker (`localhost:5672`, AMQP). Declared here because it is the only server whose channels appear in this file; keeps the broker out of `asyncapi.public.yaml`.
- **`channels.worker.email.send`** / **`channels.worker.image.digest`** — The two queue channels, each bound to `rabbitmqLocal`.
- **`operations.workerEmailPublish` / `workerEmailConsume`** — Publish (`action: receive`) and consume (`action: send`) operations for the email queue. One message, two operations; direction is read from `action`.
- **`operations.workerImageDigestPublish` / `workerImageDigestConsume`** — Same pattern for the image-digest queue.
- **`components.messages.EmailJobMessage` / `ImageDigestJobMessage`** — Message wrappers that reference their payload schemas.
- **`components.schemas.EmailJobPayload`** — Nodemailer `SendMailOptions` subset, `templateName`, pre-translated `data`, and `attachments` as claim-check keys (no raw paths, no bytes).
- **`components.schemas.ImageDigestJobPayload`** — `collection` (registry key), `documentId`, and `key` (opaque quarantine key). No filesystem paths.

## Relationships

- **`shared/contracts/asyncapi.root.yaml`** — The complementary root AsyncAPI document covering domain-specific queues. This file holds the queues that do *not* belong to a domain; together they form the complete set of internal async channels.
- **`src/modules/webhooks/asyncapi.internal.yaml`** — Webhook delivery queues live there, explicitly excluded from this file. No shared channels or schemas between the two.

## Notes

- The `info` block exists solely to make this a valid standalone AsyncAPI document; it is not semantically different from a module's.
- The one-message / two-operations pattern means the payload is defined once and both operations reference it — do not add a second message declaration per direction.
- `rabbitmqLocal` appears here but not in the public bundle because no shared channel in the public set binds to it.
- `EmailJobPayload.attachments` uses opaque spool keys, never filesystem paths; `ImageDigestJobPayload.key` likewise. Consumers resolve through their respective stores.
- The `title` on the inline `EmailRequest` object is intentional: it gives Modelina a stable name and prevents `AnonymousSchemaN` renumbering on unrelated schema changes.
- Webhook delivery is deliberately **not** in this file — look in the webhooks module's internal contract.
