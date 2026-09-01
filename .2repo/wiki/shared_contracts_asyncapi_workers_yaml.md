# shared/contracts/asyncapi.workers.yaml

## Purpose

Standalone AsyncAPI 2.6.0 document that declares the three application-level job queues (`worker.email.send`, `worker.pdf.generate`, `worker.image.digest`) which do not belong to any domain. It sits beside `asyncapi.root.yaml` so that `npm run lint:asyncapi:modules` can validate it independently, and it is the single place that binds those channels to the `rabbitmqLocal` broker.

## Key elements

- **`servers.rabbitmqLocal`** — Local AMQP broker endpoint. Declared *here* (not in the root) so that no shared channel references it, which keeps it out of the merged `asyncapi.public.yaml` bundle.
- **`channels.worker.email.send`** — Publish/subscribe pair for async email delivery. Producers call `enqueueEmail`; the email worker consumes and sends. Acknowledges only after the transport accepts the message; rendering failures are *not* retried.
- **`channels.worker.pdf.generate`** — Publish/subscribe pair for CPU-bound PDF rendering. Producer hands off template + data + output path; worker renders off the request thread.
- **`channels.worker.image.digest`** — Publish/subscribe pair for image quarantine → digest → promote. Worker strips metadata, re-encodes, builds a WebP thumbnail, and writes back URLs conditional on `pendingImageKey` still matching.
- **`components.messages.*`** — Six message wrappers (publish + consume for each queue) that bind a payload schema to a `messageId`.
- **`components.schemas.EmailJobPayload`** — Nodemailer `SendMailOptions` subset, `templateName` (outbox name, no extension), and pre-translated `data`. No locale travels with the job.
- **`components.schemas.PdfJobPayload`** — `templatePath` (file path), `templateData` (pre-translated), `outputPath`.
- **`components.schemas.ImageDigestJobPayload`** — `collection` (registry key, not raw Mongo name), `documentId`, `key` (opaque quarantine key, never a filesystem path).

## Relationships

- **`shared/contracts/asyncapi.root.yaml`** — This file is its sibling in the shared contract layer. The root holds domain-scoped channels; this file holds the "no-domain" queues. The `rabbitmqLocal` server exists only in this file so the public bundle (which merges shared sections) never exposes the broker to API clients.
- **`src/infrastructure/adapters/email.worker.ts`** — Consumer of `worker.email.send` (subscribe side). Implements the `workerEmailConsume` operation: renders the named outbox template, sends via transport, acknowledges on success.
- **`src/infrastructure/adapters/pdf.worker.ts`** — Consumer of `worker.pdf.generate` (subscribe side). Implements the `workerPdfConsume` operation: resolves `templatePath`, renders with `templateData`, writes PDF to `outputPath`.

## Notes

- **Standalone by design.** The `info` block exists solely to make this a valid AsyncAPI document on its own; it carries no runtime significance.
- **Fallback semantics differ per queue.** Email: if the broker is down the adapter sends inline (queue is an optimisation, not the system of record). PDF and image digest have no inline fallback — they *must* run off-thread.
- **No locale in any payload.** Producers translate before enqueuing; consumers interpolate but never resolve translations. This is intentional and shared across the email and PDF payloads.
- **`collection` in `ImageDigestJobPayload` is a registry key** (see `kernel/registry.ts`), not a raw Mongo collection name — the consumer maps it to the correct `imageTargets` entry.
- **`key` in the image payload is opaque** — the consumer calls back into `imageStore`; the payload never contains a filesystem path, so the storage backend is swappable without a contract change.
