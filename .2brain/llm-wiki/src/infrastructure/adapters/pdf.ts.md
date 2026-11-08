---
source: src/infrastructure/adapters/pdf.ts
sha256: 3a140230bebc23bef48029a87dd323892b9a4ed836f7e990d0561932d14ce9f1
generated_at: 2026-11-08T03:22:25.804417+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/pdf.ts

## Purpose

Renders pre-built HTML (invoice templates, reports) into PDF byte buffers using headless Chromium. It exists as a thin infrastructure adapter so the invoicing module can produce PDFs without knowing about browser lifecycle, concurrency limits, or shutdown sequencing.

## Key elements

- **`renderHtmlToPdf(html, pdfOptions?)`** – Public entry point. Acquires a render slot, launches a one-shot Chromium, prints to a `Uint8Array`, closes the browser.
- **`settleRenders(timeoutMs)`** – Waits for all in-flight renders to finish (or the deadline to expire). Called during process shutdown to avoid orphaning a ~120 MB browser.
- **`refuseNonDataRequest(request)`** – Request-interception handler that allows only `data:` URLs; aborts everything else (SSRF guard).
- **`RenderTimeoutError`** – Thrown when a single render exceeds `RENDER_TIMEOUT_MS` (20 s).
- **`RENDER_TIMEOUT_MS` / `MAX_WAITING_RENDERS`** – Exported constants so callers (e.g. HTTP 503 responses) can surface the budget.
- **`withRenderSlot`** (internal) – Counting semaphore (max 2 concurrent) with a bounded wait queue (20). Rejects with `ServiceBusyError` before queueing when full.
- **`withDeadline`** (internal) – Races the render promise against the timeout; closes the browser in all outcomes to prevent process leaks.
- **`printIn`** (internal) – Opens a fresh page, disables JavaScript, enables request interception, calls `setContent` with `waitUntil: 'load'`, then `page.pdf()`.

## Relationships

- **`@infrastructure/adapters/config`** – Reads `pdfConfig().PUPPETEER_EXECUTABLE_PATH` at call time via `launchOptions()`.
- **`@infrastructure/runtime/busy`** – Imports `ServiceBusyError` to reject renders when the wait queue is saturated (mapped upstream to a 503 + `Retry-After`).
- **`@infrastructure/runtime/settle`** – Imports `settleWithin` to implement `settleRenders`.
- **`src/modules/invoicing/providers/pdf.ts`** – Primary consumer; calls `renderHtmlToPdf` to produce the PDF attached to invoice emails.
- **`src/infrastructure/runtime/server-lifecycle.ts`** – Calls `settleRenders` during graceful shutdown so an exiting process doesn't leave a browser behind.
- **`tests/unit/infrastructure/adapters/pdf.test.ts`** – Unit tests for slot accounting, timeout behaviour, and `refuseNonDataRequest`.
- **`src/modules/invoicing/tests/integration/download.test.ts`** – End-to-end test exercising the full render → download path.

## Notes

- **`puppeteer-core`, not `puppeteer`.** The package ships no Chromium; the binary path must be provided (container images install it via the package manager). The path is read from config at call time, not import time, so tests can redirect it.
- **`--no-sandbox` / `--disable-setuid-sandbox`** are required for containerised Chromium. This is only safe because the HTML comes from the project's own templates; feeding untrusted markup through an unsandboxed browser would be a real risk.
- **One browser per render.** No connection pooling. Fine for on-demand invoices; a pooled long-lived browser is the noted next step if this becomes a hot path.
- **JavaScript is disabled** on the render page (`setJavaScriptEnabled(false)`) as a second layer against template-injection exploits.
- **`inFlight` cleanup uses `then(f, f)`** rather than `finally` on the promise to avoid creating a second unhandled-rejection path.
- **`launchOptions` is a function, not a constant**, specifically so the executable path is re-read on every call (testability).
