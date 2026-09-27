---
source: tests/unit/infrastructure/adapters/pdf.test.ts
sha256: 50ed2b827d6b82dd350a74a4dc7c7b4a87cc45b3bdfa779a7f78990566214dba
generated_at: 2026-09-27T16:05:27.673146+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/pdf.test.ts

## Purpose

Unit-test suite for the HTML → PDF adapter (`renderHtmlToPdf` and `settleRenders`). It locks down four externally observable decisions that the adapter makes on behalf of the suite: call-time binary resolution, sandbox flags, `waitUntil: 'load'`, and guaranteed browser teardown. All tests run against a `puppeteer-core` mock, so no browser binary is required.

## Key elements

- **`renderHtmlToPdf` describe block** — verifies launch options (executable path from `PUPPETEER_EXECUTABLE_PATH` or `/usr/bin/chromium-browser` fallback, `--no-sandbox` + `--disable-setuid-sandbox`), render mechanics (`setContent` with `waitUntil: 'load'`, JS disabled, A4 default, caller-supplied geometry passthrough, byte-array return value, one isolated page per call, max 2 concurrent browsers), and teardown (`close` called on success and on every failure path).
- **`settleRenders` describe block** — confirms the function awaits an in-flight render before resolving, respects a timeout (ms) without hanging shutdown, and resolves immediately when nothing is pending.
- **`heldPrint()`** — local helper that creates a deferred promise so a test can hold a print in flight and release it on demand.
- **`lastLaunchOptions()`** — pulls the argument object from the most recent `launch` mock call.
- **`jest.mock('puppeteer-core', …)`** — factory mock exposing `launch` wired to the individual jest fns (`newPage`, `setContent`, `pdf`, `close`, `setJavaScriptEnabled`).
- **`afterEach`** — restores or deletes `PUPPETEER_EXECUTABLE_PATH` to prevent cross-test contamination.

## Relationships

- **`src/infrastructure/adapters/pdf.ts`** — the sole system under test. This file imports `renderHtmlToPdf` and `settleRenders` from it and asserts their observable contract. The mock of `puppeteer-core` is placed before that import so the adapter module resolves against the fake at load time.

## Notes

- **Error precedence in `finally`**: if both the render and `close` throw, the test asserts that the *close* error surfaces (the `finally` rejection replaces the original). This is intentional and documented inline; do not "fix" it to propagate the render error.
- **Concurrency cap of 2**: the adapter limits simultaneous browser instances to 2. The test uses a custom `launch` mock that tracks open/close counts to verify the peak never exceeds 2 across 5 parallel renders.
- **`waitUntil: 'load'` is asserted even though it equals the puppeteer default.** The comment explains: the assertion guards against a future puppeteer version changing its default to something that would silently print blank assets.
- **`settleRenders` timeout is in milliseconds** (e.g. `settleRenders(50)`). The "gives up" test asserts elapsed time < 2000 ms to account for scheduling jitter.
- **No real Chromium is ever launched.** `puppeteer-core` (not `puppeteer`) is mocked, and the fallback executable path (`/usr/bin/chromium-browser`) is never actually resolved by a real launcher.
