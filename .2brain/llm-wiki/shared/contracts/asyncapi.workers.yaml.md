---
source: shared/contracts/asyncapi.workers.yaml
sha256: ebe5b4ff8689c9730246272abb66300b3bd41a0a7a7f99dee0e63c268033fc15
generated_at: 2026-10-14T07:35:37.731106+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/asyncapi.workers.yaml

## Purpose

AsyncAPI 3.0 contract for the application-level worker queues that belong to no domain module — email delivery and image digesting. It exists so these cross-cutting jobs have a typed, lintable schema alongside the domain-owned queues, and so the `rabbitmqLocal` broker stays out of the public API bundle.

## Key elements

- **`rabbitmqLocal`** — the single server (`localhost:5672`, AMQP). Declared here specifically so it is never merged into `asyncapi.public.yaml`.
- **`worker.email.send`** (channel) — queue for email jobs; one message (`EmailJobMessage`), two operations.
- **`worker.image.digest`** (channel) — queue for quarantined-upload digesting; one message (`ImageDigestJobMessage`), two operations.
- **`workerEmailPublish` / `workerEmailConsume`** — `receive` (producer enqueues) and `send` (worker dequeues) on the email channel.
- **`workerImageDigestPublish` / `workerImageDigestConsume`** — same receive/send pair for the image-digest channel.
- **`EmailJobPayload`** — `request` (Nodemailer options), optional `from`, `templateName` (outbox name, not a file path), `data` (pre-translated template variables). Attachments carry `key` + `filename` (Claim Check), never raw bytes.
- **`ImageDigestJobPayload`** — `collection` (registry key, not a Mongo name), `documentId`, `key` (opaque quarantine-store key, not a path).

## Relationships

- **`shared/contracts/asyncapi.root.yaml`** — sibling contract for domain-owned queues; this file is the "system" counterpart for queues that cross domains.
- **`shared/contracts/spectral.asyncapi.modules.yaml`** — spectral ruleset that lints this file via `npm run lint:asyncapi:modules`; the `info` block exists so the file passes as a standalone document.
- **`src/infrastructure/adapters/email.worker.ts`** — the runtime consumer of `worker.email.send`; its publish/fallback and ack semantics are described in the operation docs here.
- **`src/modules/webhooks/asyncapi.internal.yaml`** — explicitly excluded from this file; webhook delivery is webhooks' own queue and is not merged into the workers contract.

## Notes

- **One message, two operations.** Each queue declares its payload once; direction is encoded by the operation's `action` (`receive` = this app enqueues, `send` = this app hands off to the worker). Do not add a second message declaration for the reverse direction.
- **`info` is structural, not informational.** It exists solely so spectral treats the file as a standalone AsyncAPI document; its `title`/`version` carry no consumer-facing contract.
- **Attach/digest `key` fields are opaque store handles.** They must never be filesystem paths; the consumer resolves them through the store/spool API, keeping backend swappable.
- **`templateName` is a shared identifier.** The twin backend renders a different engine under the same name; it names the mail, not the template file.
- **`data` arrives pre-translated.** No locale, no resolution logic travels with the job; the consumer only interpolates.
- **Image writeback is conditional.** The consumer matches `pendingImageKey` against `key` before writing; a stale or superseded job is a no-op, not an overwrite.
