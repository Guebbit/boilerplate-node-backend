# shared/contracts/asyncapi.workers.yaml

## Purpose

A standalone AsyncAPI 2.6.0 document that contracts the two cross-cutting job queues (`worker.email.send`, `worker.pdf.generate`) owned by the application rather than any single domain. It exists beside `asyncapi.root.yaml` so that queue definitions can be linted independently and so the `rabbitmqLocal` server stays out of the public AsyncAPI bundle shared with API clients.

## Key elements

- **`servers.rabbitmqLocal`** — the AMQP broker (localhost:5672) both channels bind to; declared here solely to keep it out of `asyncapi.public.yaml`.
- **`channels.worker.email.send`** — publish/subscribe pair for email delivery. Publish (`workerEmailPublish`) enqueues a render-and-send job; subscribe (`workerEmailConsume`) is consumed by the email worker.
- **`channels.worker.pdf.generate`** — publish/subscribe pair for PDF rendering. Publish (`workerPdfPublish`) enqueues a template-render job; subscribe (`workerPdfConsume`) is consumed by the PDF worker.
- **`components.schemas.EmailJobPayload`** — `{ request, templateName, data, from? }`. `templateName` is a logical outbox name (no file extension); `data` is fully pre-translated by the producer.
- **`components.schemas.PdfJobPayload`** — `{ templatePath, templateData, outputPath }`. `templatePath` is consumer-specific (file path here, Blade view name in the twin backend); `templateData` follows the same pre-translated contract.
- **Message definitions** (`EmailJobMessage`, `PdfJobMessage`, `EmailJobConsumeMessage`, `PdfJobConsumeMessage`) — publish and consume variants share the same payload schema but carry distinct `messageId` values.

## Relationships

- **`asyncapi.root.yaml`** — sibling document in the same contracts directory; the root covers domain-specific queues, this file covers the "no-domain" queues. Both are merged into the shared sections of the public bundle.
- **`asyncapi.yaml`** — the top-level AsyncAPI entry point that assembles shared sections; this file's `rabbitmqLocal` server is deliberately excluded from the public output because no shared channel references it.
- **`src/infrastructure/adapters/email.worker.ts`** — the sole consumer of `worker.email.send`; publishes on the channel's `publish` side are produced by whichever module needs to send mail.
- **`src/infrastructure/adapters/pdf.worker.ts`** — the sole consumer of `worker.pdf.generate`; the producer hands off `templatePath` + `templateData` and returns immediately.
- **`shared/contracts/analytics.frontend.ts`** — co-resident contract in the same directory; no direct schema or channel reference between the two files is visible here.

## Notes

- **Email fallback:** if the broker is unavailable, the adapter sends the email inline over SMTP rather than dropping the message. The queue is an optimisation, not the system of record.
- **No retry on render failure (email):** a broken template fails identically on every redelivery; requeueing would starve the queue behind an unresolvable job.
- **`templateName` / `templatePath` are backend-agnostic identifiers.** The file intentionally does not encode which rendering engine consumes them; the twin backend uses a different engine.
- **No locale in payloads.** The producer translates all display strings (including `<html lang>` and footer) before enqueueing, so the consumer interpolates blindly.
- **Both schemas set `additionalProperties: false`**, so adding a field without updating this contract will fail validation.
- The `info` block exists only to satisfy the AsyncAPI spec for standalone validation via `npm run lint:asyncapi:modules`; it is not a versioned API surface.
