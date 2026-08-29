# src/infrastructure/adapters/pdf.worker.ts

## Purpose

Queue worker handler that fulfils a single PDF-generation job: it renders an EJS template to HTML and converts that HTML to a PDF file on disk via Puppeteer. It exists as the concrete "consumer" half of the PDF pipeline, paired with the producer that enqueues the job.

## Key elements

- **`handlePdfJob(job: Partial<PdfJobPayload>): Promise<boolean>`** — The sole functional export. Validates that `templatePath` and `outputPath` are present (returns `false` to ack-and-discard if not), renders the EJS file with `job.templateData`, pipes the HTML through `renderHtmlToPdf` (A4, written to `job.outputPath`), and returns `true` on success. Any rendering/writing failure is re-thrown so the broker can retry.
- **`PDF_QUEUE` (re-export)** — Re-exported from `@infrastructure/adapters/queue` so the worker registry can bind the queue name without importing the queue module directly.

## Relationships

- **`src/infrastructure/adapters/pdf.ts`** — Provides `renderHtmlToPdf`, the Puppeteer-based HTML→PDF conversion used in the render step.
- **`src/infrastructure/adapters/logger.ts`** — Provides the structured `logger` used for warn / info / error messages.
- **`src/infrastructure/adapters/queue.ts`** — Source of the `PDF_QUEUE` constant re-exported here.
- **`src/types/index.ts`** — Supplies the `PdfJobPayload` type that shapes the job parameter.
- **`src/app/workers.ts`** — Worker registry that imports `handlePdfJob` and `PDF_QUEUE` to wire the handler to the broker.
- **`shared/contracts/asyncapi.workers.yaml`** — AsyncAPI spec that defines the queue and message schema this handler consumes.
- **`tests/unit/infrastructure/adapters/workers.test.ts`** — Unit tests that exercise `handlePdfJob` in isolation.

## Notes

- **Ack-vs-retry contract:** returning `false` means "discard this message"; throwing means "leave it for the broker to redeliver." Only the missing-payload guard returns `false`; every other failure throws.
- **`Partial<PdfJobPayload>`** is deliberate: the payload crossed a broker, so its runtime shape is a claim, not a fact. The explicit `eslint-disable` on the null-check documents this.
- **No i18n logic here.** The producer is responsible for resolving all copy into `templateData` (including `locale` for `<html lang>`); this handler treats the data as finished text.
- **Page format is hardcoded to `A4`** — there is no per-job override.
