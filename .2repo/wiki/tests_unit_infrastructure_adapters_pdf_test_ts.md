# tests/unit/infrastructure/adapters/pdf.test.ts

## Purpose
Unit tests for `renderHtmlToPdf` (the HTML → PDF adapter). The suite verifies four externally observable decisions—executable-path resolution at call time, sandbox flag args, `networkidle0` wait strategy, and guaranteed browser teardown via `finally`—without launching a real browser. `puppeteer-core` is fully mocked, so no Chromium binary is required in the test environment.

## Key elements
- **`pdf`, `setContent`, `close`, `newPage`, `launch`** — `jest.fn()` stubs that simulate the `puppeteer-core` API surface. `pdf` returns a canned `Uint8Array` (the byte-sequence `%PDF`).
- **`jest.mock('puppeteer-core', …)`** — replaces the module so `launch` is the top-level entry point the adapter calls.
- **`lastLaunchOptions()`** — helper that inspects the most recent `launch` call arguments.
- **`describe('renderHtmlToPdf')`** — the single top-level suite. Saves/restores `PUPPETEER_EXECUTABLE_PATH` around every test.
- **`describe('the browser it launches')`** — asserts `executablePath` is read from the env var at call time, falls back to `/usr/bin/chromium-browser`, and passes both `--no-sandbox` / `--disable-setuid-sandbox`.
- **`describe('the render')`** — asserts `setContent` is used (not `goto`), `networkidle0` is the wait strategy, `A4` is the default format, caller-supplied geometry overrides the default, the resolved value is the raw byte buffer, and each call launches its own browser + page (isolation under concurrency).
- **`describe('teardown')`** — asserts `close` is invoked exactly once for every failure stage (`newPage` reject, `setContent` reject, `pdf` reject) as well as the happy path. Also documents that a rejecting `close` inside `finally` *replaces* the original render error (the caller sees `'close failed'`, not `'print failed'`).

## Relationships
- **`src/infrastructure/adapters/pdf.ts`** — the module under test. This file imports `renderHtmlToPdf` from it and asserts every externally observable contract of that function. No other production code is imported.

## Notes
- The file deliberately tests *decisions*, not rendering fidelity. The doc comment at the top enumerates the four decisions and explains why each matters (e.g., a leaked Chromium per failed invoice exhausts the container).
- `puppeteer-core` ships no browser binary, so the fallback path `/usr/bin/chromium-browser` is a hard-coded default in the adapter, not a puppeteer default.
- The "close failure replaces render failure" test encodes an intentional `finally`-block semantic: a browser that cannot be closed is treated as the more serious error and supersedes the original rejection.
- Env-var restoration in `afterEach` is conditional (`delete` vs. reassign) to avoid leaving a stale value when the variable was originally unset.
