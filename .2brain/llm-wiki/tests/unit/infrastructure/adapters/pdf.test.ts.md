---
source: tests/unit/infrastructure/adapters/pdf.test.ts
sha256: 007698db4d4265dab6cdb655b1b58cf5ed6cfe58b133b7a9338ed281ca0164c5
generated_at: 2026-09-23T20:19:44.920779+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/pdf.test.ts

## Purpose

Unit tests for `renderHtmlToPdf` from the PDF adapter. The file verifies four externally observable contracts of the adapter—call-time env-var resolution, sandbox-flag configuration, `waitUntil: 'load'` on content injection, and guaranteed browser teardown—without launching a real browser. `puppeteer-core` is fully mocked.

## Key elements

- **`lastLaunchOptions()`** – Helper that extracts the options object from the most recent `launch` mock call.
- **Mock chain** (`launch → newPage → { setContent, pdf }` + `close`) – Replaces the entire `puppeteer-core` API surface with `jest.fn`s so no browser process is ever spawned.
- **`pdfBuffer`** – A 4-byte `Uint8Array` (`%PDF` header) used as the resolved value of `page.pdf()`; tests only assert identity, not PDF validity.
- **`describe('the browser it launches')`** – Asserts `executablePath` is read at call time, the fallback is `/usr/bin/chromium-browser`, and both `--no-sandbox` / `--disable-setuid-sandbox` args are present.
- **`describe('the render')`** – Asserts `setContent` (not `goto`) is used, `waitUntil: 'load'` is explicit, default format is A4 portrait, caller-supplied geometry passes through, the resolved value is the raw `Uint8Array`, and concurrent calls each get their own browser/page.
- **`describe('teardown')`** – Covers `close` being called after success and after failures at each stage (`newPage`, `setContent`, `pdf`). Also documents that a `close` rejection _replaces_ the original render error.

## Relationships

- **`src/infrastructure/adapters/pdf.ts`** – The module under test. Imported as `@infrastructure/adapters/pdf`; the sole exported function exercised here is `renderHtmlToPdf(html, options?)`.
- **`puppeteer-core`** (mocked) – The only external dependency of the adapter. The mock guarantees no real Chromium binary is needed in CI.

## Notes

- The env-var save/restore in `afterEach` is scoped to `PUPPETEER_EXECUTABLE_PATH` only; other env vars are not touched.
- The "close failure replaces render failure" test documents a deliberate `finally`-block behavior: if both the render and the teardown reject, the caller sees the _teardown_ error. This is asserted, not treated as a bug.
- The `puppeteer-core` package ships no browser binary; the `/usr/bin/chromium-browser` fallback path is set by the adapter itself, not by Puppeteer's default.
- The file's header comment serves as the spec rationale—each test group maps to a bullet in that comment. If a test seems redundant (e.g., asserting `waitUntil: 'load'` when it is also Puppeteer's default), the comment explains it guards against a silent upstream default change.
