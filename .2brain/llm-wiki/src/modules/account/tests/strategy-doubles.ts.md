---
source: src/modules/account/tests/strategy-doubles.ts
sha256: 67a8a1831f555faf56aea552cb340f407294922f4de626960ba7cc014dabc11e
generated_at: 2026-10-14T14:44:13.112942+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/strategy-doubles.ts

## Purpose

Shared request and response test doubles used by the two session-strategy unit suites (cookie and JWT). It exists so both suites build their `SessionRequest` fixtures and `Response` mocks consistently instead of duplicating setup logic.

## Key elements

- **`SetCookieCall`** – Tuple type `[name, value, options]` describing the arguments of one `response.cookie()` invocation.
- **`requestWith(parts?)`** – Factory returning a stub `SessionRequest & Pick<Request, 'get'>`. Accepts optional `cookie`, `authorization`, `via` (`'cookie' | 'bearer'`), and `userAgent`. The `get` method resolves only the `user-agent` header (case-insensitive); all other names return `undefined`.
- **`recordingResponse()`** – Returns `{ cookie, response }` where `cookie` is a `jest.fn` typed as `SetCookieCall` and `response` is a stub `Response` that delegates `cookie` and `clearCookie` to the mock.
- **`cookieSet(mock, name)`** – Looks up a recorded call in the `cookie` mock by cookie name; returns the call tuple or `undefined`.

## Relationships

- **`src/modules/account/session/strategy.ts`** – Imports the `SessionRequest` type to shape the stub correctly.
- **`tests/support/stub.ts`** – Imports `asStub` to build the typed stub objects.
- **`src/modules/account/tests/unit/cookie-strategy.test.ts`** – Consumes `requestWith`, `recordingResponse`, and `cookieSet` as its fixture helpers.
- **`src/modules/account/tests/unit/jwt-strategy.test.ts`** – Same consumption; the shared doubles cover both strategies.

## Notes

- The session cookie name is hard-coded to `__Host-session`; there is no parameter to change it. If a future strategy uses a different cookie name, `requestWith` must be updated.
- `requestWith`'s `get` method is intentionally minimal—it only answers `user-agent`. Any other header lookup returns `undefined`, which is enough for the current strategies but will silently break a strategy that reads a different header via `req.get`.
- `recordingResponse` uses `jest.fn<unknown, SetCookieCall>()` so the return-value type is `unknown`; callers only assert on the recorded calls, not on the return.
