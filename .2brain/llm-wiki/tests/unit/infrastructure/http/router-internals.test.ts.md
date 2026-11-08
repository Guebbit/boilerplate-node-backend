---
source: tests/unit/infrastructure/http/router-internals.test.ts
sha256: e17c7b2de78ea0d27463e78178b5a517fe087165282bae1b830b8e709b971fd8
generated_at: 2026-11-08T10:18:23.661548+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/router-internals.test.ts

## Purpose

A canary test that locks in the shape of three undocumented Express internals — `Router.stack`, `layer.route.methods`, and `route.stack[].handle` — on which `tests/support/routes.ts` depends. If an Express upgrade reshapes any of those, this file fails with a single, clearly-labelled assertion instead of causing all twelve `routes.test.ts` suites to collapse with an opaque `undefined` error.

## Key elements

- **`RouteLayer` / `UseLayer` interfaces** — structural types that document the expected shape of entries in `Router.stack`. `RouteLayer` has a `route` object (`path`, `methods` map, `stack[].handle`); `UseLayer` has no `route` and carries a top-level `handle`.
- **`describe('Router.stack shape')`** — builds a minimal probe `Router` with one `.use()` middleware and one `.get()` route, then asserts three things:
  1. `stack` is a 2-element array.
  2. The route layer exposes `route.methods.get === true` and a callable `route.stack[0].handle`.
  3. The use layer has `route === undefined`, keeping the two layer types distinguishable.
- **`asStub` (from `@tests/stub`)** — used twice to silence TypeScript and read the non-public `stack` property off the router.

## Relationships

- **`tests/support/stub.ts`** — supplies `asStub`, the cast helper that lets this test read `Router.stack` without a type assertion. This is the sole import dependency.
- (Referenced in the header comment, not a dependency edge): `tests/support/routes.ts` is the consumer whose helper this test protects; `routes.test.ts` is the suite that would otherwise fail opaquely.

## Notes

- A red result here is a **build-helper** problem, not an application bug. The fix is to update `tests/support/routes.ts` to match the new Express internal shape.
- The Express team has already moved the router into a separate `router` package once, so this surface is a realistic breakage risk on any major/minor bump.
- The probe uses a *named* function expression (`function isAuth`) for the route handler so that `route.stack[0].handle` is guaranteed to be a function with a name, rather than an anonymous arrow.
