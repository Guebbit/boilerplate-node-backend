---
source: tests/unit/app/server-timeouts.test.ts
sha256: 18f9c8b9ca9dee11c3f647def679f95782a84239d9c025a3e55d95d049a107cc
generated_at: 2026-09-23T20:15:41.910880+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/app/server-timeouts.test.ts

## Purpose

Verifies that `applyServerTimeouts` (from the security module) sets header, request, and keep-alive timeouts on the HTTP server to values that defend against Slowloris and slow-POST attacks. These values are the _only_ defence against that class of denial-of-service (the rate limiter counts requests, not bytes-in-flight), and a silent regression to Node defaults would not be caught by any other suite.

## Key elements

- **`serverStub()`** — returns a minimal `Server`-typed object pre-seeded with Node's own defaults (`headersTimeout: 60_000`, `requestTimeout: 300_000`, `keepAliveTimeout: 5000`), giving each test a known "before" state.
- **`overridden` (const array)** — lists the three `NODE_HTTP_*` environment keys that tests may set; cleaned up in `afterEach` so no value leaks between tests.
- **"bounds header receipt…"** — asserts `headersTimeout` is set to 15 s, well under Node's 60 s default.
- **"bounds the whole request…"** — asserts `requestTimeout` is set to 120 s.
- **"leaves room for a slow upload…"** — asserts `requestTimeout > headersTimeout`, so a large upload over a poor link is not cut short.
- **"takes each bound from the environment…"** — confirms that when `NODE_HTTP_HEADERS_TIMEOUT_MS`, `NODE_HTTP_REQUEST_TIMEOUT_MS`, and `NODE_HTTP_KEEP_ALIVE_TIMEOUT_MS` are set, their parsed numeric values win over the built-in defaults.
- **"ignores an unusable value…"** — feeds `'0'` and `'soon'`; expects the built-in defaults to remain in place rather than the bound being disabled.

## Relationships

- **`src/app/security.ts`** — sole subject under test. The file imports `applyServerTimeouts` from `@app/security` and asserts every side-effect that function has on the `Server` instance it is handed. No other module is touched.

## Notes

- The stub intentionally contains _only_ the three fields `applyServerTimeouts` writes; if the implementation ever started touching other Server properties the test would not notice, so this is a narrow contract check.
- `0` is treated as invalid (not as "unset") because in Node it means _no timeout at all_—the one value that must never pass through.
- The `keepAliveTimeout` env override exists so a deployment can raise it above an upstream proxy's idle timeout; the test documents that motivation in a comment.
- All timeout expectations are in **milliseconds** (Node's Server contract), even though the doc comment in the source refers to seconds for readability.
