---
source: shared/contracts/asyncapi.workers.yaml
sha256: 0056433ecda708011c65cb9748b55c0663111823cd20d83187098b02ca4a303d
generated_at: 2026-10-29T01:47:13.423208+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/asyncapi.workers.yaml

## Purpose

A standalone AsyncAPI 3.0.0 document that declares the application-level worker queues (`worker.email.send`, `worker.image.digest`) which do not belong to any single domain module. It exists so these cross-cutting job contracts live beside the root contract rather than being trapped inside whichever module happens to enqueue the most jobs, and so they can be linted independently via `npm run lint:asyncapi:modules`.

## Key elements

- **`servers.rabbitmqLocal`** – The local AMQP broker binding. Declared here (not in the root) so that no shared channel can reach it, keeping it out of the public bundle.
- **`channels.worker.email.send`** – Queue for async email delivery. Binds to `rabbitmqLocal`; carries `EmailJobMessage`.
- **`channels.worker.image.digest`** – Queue for quarantined-upload digesting (decode, re-encode, thumbnail, promote). Binds to `rabbitmqLocal`; carries `ImageDigestJobMessage`.
- **`operations.workerEmailPublish` / `workerEmailConsume`** – Receive/send pair on the email channel. Publish = producer enqueues (with inline-SMTP fallback if broker is down). Consume = worker acks only after transport accepts; rendering failures are not retried.
- **`operations.workerImageDigestPublish` / `workerImageDigestConsume`** – Receive/send pair on the image channel. Publish gated on the referencing document being persisted. Consume strips metadata, caps dimensions, builds WebP thumbnail, promotes both to public store, writes URLs back conditionally on `pendingImageKey` match.
- **`components.schemas.EmailJobPayload`** – Envelope with `request` (Nodemailer `SendMailOptions` subset), optional `from`, `templateName`, and `data` (already-translated template variables). Attachments use opaque spool keys, never paths.
- **`components.schemas.ImageDigestJobPayload`** – Three fields: `collection` (registry key), `documentId`, and `key` (opaque quarantine key). No filesystem paths.

## Relationships

- **`shared/contracts/asyncapi.root.yaml`** – The root is the shared-section document (no `info`); this file is a *standalone* document that the root's lint script validates separately. They are siblings under `shared/contracts/`.
- **`shared/contracts/spectral.asyncapi.modules.yaml`** – The Spectral rule set applied when `npm run lint:asyncapi:modules` validates this file (and any module's `asyncapi.internal.yaml`).
- **`src/infrastructure/adapters/email.worker.ts`** – The sole consumer of the `worker.email.send` channel. Implements the `workerEmailConsume` operation: dequeues, renders the named template, resolves spool attachments, sends via SMTP transport.
- **`src/modules/webhooks/asyncapi.internal.yaml`** – Explicitly **not** in this file. Webhook delivery has its own domain-owned queue and its own standalone AsyncAPI document; the top-of-file comment draws this boundary.

## Notes

- **One message, two operations.** Each queue declares its payload message once in `components.messages`; both the `Publish` (action: `receive`) and `Consume` (action: `send`) operations point at it. Direction is read from `action`, not encoded in a duplicate schema.
- **`rabbitmqLocal` lives here by design.** Because it is the only server reachable by a channel that is *not* in the shared section, the public bundle (which merges shared sections only) never includes this broker. Moving it to the root would leak it into API-client-facing specs.
- **`title` on inline objects is load-bearing.** The `request` and `EmailAttachment` objects carry `title` so Modelina generates stable names instead of `AnonymousSchemaN` (which renumbers on every unrelated schema addition).
- **Attachments and image keys are Claim-Check / opaque handles.** Neither the email attachment `key` nor the image digest `key` is a filesystem path; the consumer resolves them via the spool or image-store API, keeping the payload backend-agnostic and closing off arbitrary-file-read.
- **Email rendering failures are terminal for that job.** No retry on template errors (the template is broken for every redelivery); the worker does not requeue. Broker unavailability, by contrast, falls back to inline send.
