---
source: tests/unit/app/server-timeouts.test.ts
sha256: c5e88726246fd2cf3219c6b0390b9ed7fdf8855e6d108f08aa5c523bf36cfb61
generated_at: 2026-10-15T13:04:05.482970+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/app/server-timeouts.test.ts

## Purpose

Unit test for `applyServerTimeouts`, guarding the three HTTP server timeout values that defend against Slowloris and slow-POST attacks—denial-of-service vectors the rate limiter cannot detect because it counts completed requests, not in-flight connections. Without these tests, a regression back to Node's defaults (60 s headers, 300 s request) would pass silently through every other suite.

## Key elements

- **`serverStub`** — Returns a minimal object with Node's default timeout values (`headersTimeout: 60_000`, `requestTimeout: 300_000`, `keepAliveTimeout: 5000`), cast to `Server`, so the test mutates a plain object rather than a real socket.
- **`describe('applyServerTimeouts')`** — Five test cases:
  - Asserts `headersTimeout` is lowered to **15 000 ms**.
  - Asserts `requestTimeout` is lowered to **120 000 ms**.
  - Asserts `requestTimeout > headersTimeout` (leaves room for slow uploads).
  - Asserts all three bounds are overridable via `NODE_HTTP_*_TIMEOUT_MS` env vars.
  - `it.each`: Asserts that invalid values (`'0'`, `'soon'`) cause `applyServerTimeouts` to **throw** naming the offending variable, rather than silently falling back to defaults.

## Relationships

- **`src/app/security.ts`** — Provides `applyServerTimeouts`, the sole function under test. The test verifies the exact millisecond values it writes and its env-var override / validation logic.
- **`tests/support/environment.ts`** — Provides `setEnvironment`, used to inject (or reset) `NODE_HTTP_HEADERS_TIMEOUT_MS`, `NODE_HTTP_REQUEST_TIMEOUT_MS`, and `NODE_HTTP_KEEP_ALIVE_TIMEOUT_MS` between test cases.

## Notes

- The `it.each` cases use `'0'` as a sentinel: in Node, `0` on a timeout field means *infinite* (no timeout), so accepting it would silently disable the defence. The test locks in the "refuse and throw" behaviour rather than the "replace with default" behaviour.
- The `keepAliveTimeout` env-var test (72 000 ms) documents the rationale for making it configurable: it must sit above the upstream proxy's idle timeout to avoid spurious 408s.
- The stub is deliberately a plain object, not a real `http.Server`; the test verifies *which fields are set to what*, not socket-level behaviour.
