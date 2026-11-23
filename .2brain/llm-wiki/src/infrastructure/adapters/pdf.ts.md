---
source: src/infrastructure/adapters/pdf.ts
source_sha256: 45e5328adf1f693340ef88ce7b17af73617d0c3f6477402820b86b38060b5534
context_sha256: 2d997dd976ecaeb9d88e64cf96c6c85feb309213e2ded39ec909c12ec3fafe4a
generated_at: 2026-11-22T02:41:02.168318+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/pdf.ts

## Purpose
Renders already-built HTML (invoices, reports) into PDF bytes using headless Chromium via `puppeteer-core`. It launches one browser per render and wraps it with concurrency limits, a queue cap, a hard timeout, an SSRF guard, and shutdown support, so bursts of requests can't exhaust container memory or orphan browser processes.

## Key elements
- `renderHtmlToPdf(html, pdfOptions = { format: 'A4' })`: the public entry point. It runs the render inside a slot, tracks it in `inFlight`, and returns `Promise<Uint8Array>`.
- `settleRenders(timeoutMs)`: waits (via `settleWithin`) for all in-flight renders, up to a timeout. It is meant for shutdown.
- `MAX_WAITING_RENDERS` (10, exported): the queue depth allowed once all slots are busy.
- `RENDER_TIMEOUT_MS` (30 000, exported): the total budget for one render (launch, load, print). It is also used as Puppeteer's launch `timeout`.
- `RenderTimeoutError` (exported): thrown when the budget is exceeded. Its message is fixed.
- `refuseNonDataRequest(request)` (exported): a request-interception handler that refuses every page request except inline `data:` URLs, so template injection can't turn the renderer into an SSRF probe. The visible content cuts off partway through this function.
- Internal helpers:
  - `MAX_CONCURRENT_RENDERS` (2): the number of simultaneous Chromium processes.
  - `acquireSlot` / `releaseSlot` / `withRenderSlot`: a small counting semaphore with a bounded wait queue. `withRenderSlot` rejects with `ServiceBusyError` before taking or queueing anything when the queue is full.
  - `renderOnce`: creates a per-render temp `HOME`, launches the browser, runs the print under a deadline, and removes the `HOME` afterwards.
  - `launchOptions(home)`: builds the Puppeteer launch options at call time, so tests can change the config after import.
  - `withDeadline`: races the render against the timeout and closes the browser either way.
  - `removeHome`: deletes the temp `HOME` and only logs a warning if that fails.
  - `printIn`: called by `renderOnce`. Its definition is not in the visible portion of the file.

## Relationships
- `config.ts`: `pdfConfig().PUPPETEER_EXECUTABLE_PATH` supplies the Chromium binary path, read at call time.
- `logger.ts`: `removeHome` logs a warning when the temp-dir cleanup fails.
- `busy.ts`: `ServiceBusyError` is raised when the render queue is full. Its doc comment describes this as a 503 with `Retry-After`.
- `settle.ts`: `settleWithin` implements the bounded wait in `settleRenders`.
- `server-lifecycle.ts` and `provider-registry.ts`: runtime wiring neighbors. The visible code doesn't show how they use this file, but `settleRenders` is documented as a shutdown step.
- `src/modules/invoicing/providers/pdf.ts`: a neighbor in the dependency graph, probably the invoicing-side consumer of `renderHtmlToPdf`.
- Tests: `tests/unit/infrastructure/adapters/pdf.test.ts` and `src/modules/invoicing/tests/integration/download.test.ts` exercise this file.

## Notes
- It uses `puppeteer-core`, which ships no browser, so a Chromium binary must be supplied externally (for example, installed in the container image).
- `--no-sandbox` and `--disable-setuid-sandbox` are acceptable only because the HTML is the app's own templates. Never feed untrusted HTML through this renderer.
- `--disable-dev-shm-usage` avoids blank pages or crashes when `/dev/shm` is only 64 MB.
- Each render gets its own temp `HOME` (`render-*` under the OS temp dir). Chromium's crashpad handler needs a writable `HOME` on a read-only image, and crash dumps must not outlive the render.
- On timeout the browser is closed without awaiting, so `removeHome` may fail with ENOTEMPTY or EBUSY. That is logged and never replaces the render's result.
- `withDeadline` skips the second `close()` if the deadline already closed the browser.
- Slot counting is synchronous, so a burst of calls on the same tick can't oversubscribe the slots.
- A pooled, long-lived browser is noted in the file as the next step if this ever becomes a hot path.
