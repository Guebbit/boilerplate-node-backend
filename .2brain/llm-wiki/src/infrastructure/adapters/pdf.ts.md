---
source: src/infrastructure/adapters/pdf.ts
sha256: 3a140230bebc23bef48029a87dd323892b9a4ed836f7e990d0561932d14ce9f1
generated_at: 2026-10-14T07:47:29.201825+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/pdf.ts

## Purpose

Infrastructure-level HTML→PDF rendering adapter. Wraps a headless Chromium (via `puppeteer-core`) in a concurrency-bounded, timeout-guarded, network-locked pipeline so that invoice and report HTML can be turned into PDF byte arrays without exhausting container memory or leaking browser processes.

## Key elements

- **`renderHtmlToPdf(html, pdfOptions?)`** — Public entry point. Acquires a render slot, launches Chromium, prints the HTML to a `Uint8Array`, closes the browser. Defaults to A4 portrait.
- **`settleRenders(timeoutMs)`** — Shutdown hook: resolves once every in-flight render (tracked in the `inFlight` set) has settled, or the timeout elapses. Prevents orphaned Chromium processes on exit.
- **`refuseNonDataRequest(request)`** — Request-interception callback. Allows only `data:` URLs; aborts everything else. Prevents SSRF via template-injected `<img>`/`<link>` tags.
- **`RenderTimeoutError`** — Thrown (as a rejection) when a single render exceeds `RENDER_TIMEOUT_MS`. The browser is closed before the error propagates.
- **`MAX_CONCURRENT_RENDERS` (2) / `MAX_WAITING_RENDERS` (20) / `RENDER_TIMEOUT_MS` (20 000)** — Tuning constants for the semaphore, the wait queue, and the per-render deadline.
- **`withRenderSlot(task)`** — Internal counting-semaphore wrapper. Rejects with `ServiceBusyError` before queueing when both the pool and the wait queue are full.
- **`withDeadline(browser, work)`** — Races the render against `RENDER_TIMEOUT_MS`; on timeout or any error, closes the browser (skipping the close if the deadline already did it).
- **`printIn(browser, html, pdfOptions)`** — Opens a fresh tab, disables JavaScript, enables request interception, writes HTML via `setContent` (`waitUntil: 'load'`), and calls `page.pdf()`.
- **`launchOptions()`** — Function (not a constant) that reads `pdfConfig()` at call time so tests can swap the executable path post-import. Sets `--no-sandbox` / `--disable-setuid-sandbox`.

## Relationships

- **`src/infrastructure/adapters/config.ts`** — Source of `pdfConfig()`, which supplies `PUPPETEER_EXECUTABLE_PATH` at launch time.
- **`src/infrastructure/runtime/busy.ts`** — Source of `ServiceBusyError`, thrown (as a rejection) when the render queue is full; the caller maps it to a 503 with `Retry-After`.
- **`src/infrastructure/runtime/settle.ts`** — Source of `settleWithin`, the generic "wait for a set of promises with a deadline" utility that `settleRenders` delegates to.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Consumes `settleRenders` as a shutdown step so an exiting process does not orphan its Chromium child.
- **`src/modules/invoicing/providers/pdf.ts`** — Domain-level provider that calls `renderHtmlToPdf` to produce the invoice PDF bytes.
- **`tests/unit/infrastructure/adapters/pdf.test.ts`** — Unit tests for the semaphore, timeout, and refusal logic.
- **`src/modules/invoicing/tests/integration/download.test.ts`** — End-to-end test exercising the full render→download path.

## Notes

- **`puppeteer-core`, not `puppeteer`:** the `-core` package ships no browser; the base container image provides Chromium via the OS package manager. The path is read from config at call time, not at import time.
- **`--no-sandbox` is a deliberate security trade-off:** acceptable only because the rendered HTML comes from internal EJS templates. Feeding untrusted HTML through this adapter would be a real SSRF/RCE risk.
- **One browser per render, not a pool:** each call launches a fresh Chromium (~120 MB profile). The semaphore caps this at 2 concurrent. A pooled long-lived browser is a noted future step if this becomes a hot path.
- **`launchOptions` is a function, not a constant:** this is intentional so tests can mutate `pdfConfig` after the module is already imported.
- **`waitUntil: 'load'` (not `networkidle0`):** `setContent` does not navigate, and puppeteer 25 excludes `networkidle0` from `setContent`. `load` is sufficient because the templates run no scripts.
- **The semaphore is hand-rolled, not a library dependency:** its only non-trivial edge case is releasing the slot on rejection, handled via `.finally`.
- **`inFlight` tracking uses `then(f, f)` rather than `.finally`:** a `.finally` on an already-rejected promise would create a second unhandled rejection; `then(f, f)` avoids that.
