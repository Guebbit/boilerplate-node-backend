# src/infrastructure/adapters/pdf.ts

## Purpose

Provides a single exported function, `renderHtmlToPdf`, that converts a pre-rendered HTML string into a PDF `Uint8Array` by launching headless Chromium via `puppeteer-core`. It exists as an infrastructure adapter so that higher-level modules (e.g. the order-invoice controller) can obtain a PDF without knowing anything about browser management, and so the rendering strategy can be swapped without touching callers.

## Key elements

- **`renderHtmlToPdf(html, pdfOptions?)`** — the sole export. Spawns a Chromium process, opens a fresh page, sets the HTML with `waitUntil: 'networkidle0'`, calls `page.pdf()`, and returns the PDF bytes. Closes the browser in a `finally` block.
- **`DEFAULT_PDF_OPTIONS`** — `{ format: 'A4' }`; the fallback geometry when the caller doesn't supply options.
- **`launchOptions()`** — internal factory (function, not const) that reads `PUPPETEER_EXECUTABLE_PATH` at call time and returns Puppeteer launch args including `--no-sandbox` / `--disable-setuid-sandbox` for container compatibility.

## Relationships

- **`src/modules/orders/controllers/get-order-invoice.ts`** — consumer; renders an invoice template to HTML and passes the result to `renderHtmlToPdf` to attach or stream the PDF.
- **`src/infrastructure/adapters/pdf.worker.ts`** — wraps `renderHtmlToPdf` so the (potentially heavy) Chromium render can run in a worker thread rather than on the main event loop.
- **`tests/unit/infrastructure/adapters/pdf.test.ts`** — unit tests for `renderHtmlToPdf` (mocks Puppeteer, asserts PDF bytes and option forwarding).
- **`tests/unit/infrastructure/adapters/workers.test.ts`** — exercises the worker wrapper that delegates to this module.

## Notes

- `puppeteer-core` is used deliberately (not `puppeteer`) to skip the ~150 MB bundled Chromium; the binary is expected at `PUPPETEER_EXECUTABLE_PATH` or `/usr/bin/chromium-browser`.
- `launchOptions` is a **function** so `process.env` is read at call time — this lets tests override the path after the module has already been imported.
- `--no-sandbox` / `--disable-setuid-sandbox` are only safe because the HTML is always internally generated templates. Feeding untrusted HTML through this path with the sandbox disabled is a real security risk.
- A **new Chromium process is launched per call** (hundreds of ms + significant memory). Fine for on-demand invoice generation; a pooled long-lived browser would be the next step if this ever becomes a hot path.
- `page.pdf()` returns bytes (not a file), so the caller decides whether to stream, email-attach, or persist the result.
