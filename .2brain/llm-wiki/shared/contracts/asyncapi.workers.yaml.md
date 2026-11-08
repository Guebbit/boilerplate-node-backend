---
source: shared/contracts/asyncapi.workers.yaml
sha256: dfa707cbf7200dbf6a5257246ac86f4b7c89efd39f042f4b0b9f50fe24452e38
generated_at: 2026-11-08T03:07:03.989702+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/asyncapi.workers.yaml

## Purpose

AsyncAPI 3.0.0 contract for cross-domain background-job queues (`worker.email.send`, `worker.image.digest`) that belong to the application as a whole rather than to any single module. It exists so that the producer side (any module) and the consumer side (infrastructure workers) share one canonical message shape, and so the `rabbitmqLocal` server is declared in exactly one place — the section whose channels actually bind to it — keeping the broker out of the public API bundle.

## Key elements

- **`servers.rabbitmqLocal`** — Local RabbitMQ (AMQP) endpoint; the only server referenced by any channel in this file.
- **`channels.worker.email.send`** — Queue for email delivery jobs.
- **`channels.worker.image.digest`** — Queue for quarantined-image digest/thumbnail jobs.
- **`operations.workerEmailPublish` / `workerEmailConsume`** — One message (`EmailJobMessage`), two operations. `action: receive` marks the enqueue side; `action: send` marks the worker-pickup side.
- **`operations.workerImageDigestPublish` / `workerImageDigestConsume`** — Same one-message/two-operation pattern for `ImageDigestJobMessage`.
- **`components.schemas.EmailJobPayload`** — Carries a Nodemailer `SendMailOptions` subset, a `templateName` (outbox name, not a file path), and pre-translated `data`. Attachments are Claim-Check keys, never raw bytes.
- **`components.schemas.ImageDigestJobPayload`** — Carries a `collection` registry key, `documentId`, and an opaque quarantine `key`; the consumer resolves the key back through the image store.

## Relationships

- **`shared/contracts/asyncapi.root.yaml`** — The root file holds the *synchronous* (OpenAPI) half of the system section; this file holds the *async* (queue) half. The root is a merged fragment, while this file is a standalone AsyncAPI document (the `info` block exists purely so `npm run lint:asyncapi:modules` can validate it in isolation). The root's channels do not reference `rabbitmqLocal`, which is what keeps that server absent from `asyncapi.public.yaml`.
- **`src/modules/webhooks/asyncapi.internal.yaml`** — Webhook delivery has its own queue and its own AsyncAPI file in the webhooks module. It is deliberately excluded from this file so that webhook-specific channels and servers stay scoped to that module.

## Notes

- **One message, two operations.** Direction is encoded via the operation's `action` field (`receive` vs `send`), not by duplicating the message declaration with a flipped payload. Both operations `$ref` the same message under the channel.
- **Standalone-document requirement.** The top-level `info` block is present *only* to satisfy the AsyncAPI spec's "must have info" rule so the linter treats this file identically to a module's contract. It is not meant to be consumed by any client.
- **Email attachments are keys, not paths.** `EmailJobPayload.request.attachments[].key` is an opaque spool token; the consumer resolves it inside the mail-spool root. This closes off arbitrary file reads.
- **Image digest writeback is conditional.** The consumer only promotes the image and writes the URL back if `pendingImageKey` still equals the job's `key`, preventing a stale or superseded job from overwriting a newer upload.
- **No retry on email render failure.** A broken template will fail on every redelivery; requeueing it would poison the queue. The job is acknowledged and dropped after a render error.
- **`title` on inline objects.** Sub-objects like `EmailRequest` and `EmailAttachment` carry a `title` so the codegen tool (Modelina) names the generated class instead of emitting `AnonymousSchemaN`.
- **`templateName` is engine-agnostic.** It names the outbox mail (e.g. `welcome`), not a file, because a second backend renders the same logical mail with a different template engine.
