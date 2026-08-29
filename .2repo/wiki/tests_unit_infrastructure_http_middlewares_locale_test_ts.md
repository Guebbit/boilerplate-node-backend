# tests/unit/infrastructure/http/middlewares/locale.test.ts

## Purpose

Unit tests for the `attachLocale` Express middleware. They verify the four contracts the middleware must fulfil — locale negotiation onto the request, executing `next` inside an `AsyncLocalStorage`-based locale context, setting the correct response headers, and graceful degradation on malformed input — so that downstream services reading the ambient `t()` or the locale context keep working.

## Key elements

- **`makeRequest(acceptLanguage?)`** – Builds a minimal `Request` stub via `asStub` whose `get()` returns the supplied `Accept-Language` value (or `undefined`).
- **`makeResponse()`** – Builds a minimal `Response` stub whose `set` and `vary` are `jest.fn()` spies.
- **`describe('attachLocale')`** – Seven focused test cases:
  - Locale negotiation + `request.t` binding.
  - `next` executes **inside** `runWithLocaleContext` (asserted via `getCurrentLocale()` / `getLocaleContext()` seen from within the `next` callback).
  - No locale context leaks after the chain completes.
  - `Content-Language` reflects the *negotiated* (possibly fallback) locale, not the raw request.
  - `response.vary('Accept-Language')` is called (append, not replace).
  - Malformed `Accept-Language` (`;;;q=notanumber,`) does not throw; locale falls back to a supported value.
  - `next` is called exactly once.

## Relationships

- **`src/infrastructure/http/middlewares/locale.ts`** — the module under test; the test imports `attachLocale` directly.
- **`src/infrastructure/i18n/context.ts`** — provides `getCurrentLocale()` and `getLocaleContext()`, which the tests use to observe AsyncLocalStorage state from inside `next` and after the call.
- **`src/infrastructure/i18n/catalog.ts`** — provides `listSupportedLocales()`, used to assert that a negotiated (or fallback) locale is actually in the supported set.
- **`src/infrastructure/i18n/index.ts`** — barrel re-export from which the above i18n symbols are imported.
- **`tests/support/stub.ts`** — provides the `asStub` helper used to create the request and response fakes.

## Notes

- The `vary` vs. `set` distinction is intentional: the test asserts `response.vary` (which appends to an existing `Vary` header) rather than `response.set`, ensuring the middleware does not clobber a `Vary: Origin` header set earlier by CORS middleware.
- The "runs inside the locale context" test is the highest-value assertion in the suite. A regression that hoists `next()` out of `runWithLocaleContext` would leave `request.locale` and `request.t` looking correct while every ambient `t()` call silently falls back to the default language — this test catches exactly that.
- The malformed-header test feeds `;;;q=notanumber,` to exercise the parser's error path; the expectation is a silent fallback, not an exception.
