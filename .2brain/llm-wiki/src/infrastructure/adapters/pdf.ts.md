---
source: src/infrastructure/adapters/pdf.ts
sha256: 0e66fbc18d4ee701f4410cb5070ea9df0632dde6eabb1230e4e5cc3677bc3a34
generated_at: 2026-09-27T14:07:36.320639+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/pdf.ts

## Purpose

Adapts the headless-Chromium PDF rendering pipeline (via `puppeteer-core`) behind a small, process-scoped API. It exists so that any caller needing a PDF from pre-rendered HTML (invoices, reports) gets a single `renderHtmlToPdf` call, a bounded concurrency guarantee, and a clean shutdown hook — without each caller managing its own browser process.

## Key elements

- **`renderHtmlToPdf(html, pdfOptions?)`** — Public entry point. Acquires a render slot (max 2 concurrent), launches a Chromium process, sets the HTML content with JS disabled, prints to a `Uint8Array`, and closes the browser. Tracks the render in an in-flight set until it settles.
- **`settleRenders(timeoutMs)`** — Public shutdown hook. Delegates to `settleWithin` (from the settle runtime) to wait for all in-flight renders before the process may exit.
- **`renderOnce(html, pdfOptions)`** — Private. Single launch → `newPage` → `setJavaScriptEnabled(false)` → `setContent(html, { waitUntil: 'load' })` → `page.pdf(options)` → `browser.close()` (in `finally`).
- **`withRenderSlot(task)`** — Private. Tiny counting semaphore (acquire/release) that wraps an async task so a render slot is held for exactly the duration of the task, success or failure.
- **`launchOptions()`** — Private factory (read `process.env` at call time, not import time). Returns `executablePath` (env `PUPPETEER_EXECUTABLE_PATH` or `/usr/bin/chromium-browser`) and the `--no-sandbox` / `--disable-setuid-sandbox` flags.
- **`DEFAULT_PDF_OPTIONS`** — A4 portrait; the default `page.pdf()` geometry.

## Relationships

- **`src/infrastructure/runtime/settle.ts`** — Provides `settleWithin`, imported and used by `settleRenders` to await the in-flight render set with a timeout.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Graph neighbor expected to call `settleRenders` as part of graceful shutdown so an exiting process does not orphan a running Chromium.
- **`src/modules/orders/services/invoice.ts`** — Upstream consumer; renders the invoice HTML template and passes the output to `renderHtmlToPdf` to produce the PDF attachment.
- **`tests/unit/infrastructure/adapters/pdf.test.ts`** — Unit tests for this module (concurrency cap, slot release on failure, settle behavior).

## Notes

- **`puppeteer-core`, not `puppeteer`.** The `-core` package ships no browser binary; the container image must provide Chromium at the path in `launchOptions`. Setting `PUPPETEER_EXECUTABLE_PATH` after import has no effect because the path is read at call time (the function indirection is deliberate for testability).
- **`--no-sandbox` is a trust trade-off.** It is safe only because the HTML passed in is the team's own server-side templates. If untrusted HTML ever flows through this path, the disabled sandbox + disabled JS would be a real XSS→RCE vector.
- **Concurrency cap (2) is process-wide, not per-customer.** The per-caller rate limiter (upstream) prevents one tenant from flooding, but this cap protects the container from a cross-tenant burst exhausting memory.
- **No browser pooling.** Each call spawns and kills a full Chromium process (~120 MB, hundreds of ms). This is fine for on-demand invoices; a pooled long-lived browser is the stated next step if this becomes a hot path.
- **`waitUntil: 'load'` (not `networkidle0`).** Puppeteer 25 removed `networkidle0` from `setContent` since it doesn't navigate. The templates run no scripts, so `load` (waits for images, CSS, subframes) is sufficient.
- **`inFlight` cleanup uses `then(f, f)` rather than `finally`.** A `finally` on a rejected promise creates a second unhandled rejection; the two-argument `then` removes the entry without propagating a new rejection.
