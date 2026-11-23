---
source: src/modules/account/tests/strategy-doubles.ts
source_sha256: 6a271f25189648e029336c3c74ab32da85187611634fd13a5b34e85bcccd6711
context_sha256: 755443b3e4fadfddcd13c5433c99a4297f095b52866fbc52f29dbf64d886e538
generated_at: 2026-11-22T04:03:32.469239+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/strategy-doubles.ts

## Purpose
Shared test doubles for the two session-strategy unit suites (cookie and JWT). It builds Express-style request and response stubs shaped the way the session strategies read them, and it records `response.cookie` calls so tests can assert on them.

## Key elements
- `SetCookieCall`: tuple type `[name, value, options]` for one `response.cookie(name, value, options)` call. `options` is `{ maxAge?: number }`.
- `requestWith({ cookie, authorization, via, userAgent })`: returns a stubbed `SessionRequest & Pick<Request, 'get'>`. All parameters are optional.
  - `cookie` becomes `cookies['__Host-session']`. With no cookie, `cookies` is `{}`.
  - `authorization` becomes `headers.authorization`. With no value, `headers` is `{}`.
  - `via` becomes `sessionVia`, the transport the guard resolved: `'cookie'` or `'bearer'`.
  - `get(name)` returns `userAgent` when `name` is `user-agent` (case-insensitive), and `undefined` for any other header.
- `recordingResponse()`: returns `{ cookie, response }`. `cookie` is a `jest.fn` typed with `SetCookieCall`. `response` is a stubbed `Response` whose `cookie` is that mock and whose `clearCookie` is a bare `jest.fn()`.
- `cookieSet(cookie, name)`: finds the first recorded call whose first argument is `name`. It returns `undefined` if that cookie was never set.

## Relationships
- `src/modules/account/session/strategy.ts`: supplies the `SessionRequest` type that `requestWith` returns. The type is imported as a type only.
- `src/modules/account/tests/unit/cookie-strategy.test.ts` and `src/modules/account/tests/unit/jwt-strategy.test.ts`: the two suites these doubles are shared by.
- `tests/support/stub.ts`: provides `asStub`, imported as `@tests/stub`. It is used to cast the partial objects to `Request` and `Response` shapes.

## Notes
- The session cookie name `__Host-session` is hardcoded in `requestWith`.
- `clearCookie` is not recorded. Only `cookie` calls can be inspected.
- The file relies on the global `jest` object, which is not imported.
