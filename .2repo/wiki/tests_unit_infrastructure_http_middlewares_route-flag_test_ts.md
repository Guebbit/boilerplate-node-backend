# tests/unit/infrastructure/http/middlewares/route-flag.test.ts

## Purpose

Unit tests that pin the contract of the `routeFlag` middleware: it writes a named flag (as a **string**) onto `request.params` so that alternate URL patterns (e.g. `/hard` vs `?hardDelete=true`) can share a single controller entry point. End-to-end routing behaviour is covered by integration suites; these tests isolate the middleware's own mutation of the params object.

## Key elements

- **`makeRequest(params?)`** – local helper that wraps `asStub<Request>` to produce a minimal Express `Request` carrying only the given `params`.
- **`response`** – a bare `{}` cast to `Response`; passed to the middleware to satisfy the Express signature but never inspected.
- **`describe('routeFlag')`** – four test cases covering:
  - flag is written to `params` and `next` is called exactly once.
  - the value is the string `'true'`, not a boolean (route params are always strings; `readInput` does the decode).
  - an explicit second argument (e.g. `'false'`) overrides the default `'true'`.
  - pre-existing params matched by the route are left untouched.

## Relationships

- **`src/infrastructure/http/middlewares/route-flag.ts`** – the system under test; the factory `routeFlag(name, value?)` is the only production code exercised here.
- **`tests/support/stub.ts`** – provides `asStub<T>()`, a utility that returns a typed proxy/object usable as a mock for any interface; used here to fabricate the `Request` argument without a full Express app.

## Notes

- The `response` stub is intentionally inert. If a future assertion needs response methods, replace the bare cast with `asStub<Response>(…)` rather than importing a heavier mock.
- The string-vs-boolean test is load-bearing: it documents that the middleware must **not** write a native `true` into `params`, because Express params are always `string` and `readInput` performs the boolean coercion. Changing the middleware to write a boolean would break the integration path.
- No `jest.mock` or module-level spies are used; the tests rely solely on the real `routeFlag` implementation and the `next` jest function.
