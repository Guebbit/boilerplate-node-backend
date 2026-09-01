# tests/unit/infrastructure/http/router-internals.test.ts

## Purpose

Pins the undocumented Express internals (`Router.stack`, `layer.route.methods`, `route.stack[].handle`) that the shared test helper `tests/support/routes.ts` relies on. If Express changes this internal shape in a future version, this single test fails with a clear message pointing at the helper that needs updating — rather than letting twelve downstream suites fail opaquely with `cannot read properties of undefined`.

## Key elements

- **`RouteLayer` interface** – Describes a layer that has a `route` object with `path`, `methods` (a `Record<string, boolean>`), and `stack` (array of `{ handle: unknown }`).
- **`UseLayer` interface** – Describes a middleware layer that lacks a `route` property and carries `handle` directly.
- **`describe('Router.stack shape')`** – Builds a minimal `Router` with one `use()` middleware and one `get('/:id')` route, then asserts:
  - `Router.stack` is still an array with the expected number of layers.
  - Route layers expose `route.methods` as an object with boolean flags and `route.stack[0].handle` as a function.
  - Use-layers have `route === undefined`, keeping them distinguishable from route layers.

## Relationships

- **`tests/support/stub.ts`** — Provides the `asStub` utility used to cast `probe` (a typed `Router`) so the test can access the undocumented `.stack` property without TypeScript errors. This is the sole import from that module.

## Notes

- The file's doc comment explicitly states: a failure here does **not** mean the application is broken; it means `tests/support/routes.ts` must be updated for the new Express shape.
- The test intentionally exercises only the *shape* of the internals, not their behavior — it will not detect functional regressions, only structural ones.
- The probe router uses a named function expression (`function isAuth`) so that `route.stack[0].handle` retains a `.name`, though the test only checks `typeof … === 'function'`.
