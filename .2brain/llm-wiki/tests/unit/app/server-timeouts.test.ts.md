---
source: tests/unit/app/server-timeouts.test.ts
sha256: c5e88726246fd2cf3219c6b0390b9ed7fdf8855e6d108f08aa5c523bf36cfb61
generated_at: 2026-11-08T10:03:09.736238+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/app/server-timeouts.test.ts

## Purpose

Verifies that `applyServerTimeouts` (from `src/app/security.ts`) pins the HTTP server's header, request, and keep-alive timeouts to values that defend against Slowloris and slow-POST attacks—attacks the rate limiter cannot see because they send fewer than one request per connection. Also confirms that environment-variable overrides work and that invalid values are rejected at the gate rather than silently falling back to Node's permissive defaults.

## Key elements

- **`serverStub()`** — Returns a minimal object shaped like `http.Server` with Node's stock defaults (`headersTimeout: 60_000`, `requestTimeout: 300_000`, `keepAliveTimeout: 5000`). Each test seeds this stub so assertions measure only what `applyServerTimeouts` writes.
- **`describe('applyServerTimeouts')`** — Five tests:
  - Header timeout is capped at **15 s** (vs. Node's 60 s).
  - Request timeout is capped at **120 s** (vs. Node's 300 s).
  - Request timeout remains **strictly greater than** header timeout, preserving headroom for slow uploads.
  - `NODE_HTTP_HEADERS_TIMEOUT_MS`, `NODE_HTTP_REQUEST_TIMEOUT_MS`, and `NODE_HTTP_KEEP_ALIVE_TIMEOUT_MS` override the built-in bounds when set.
  - `it.each` over invalid values (`'0'`, non-numeric strings) asserts `applyServerTimeouts` **throws** an error naming the offending variable instead of accepting the value.

## Relationships

- **`src/app/security.ts`** — Provides `applyServerTimeouts`, the single unit under test. This file imports it and asserts every observable effect it has on a `Server` instance.
- **`tests/support/environment.ts`** — Provides `setEnvironment`, used to inject `NODE_HTTP_*` variables per test case without mutating the real process environment.

## Notes

- `'0'` is the only value that must never be accepted: in Node it means "no timeout." The test asserts a throw, not a fallback to the default.
- `keepAliveTimeout` is the one bound explicitly designed to be raised **above** a reverse-proxy idle timeout; that is the stated reason it is configurable.
- The stub is cast `as Server` rather than constructing a real server—no socket is opened, so tests are fast and hermetic.
