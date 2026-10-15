---
source: tests/unit/infrastructure/adapters/pdf.test.ts
sha256: 50f2df7339ad9fd8027f1416281dca0be64ea63d7aaac9d7c7a315a4e95c733e
generated_at: 2026-10-15T13:08:34.818070+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/pdf.test.ts

## Purpose

Unit test suite for the HTML → PDF adapter (`renderHtmlToPdf` and its companions). It validates four externally observable decisions—browser binary resolution timing, sandbox flags, `waitUntil: 'load'`, and guaranteed `finally`-based browser teardown—plus the concurrency cap, request-interception policy, and shutdown settling (`settleRenders`). It does not test rendering quality; `puppeteer-core` is fully mocked so no browser process is ever spawned.

## Key elements

- **`renderHtmlToPdf` tests** — verify launch options (executable path, `--no-sandbox` args), page setup order (interception before `setContent`), `waitUntil: 'load'`, A4-default vs caller-supplied geometry, one isolated page per call, and bytes-as-result contract.
- **Teardown tests** — assert `close()` is called on success *and* on every failure path (newPage reject, setContent reject, pdf reject), and that a `finally` rejection supersedes the render error.
- **`refuseNonDataRequest` tests** — confirm `data:` URLs are continued while cloud-metadata, `file://`, and any other URLs are aborted.
- **Concurrency test** — fires 5 simultaneous renders and asserts peak concurrent browsers never exceeds `MAX_WAITING_RENDERS` (2).
- **`settleRenders` tests** — verifies it awaits in-flight renders, respects a timeout bound, and resolves immediately when nothing is pending.
- **Timeout / busy-path tests** (truncated in view) — exercise `RENDER_TIMEOUT_MS`, `RenderTimeoutError`, and `ServiceBusyError` rejection when the render queue is full.
- **Helpers** — `lastLaunchOptions()`, `make(url)` (request double), `heldPrint()` (controllable in-flight print), `holdLaunches()` / `pendingLaunches` (controllable slot occupancy).

## Relationships

- **`src/infrastructure/adapters/pdf.ts`** — module under test; imports `renderHtmlToPdf`, `settleRenders`, `refuseNonDataRequest`, `MAX_WAITING_RENDERS`, `RENDER_TIMEOUT_MS`, `RenderTimeoutError`.
- **`src/infrastructure/runtime/busy.ts`** — imports `ServiceBusyError` to assert rejection when the render queue is saturated.
- **`tests/support/environment.ts`** — imports `setEnvironment` to set/clear `PUPPETEER_EXECUTABLE_PATH` before calling the adapter, proving call-time (not import-time) resolution.

## Notes

- `puppeteer-core` is mocked at the module level (`jest.mock` is hoisted above imports), so CI needs no Chromium binary.
- The critical guarantee under test is the `finally { close() }` path: without it, each failed render leaks a Chromium process, exhausting container resources.
- `refuseNonDataRequest` is a direct unit test of a pure function (no async); it is exported alongside `renderHtmlToPdf` specifically so it can be tested in isolation.
- The test for "close failure replaces render error" documents a deliberate design choice: a browser that won't close is considered the more serious fault.
- Concurrency is bounded to **2** concurrent browsers (`MAX_WAITING_RENDERS`); the 5-render test confirms the cap is enforced regardless of request volume.
