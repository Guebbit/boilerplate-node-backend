---
source: src/infrastructure/adapters/pdf.ts
sha256: 77f10e08d68b9cf874980be51ebeab44996d077b46618d8750cdf5bdfdfa8634
generated_at: 2026-10-01T12:50:08.689959+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/pdf.ts

## Purpose

Renders HTML strings to PDF byte arrays using headless Chromium (via `puppeteer-core`). Exists as an infrastructure adapter so that domain modules (invoicing, reporting) get a stable "HTML in → PDF bytes out" API without depending on browser-automation details, container paths, or concurrency management.

## Key elements

- **`renderHtmlToPdf(html, pdfOptions?)`** – Public entry point. Acquires a render slot, launches a browser, prints to PDF, closes the browser. Returns `Promise<Uint8Array>`. Defaults to A4 portrait.
- **`settleRenders(timeoutMs)`** – Public export. Resolves once every in-flight render has finished (or the timeout elapses). Intended for graceful-shutdown sequences.
- **`renderOnce`** (internal) – The single launch → newPage → setContent → page.pdf → close pipeline.
- **`withRenderSlot` / `acquireSlot` / `releaseSlot`** – A 2-slot counting semaphore (`MAX_CONCURRENT_RENDERS = 2`) that caps simultaneous Chromium processes to protect container memory.
- **`launchOptions()`** – Function (not constant) returning `executablePath` from `pdfConfig()` plus `--no-sandbox` / `--disable-setuid-sandbox` args.
- **`DEFAULT_PDF_OPTIONS`** – `{ format: 'A4' }`, the default geometry.

## Relationships

- **`src/infrastructure/adapters/config.ts`** – Provides `pdfConfig()`, from which this module reads `PUPPETEER_EXECUTABLE_PATH` at call time.
- **`src/infrastructure/runtime/settle.ts`** – Provides `settleWithin`, the timeout-bounded "wait for a set of promises" primitive used inside `settleRenders`.
- **`src/modules/invoicing/providers/pdf.ts`** – Domain consumer; calls `renderHtmlToPdf` to produce invoice attachments.
- **`src/infrastructure/runtime/server-lifecycle.ts`** – Calls `settleRenders` during shutdown to avoid orphaning Chromium processes.

## Notes

- **`puppeteer-core`, not `puppeteer`.** The `-core` package ships no browser; the binary must come from the base image (Alpine/Debian `chromium`). The path is read via `pdfConfig()` at call time so tests can redirect it after import.
- **`--no-sandbox` is load-bearing but risky.** Safe only because rendered HTML comes from internal EJS templates. Feeding untrusted HTML through this path is a real security exposure.
- **`setJavaScriptEnabled(false)`** is a second layer of defense: even with the sandbox disabled, template-injected scripts cannot execute.
- **`browser.close()` lives in `.finally()` on the launch chain.** Omitting it leaks a ~120 MB Chromium process per failed render.
- **`waitUntil: 'load'`** is the strongest option available in `page.setContent` under Puppeteer 25 (`networkidle0` was removed for that API). Sufficient here because templates contain no client-side fetches.
- **In-flight tracking uses `.then(f, f)` rather than `.finally`** to avoid creating a second unhandled-rejection promise when the render rejects.
- **The semaphore is deliberately inline** (a few lines of state) rather than an external dependency; its only edge case is releasing on failure, handled by `.finally(releaseSlot)`.
