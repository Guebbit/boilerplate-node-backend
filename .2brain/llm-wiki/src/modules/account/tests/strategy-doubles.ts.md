---
source: src/modules/account/tests/strategy-doubles.ts
sha256: 67a8a1831f555faf56aea552cb340f407294922f4de626960ba7cc014dabc11e
generated_at: 2026-11-08T04:45:16.430584+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/strategy-doubles.ts

## Purpose

Shared request and response test doubles for the two session-strategy unit suites (`cookie-strategy.test.ts` and `jwt-strategy.test.ts`). It centralises the "shape" of the Express `Request`/`Response` objects the strategies consume so neither suite has to re-implement its own mocks.

## Key elements

- **`SetCookieCall`** (type) — Tuple describing one `response.cookie(name, value, options)` invocation; used as the mock signature for the recording cookie function.
- **`requestWith(parts?)`** — Factory that returns a `SessionRequest & Pick<Request, 'get'>` stub. Accepts optional `cookie`, `authorization`, `via` (`'cookie' | 'bearer'`), and `userAgent` to build a minimal request the strategies can read. Uses `asStub` from `tests/support/stub.ts`.
- **`recordingResponse()`** — Returns `{ cookie, response }` where `cookie` is a `jest.fn` typed with `SetCookieCall` and `response` is a stub exposing `cookie` and `clearCookie`. Enables asserting *which* cookies a strategy sets.
- **`cookieSet(cookie, name)`** — Looks up the recorded call for a named cookie in the `jest.Mock` and returns the argument tuple (or `undefined` if that cookie was never set).

## Relationships

- **`src/modules/account/session/strategy.ts`** — Imports the `SessionRequest` type from this module; the doubles here must stay shape-compatible with whatever that type expects.
- **`src/modules/account/tests/unit/cookie-strategy.test.ts`** / **`jwt-strategy.test.ts`** — Both suites import `requestWith`, `recordingResponse`, and `cookieSet` from this file to build fixtures and assert on cookie writes.
- **`tests/support/stub.ts`** — Provides `asStub`, the generic wrapper this file uses to create the shallow request/response stubs.

## Notes

- `requestWith` hard-codes the session cookie name to `'__Host-session'`. If the strategy ever reads a differently-named cookie, the double will not carry it.
- The `get` method on the request stub only recognises `'user-agent'` (case-insensitive); any other header query returns `undefined`. Strategies that call `req.get` for other headers will get `undefined` without crashing.
- `cookieSet` returns the *first* matching call. If a strategy sets the same cookie twice, only the initial call is surfaced — use the raw `cookie.mock.calls` array if you need all occurrences.
