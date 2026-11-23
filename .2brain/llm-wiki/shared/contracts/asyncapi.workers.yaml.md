---
source: shared/contracts/asyncapi.workers.yaml
source_sha256: 3cae3bf29cee5c7ad4c383516a0080e5dd2a30420f6d93aac503cd5f904aced4
context_sha256: 4ab3c80dcea5efaf715b426440841f32483fa5bce74b2ba4d0b8e7e7dfc12777
generated_at: 2026-11-22T02:23:07.354216+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/contracts/asyncapi.workers.yaml

## Purpose
A standalone AsyncAPI 3.0.0 document for the `worker.*` queues that belong to no domain: email delivery and image digesting. It sits beside the root contract because sending mail is a verb rather than a domain, so the contract doesn't live inside whichever module enqueues the most jobs. Webhook delivery is deliberately excluded: that queue belongs to webhooks (`src/modules/webhooks/asyncapi.internal.yaml`).

## Key elements
- **Server `rabbitmqLocal`**: `localhost:5672` over AMQP. It is declared here because this is the only shared section whose channels bind to it.
- **Channels**
  - `worker.email.send`: the ordinary email queue.
  - `worker.email.urgent`: the same `EmailJobMessage`, with its own consumer, for mail a person is waiting on (verification, password reset, 2FA, export-ready and account-deletion links). A backlog of ordinary mail never delays it.
  - `worker.image.digest`: the queue for quarantined uploads.
- **Operations**: each queue has one message and two operations that point at it. `...Publish` uses `action: receive`, meaning the application receives the enqueue request. `...Consume` uses `action: send`, meaning the application hands the job to the worker.
  - `workerEmailPublish`, `workerEmailConsume`
  - `workerEmailUrgentPublish`, `workerEmailUrgentConsume`
  - `workerImageDigestPublish`, `workerImageDigestConsume`
- **Messages**: `EmailJobMessage` and `ImageDigestJobMessage`.
- **Schema `EmailJobPayload`**: requires `request`, `templateName` and `data`. It also has an optional `from`.
  - `request` (titled `EmailRequest`) is a Nodemailer SendMailOptions subset. It requires `to` and also allows `subject`, `text`, `html`, `replyTo`, `messageId`, `inReplyTo` and `attachments`. `additionalProperties` is false.
  - `messageId` and `inReplyTo` must match `^<[^<>\s@]+@[^<>\s@]+>$`.
  - `attachments` are Claim Check tasks (`filename` plus a spool `key`), not bytes.
  - `templateName` is an outbox mail name without a file extension.
  - `data` holds the values the template prints, already translated by the producer.
- **Schema `ImageDigestJobPayload`**: referenced by `ImageDigestJobMessage`. Its definition is not in the visible part of the file.

## Relationships
- `shared/contracts/asyncapi.root.yaml`: the root is not a standalone AsyncAPI document. This file is its async counterpart for non-domain queues.
- `shared/contracts/spectral.asyncapi.modules.yaml`: `npm run lint:asyncapi:modules` validates this file exactly as it validates a module's contract. `info` exists only to make that possible.
- `shared/cases/outbox-backoff.cases.yaml` and `shared/cases/ssrf.cases.yaml`: the visible portion of this file doesn't reference either one.

## Notes
- Because `rabbitmqLocal` is bound only here, it stays out of the public API bundle. That bundle merges the shared sections only, so a server no shared channel can reach never appears in it.
- The publish operation for `worker.email.send` is documented as never dropping a message when the broker is unavailable. The mail is sent inline or held in a durable fallback queue.
- The email consumer acknowledges only after the transport accepts the message. Failures are retried up to `NODE_QUEUE_MAX_ATTEMPTS`, then parked in the dead queue. No mail is sent before the render succeeds.
- The image digest write-back is conditional on `pendingImageKey` still matching `key`, so a stale job cannot overwrite a later upload. The job is published only after the referencing document has been persisted.
- The `title` on inline objects (`EmailRequest`, `EmailAttachment`) is there to give generated models stable names. Without it, Modelina falls back to `AnonymousSchemaN`, which is renumbered whenever an unrelated schema is added.
