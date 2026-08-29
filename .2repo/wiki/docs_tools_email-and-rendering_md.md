# docs/tools/email-and-rendering.md

## Purpose

Documents the boilerplate's two outbound-rendering subsystems—email (Nodemailer + EJS) and PDF invoice generation (puppeteer-core)—which operate outside the normal request/response cycle and are fully optional, activating only when their env vars or browser binary are configured.

## Key elements

- **`src/infrastructure/adapters/mailer.ts`** — Nodemailer SMTP transport; the single place `createTransport(...)` is called.
- **`src/modules/<name>/emails.ts`** — Per-module email builders. Take a language argument, bind a local `t`, and return a fully-resolved `IEmailContent` (template name, subject, all body strings, locale).
- **`shared/views/**/*.ejs`** — EJS HTML email templates. Contain only `<%= … %>` interpolations; no `t()` calls.
- **`enqueueEmail()`** — Publishes a pre-built email job to the RabbitMQ `emails` queue (or sends directly via Nodemailer if RabbitMQ is absent). Adds and resolves nothing.
- **`src/modules/orders/controllers/get-order-invoice.ts`** — Renders an EJS invoice to HTML, launches a browser via `puppeteer-core`, and returns a PDF stream on the HTTP response.
- **`NODE_SMTP_*` env vars** — `HOST`, `PORT` (587 STARTTLS / 465 implicit TLS), `USER`, `PASS`, `NAME`.
- **`withSpan` wrapping** — Every SMTP send and Puppeteer call is traced via OpenTelemetry so failures appear in Tempo.

## Relationships

- **`docs/tools/docker-and-podman.md`** — `puppeteer-core` does not bundle a browser; the container image must include a system Chromium and set the executable path, or the PDF endpoint will fail at request time. This is the primary reason the PDF pipeline intersects with container build configuration.
- **`docs/tools/events-and-logging.md`** — Email sends are OTel spans (`withSpan`) that land in Tempo; the RabbitMQ `emails` queue is the event-transport mechanism that decouples the HTTP trigger from the actual SMTP call. Both appear in the events/logging documentation as traced, queued work.

## Notes

- **Interpolation ≠ translation.** Copy is resolved *before* the job is enqueued. Workers import no i18n. A template that needs a new string requires a new field in its `emails.ts` builder—otherwise EJS throws a `ReferenceError` at render time, not a silent blank line.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** renders every template in every supported locale through the real builders; this is where missing keys surface.
- **PDF failure is request-time, not boot-time.** By design, the rest of the API keeps running if the browser binary is absent.
- **Provider-agnostic SMTP.** SendGrid, SES, Mailgun, etc. all work via the same env vars (e.g. `NODE_SMTP_USER=apikey` for SendGrid). Swap to an HTTP SDK only if you need provider-specific features; that change is confined to `createTransport(...)` in `mailer.ts`.
- **Fork choice:** `puppeteer-core` (no download) vs. full `puppeteer` (auto-downloads Chromium). The boilerplate ships the `-core` variant.
