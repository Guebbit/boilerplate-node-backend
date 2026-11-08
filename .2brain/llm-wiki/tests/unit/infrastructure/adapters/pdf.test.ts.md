---
source: tests/unit/infrastructure/adapters/pdf.test.ts
sha256: 50f2df7339ad9fd8027f1416281dca0be64ea63d7aaac9d7c7a315a4e95c733e
generated_at: 2026-11-08T10:09:39.226411+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/pdf.test.ts

## Purpose

Unit-test suite for the HTML → PDF adapter. It does not verify rendering (Chromium's job) but locks in four externally observable decisions—browser-binary resolution at call time, the `--no-sandbox` flags, `waitUntil: 'load'`, and `finally`-based browser cleanup—plus the concurrency cap, request-interception policy, and the `settleRenders` shutdown guard. `puppeteer-core` is fully mocked; no browser is launched.

## Key elements

- **`renderHtmlToPdf`** (imported from the adapter) — the primary SUT; tested for launch options, page lifecycle, output bytes, error propagation, and teardown.
- **`settleRenders`** (imported) — shutdown helper; tested to wait for in-flight renders, time out, and resolve immediately when idle.
- **`refuseNonDataRequest`** (imported) — request-interception handler; tested to allow `data:` URLs and abort everything else (including `file://` and cloud-metadata endpoints).
- **`RenderTimeoutError`, `MAX_WAITING_RENDERS`, `RENDER_TIMEOUT_MS`** (imported) — exported constants/error class; used in the timeout and concurrency-cap tests.
- **`heldPrint()`** — local helper returning a never-resolving Promise and a `release` thunk; simulates a print that stalls to keep a render slot occupied.
- **`holdLaunches()` / `releaseLaunches()`** — local helpers that make every `puppeteer.launch` hang until released, to verify the queue bound.
- **`lastLaunchOptions()`** — reads the most recent `launch` mock call to assert `executablePath` and `args`.
- **`make(url)`** — builds a minimal puppeteer request double (`url`, `abort`, `continue`) for interception tests.

## Relationships

- **`src/infrastructure/adapters/pdf.ts`** — the module under test; all `describe` blocks exercise its exports.
- **`src/infrastructure/runtime/busy.ts`** — imports `ServiceBusyError`, asserted when the concurrency cap is exceeded.
- **`tests/support/environment.ts`** — imports `setEnvironment` to set/unset `PUPPETEER_EXECUTABLE_PATH` between test cases without a real process environment.

## Notes

- **Close-error replaces render-error:** if `pdf` rejects *and* `close` also rejects, the caller sees the close error. This is intentional and explicitly tested—a browser that won't close is the more serious failure.
- **`waitUntil: 'load'` is asserted despite being the puppeteer default.** The test exists to prevent a silent regression if a future puppeteer version changes its default and assets print as blanks.
- **Request interception is set up before `setContent`.** A test uses `invocationCallOrder` to verify this ordering, because a request could otherwise slip out before the handler is registered.
- **Concurrency cap is 2** (`MAX_WAITING_RENDERS`). A test fires 5 simultaneous renders and asserts the peak open-browser count never exceeds 2.
- **`settleRenders` timeout** is tested with a 50 ms budget; the assertion is `< 2000 ms` to avoid flakiness while still proving it doesn't hang indefinitely.
- The file is truncated in this snapshot; the `holdLaunches`/`releaseLaunches` block and the `RenderTimeoutError` timeout tests continue beyond what is shown here.
