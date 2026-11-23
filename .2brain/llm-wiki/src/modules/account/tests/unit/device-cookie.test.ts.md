---
source: src/modules/account/tests/unit/device-cookie.test.ts
source_sha256: 8903ffef28ca7b02d9450d84883602ba44ce5b873ee0fe389252c2235acbeb2c
context_sha256: 74f5924ca79886ef5e13f24a4084e03fc39a7cc011be0ccb35f0680d5cf2e7e3
generated_at: 2026-11-22T04:04:46.290742+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/device-cookie.test.ts

## Purpose
Unit tests for the familiar-device cookie rules in `src/modules/account/session/device-cookie.ts`. They cover what a token vouches for, how several accounts share one cookie, and that nothing verifies (or gets set) without the secret.

## Key elements
- `beforeEach` sets `NODE_DEVICE_COOKIE_SECRET` to a test value through `setEnvironment`.
- `requestFor(email, cookie?)` builds a stub Express `Request`. It carries an optional device cookie under `DEVICE_COOKIE` and an optional `body.email`.
- `remembered(email, held?)` calls `rememberDevice` against a stub `Response` whose `cookie` is a `jest.fn()`. It returns the cookie value that was set, optionally starting from an already-held cookie.
- The `describe('a device cookie')` cases assert that:
  - A cookie vouches only for the account it was set for, and the email case is ignored.
  - The cookie is `httpOnly` with a positive `maxAge`, uses the `DEVICE_COOKIE` name, and its value does not contain the account name in the clear.
  - Up to five accounts are kept, newest first, and the sixth pushes out the first.
  - A repeat login for the same account yields an identical cookie value.
  - A forged value is refused by `holdsDeviceCookie` and counted as failing by `presentsFailingDeviceCookie`.
  - No cookie at all is not a failing cookie.
  - With the secret unset, nothing verifies and `rememberDevice` never sets a cookie on the response.
  - A request with no parsed `cookies` is treated as carrying none and does not throw.
  - A request that names no account is not vouched for.

## Relationships
- Exercises `DEVICE_COOKIE`, `holdsDeviceCookie`, `presentsFailingDeviceCookie` and `rememberDevice` from `src/modules/account/session/device-cookie.ts`.
- Uses `setEnvironment` from `tests/support/environment.ts`, imported as `@tests/environment`, to set and unset the secret.
- Uses `asStub` from `tests/support/stub.ts`, imported as `@tests/stub`, to build partial `Request` and `Response` objects.

## Notes
- The tests are black-box. They read cookie values only from the mocked response `cookie` function's recorded call, never decoding the token.
- Passing `NODE_DEVICE_COOKIE_SECRET: undefined` to `setEnvironment` simulates a missing secret.
