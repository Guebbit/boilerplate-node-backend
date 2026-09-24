---
source: shared/contracts/asyncapi.workers.yaml
sha256: ef3744429c28db3d56c755477b1a79207e5e35b71a3729d175f8706f98d9c05b
generated_at: 2026-09-23T17:33:47.753950+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/asyncapi.workers.yaml

## Purpose

Declares the AsyncAPI 3.0 contract for the two **domainless** worker queues (`worker.email.send`, `worker.image.digest`) whose ownership sits with the application as a whole rather than any single domain. It exists as a standalone AsyncAPI document (it carries its own `info` block) so the Spectral lint pipeline can validate it identically to a module's contract.

## Key elements

- **`servers.rabbitmqLocal`** — the only server declared in this file; binding it here (and nowhere in the shared/public sections) keeps the broker out of the API-client bundle.
- **`channels.worker.email.send`** — the email-job queue; one message (`EmailJobMessage`) referenced by two operations.
- **`channels.worker.image.digest`** — the image-digest queue; one message (`ImageDigestJobMessage`) referenced by two operations.
- **`operations.workerEmailPublish` / `workerEmailConsume`** — `receive` / `send` pair for the email queue. The publish note documents the inline-SMTP fallback when the broker is down; the consume note documents at-least-once ack semantics and the decision _not_ to requeue rendering failures.
- **`operations.workerImageDigestPublish` / `workerImageDigestConsume`** — `receive` / `send` pair for the image-digest queue. Publish is gated on the referencing document being persisted; consume performs decode → resize → thumbnail → promote → conditional writeback.
- **`components.schemas.EmailJobPayload`** — Nodemailer-style `request`, `templateName`, `data`. Attachments carry spool `key` values (never raw paths). `data` is fully pre-translated by the producer.
- **`components.schemas.ImageDigestJobPayload`** — `collection` (registry key, not Mongo name), `documentId`, `key` (opaque quarantine handle). Writeback is conditional on `pendingImageKey` still matching.

## Relationships

- **`shared/contracts/asyncapi.root.yaml`** — This file is the async counterpart to the root's `system` section; unlike the root it _is_ a standalone AsyncAPI document (the root is not).
- **`shared/contracts/spectral.asyncapi.modules.yaml`** — The Spectral ruleset that `npm run lint:asyncapi:modules` applies; because this file ships an `info` block it is validated through the same module-oriented rules.
- **`src/infrastructure/adapters/email.worker.ts`** — The runtime consumer of `worker.email.send`; it acks only after the SMTP transport accepts the message.
- **`src/modules/webhooks/asyncapi.internal.yaml`** — Structural contrast: webhook delivery lives _inside_ the webhooks domain, whereas the queues in this file are deliberately domainless. They follow the same "one message, two operations" pattern but sit at different ownership levels.

## Notes

- **One message, two operations.** Each channel declares its payload once; direction is encoded in the operation's `action` field (`receive` = this app enqueues, `send` = this app dequeues). Do not add a second message declaration with the same shape.
- **`rabbitmqLocal` is scoped to this file only.** No shared/public section references it, so it never leaks into the client-facing AsyncAPI bundle.
- **Attachments are claim-check tickets, not bytes or paths.** `EmailJobPayload.request.attachments[].key` is an opaque spool handle resolved inside the mail-spool root by the consumer — a deliberate boundary against arbitrary file reads.
- **`templateName` is engine-agnostic.** It names the mail, not a file, so the twin backend can resolve it to a different template engine.
- **Image-digest writeback is idempotent by design.** The consumer compares `pendingImageKey` against its own `key` before writing URLs back; a stale or superseded job is a no-op.
