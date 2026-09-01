# src/infrastructure/adapters/pdf.worker.ts

## Purpose
Drains a single queued PDF job: renders an EJS template to HTML, then rasterizes that HTML to a PDF via Puppeteer (`renderHtmlToPdf`) and writes the file to the requested output path. Structurally mirrors `email.worker.ts` with the same dead-letter / retry split.

## Key elements
- **`handlePdfJob(job: Partial<PdfJobPayload>): Promise<boolean>`** — The worker handler. Validates that `templatePath` and `outputPath` are present; if either is missing it logs a warning and resolves `false` (dead-letter). Otherwise renders the EJS template with `job.templateData` as context, pipes the resulting HTML to `renderHtmlToPdf` (A4 format), and resolves `true` on success. A render failure is re-thrown so the broker requeues the job.
- **`PDF_QUEUE`** — Re-exported from `@infrastructure/adapters/queue`; the queue name for PDF jobs, consumed by the worker registry.

## Relationships
- **`src/infrastructure/adapters/queue.ts`** — Source of the `PDF_QUEUE` constant re-exported here.
- **`src/infrastructure/adapters/pdf.ts`** — Provides `renderHtmlToPdf`, the Puppeteer-based rasterizer used in the success path.
- **`src/infrastructure/adapters/logger.ts`** — Structured logging for warn/error/info events.
- **`src/types/index.ts`** — Defines the `PdfJobPayload` interface consumed by `handlePdfJob`.
- **`src/app/workers.ts`** — Worker registry that imports `handlePdfJob` and `PDF_QUEUE` to wire the handler to the broker.
- **`shared/contracts/asyncapi.workers.yaml`** — AsyncAPI contract describing the queue message shape this worker consumes.
- **`tests/unit/infrastructure/adapters/workers.test.ts`** — Unit tests covering `handlePdfJob` behavior.

## Notes
- **No i18n here.** The producer resolves all document copy before enqueuing; `templateData` arrives as finished text including the `locale` needed for `<html lang>`. The worker is language-agnostic.
- **`Partial<PdfJobPayload>` is deliberate.** The payload crossed a message broker, so the type is treated as a claim rather than a fact. The `eslint-disable` comment on the null check documents this convention (same pattern in `email.worker.ts`).
- **Return-value contract:** `false` means "discard permanently" (malformed payload); a thrown/rejected promise means "retry" (transient render failure). The caller (`consumeFromQueue` in the queue adapter) distinguishes these two outcomes.
