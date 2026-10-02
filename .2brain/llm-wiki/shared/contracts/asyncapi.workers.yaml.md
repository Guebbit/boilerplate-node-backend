---
source: shared/contracts/asyncapi.workers.yaml
sha256: 7593ba68eafcbd4a505fc40ab624bcf50bddde09baf02f6cd50046d90c23f6a4
generated_at: 2026-10-01T12:42:57.952315+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/asyncapi.workers.yaml

## Purpose

Standalone AsyncAPI 3.0 document declaring the application-level worker queues (`worker.email.send`, `worker.image.digest`) that do not belong to any domain module. It lives beside `asyncapi.root.yaml` rather than inside a domain because its producers and consumers cut across domains. Exists so the queue contracts are lintable and model-generatable in the same pass as domain-specific AsyncAPI files.

## Key elements

- **`worker.email.send` channel** — email job queue bound to `rabbitmqLocal`.
- **`worker.image.digest` channel** — image digest/thumbnail job queue bound to `rabbitmqLocal`.
- **`workerEmailPublish` / `workerEmailConsume`** — the two operations on the email channel. `Publish` uses `action: receive` (this app enqueues); `Consume` uses `action: send` (this app hands the job to the worker). Both reference the same single message declaration.
- **`workerImageDigestPublish` / `workerImageDigestConsume`** — same publish/consume pair for the image digest channel.
- **`EmailJobPayload` schema** — Nodemailer `SendMailOptions` subset plus `templateName` and pre-translated `data`. Attachments carry opaque spool `key`s (Claim Check), never filesystem paths.
- **`ImageDigestJobPayload` schema** — `collection` (registry key), `documentId`, `key` (opaque quarantine-store reference).
- **`rabbitmqLocal` server** — the only server this document declares; keeps the broker out of the merged public bundle.

## Relationships

- **`shared/contracts/asyncapi.root.yaml`** — sibling contract. The public bundle merges only the shared sections of both files; because `rabbitmqLocal` appears here (not in the root), it is excluded from `asyncapi.public.yaml` that API clients consume.
- **`shared/contracts/spectral.asyncapi.modules.yaml`** — the Spectral ruleset that `npm run lint:asyncapi:modules` applies. This file is a standalone AsyncAPI document (`info` block present) specifically so that same ruleset can validate it identically to a module's internal contract.
- **`src/infrastructure/adapters/email.worker.ts`** — the consumer side of `worker.email.send`. It acknowledges only after the SMTP transport accepts, and does not retry on rendering failure (poison-message guard).
- **`src/modules/webhooks/asyncapi.internal.yaml`** — contrast, not dependency. Webhook delivery is webhooks' own domain queue; this file is the domainless equivalent. The header comment explicitly draws this distinction.

## Notes

- **One message, two operations.** Each queue declares its message once under `channels.<addr>.messages`; the Publish and Consume operations both `$ref` it. Direction is encoded in `action: receive|send`, not by duplicating the payload.
- **Attachments are Claim Check.** `attachments[].key` is an opaque spool token from `mail-spool.ts`; the consumer resolves it inside the spool root. Producers never supply filesystem paths.
- **Email queue is an optimisation, not the system of record.** If the broker is unavailable the adapter falls back to inline SMTP send rather than dropping the message.
- **No locale in the payload.** `data` arrives pre-translated (including `<html lang>` and footer). The consumer interpolates and resolves nothing.
- **`templateName` is engine-agnostic.** Shared with a twin backend that renders via a different template engine; the name identifies the mail, not the file.
- **`collection` is a registry key** (see `kernel/registry.ts`), not a raw Mongo collection name — the consumer uses it to look up the correct writeback target.
- **`title` on inline object schemas** (e.g. `EmailRequest`, `EmailAttachment`) exists solely to give Modelina a stable generated-model name and prevent `AnonymousSchemaN` renumbering.
