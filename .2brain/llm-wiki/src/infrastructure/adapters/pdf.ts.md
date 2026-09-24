---
source: src/infrastructure/adapters/pdf.ts
sha256: 1104f207f6fb729fbb05d1eed3f601cc86bb75212578462ab7b06dd9fe4b0ead
generated_at: 2026-09-23T17:41:13.047911+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/pdf.ts

## Purpose

Renders pre-built HTML into a PDF byte buffer via a headless Chromium process. Exists as the infrastructure adapter that turns invoice/report templates (already rendered to HTML) into the binary PDF output needed for email attachment or download.

## Key elements

- **`renderHtmlToPdf(html, pdfOptions?)`** — sole export. Spawns a one-shot Puppeteer browser, writes the HTML via `page.setContent`, waits for `load`, calls `page.pdf()`, and returns the `Uint8Array`. The browser is closed in a `finally` block.
- **`DEFAULT_PDF_OPTIONS`** — A4 portrait; the fallback when the caller doesn't specify geometry.
- **`launchOptions()`** — returns `{ executablePath, args }`. Defined as a *function* (not a const) so `process.env.PUPPETEER_EXECUTABLE_PATH` is read at call time, letting tests override the binary path after module import.

## Relationships

- **`src/modules/orders/services/invoice.ts`** — upstream consumer; calls `renderHtmlToPdf` with the invoice's EJS-rendered HTML to produce the attachment bytes.
- **`tests/unit/infrastructure/adapters/pdf.test.ts`** — unit test for this module; relies on the function-form `launchOptions` to inject a test Chromium path via the environment variable.

## Notes

- Uses `puppeteer-core` (not `puppeteer`) so no ~150 MB Chromium download occurs at install; the binary is expected from the OS package manager (`/usr/bin/chromium-browser` fallback).
- `--no-sandbox` / `--disable-setuid-sandbox` are passed because containers lack the kernel privileges Chromium's sandbox requires. This is only safe because the HTML rendered here is always an internal template — feeding untrusted HTML through an unsandboxed browser is a real XSS risk.
- One full browser process is spawned **per call** (hundreds of ms, real memory). Acceptable for on-demand invoice generation; a pooled long-lived browser would be needed if this ever becomes a hot path.
- `waitUntil: 'load'` is used because Puppeteer 25 removed `networkidle0` from `setContent` (which doesn't navigate). The `load` event guarantees static assets (CSS, images) are painted; script-fetched resources are not covered, but the templates used here perform no runtime fetches.
- The `finally(() => browser.close())` is load-bearing: omitting it leaks the Chromium process on every failed render and will exhaust container memory under repeated errors.
