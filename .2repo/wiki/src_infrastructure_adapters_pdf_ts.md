# src/infrastructure/adapters/pdf.ts

## Purpose

Provides a single `renderHtmlToPdf` function that turns an HTML string into a PDF `Uint8Array` via headless Chromium (`puppeteer-core`). It exists so that invoice and report generation has one shared, container-friendly rendering path instead of each caller duplicating the launch/render/close boilerplate.

## Key elements

- **`renderHtmlToPdf(html, pdfOptions?)`** – Exports the sole public API. Launches a browser, opens a fresh page, calls `setContent` with `waitUntil: 'networkidle0'`, then `page.pdf()`, and always closes the browser in `finally`. Returns `Promise<Uint8Array>`.
- **`DEFAULT_PDF_OPTIONS`** – A4 portrait; used as the default `pdfOptions` argument.
- **`launchOptions()`** – Internal factory (a function, not a const) that reads `process.env.PUPPETEER_EXECUTABLE_PATH` at call time and supplies `--no-sandbox` / `--disable-setuid-sandbox` args for container compatibility.

## Relationships

- **`src/infrastructure/adapters/pdf.worker.ts`** – Consumes `renderHtmlToPdf` to execute a queued PDF-render job.
- **`src/infrastructure/adapters/queue.ts`** – Provides the job-queue transport; the PDF worker enqueues and dequeues render tasks through it.
- **`src/modules/orders/controllers/get-order-invoice.ts`** – Application-level caller that supplies invoice HTML and receives the PDF buffer for streaming or email attachment.
- **`tests/unit/infrastructure/adapters/pdf.test.ts`** – Unit tests for `renderHtmlToPdf` (likely mocks or stubs the Puppeteer layer).
- **`tests/unit/infrastructure/adapters/workers.test.ts`** – Tests the worker that drives `renderHtmlToPdf` via the queue.

## Notes

- **`puppeteer-core` vs `puppeteer`**: The `-core` package ships no Chromium binary. The executable is expected at `PUPPETEER_EXECUTABLE_PATH` or the Alpine/Debian default `/usr/bin/chromium-browser`. Setting up a CI or local dev environment without that binary will cause a launch failure.
- **`--no-sandbox`**: Only safe because the rendered HTML is internally generated templates. Feeding untrusted HTML through this path would be a real security risk.
- **`launchOptions` is a function**: Deliberately reads `process.env` at call time so tests can override the executable path *after* the module has already been imported.
- **One browser per call**: Each invocation spawns and tears down a full Chromium process (hundreds of ms, significant RAM). Acceptable for on-demand invoice generation; a pooled browser would be needed if this moves to a hot path.
- **`networkidle0` (500 ms)**: Without this, remote images/fonts/CSS referenced in the HTML routinely render as blanks in the PDF.
