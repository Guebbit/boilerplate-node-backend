---
source: tests/unit/infrastructure/http/router-internals.test.ts
sha256: e17c7b2de78ea0d27463e78178b5a517fe087165282bae1b830b8e709b971fd8
generated_at: 2026-09-23T20:23:22.990649+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/router-internals.test.ts

## Purpose

Pins the shape of undocumented Express router internals (`Router.stack`, `layer.route.methods`, `route.stack[].handle`) that `tests/support/routes.ts` depends on. If Express ever changes these private structures, this single test fails with clear context instead of letting all twelve `routes.test.ts` suites cascade into cryptic `undefined` errors.

## Key elements

- **`RouteLayer` / `UseLayer` interfaces** — local type descriptions of the two layer shapes found in `Router.stack`; used to type-assert the probe's layers for the individual assertions.
- **`describe('Router.stack shape')`** — builds a minimal probe router (one `use`, one `get('/:id')`), then asserts three invariants:
    1. `stack` is an array of length 2.
    2. Route layers expose `route.methods` (a boolean map) and `route.stack[].handle` (a function).
    3. Middleware (`use`) layers have `route === undefined`, distinguishing them from route layers.
- **`asStub` (imported from `@tests/stub`)** — bypasses TypeScript's type system to access the non-public `probe.stack` property without a cast that the compiler would flag.

## Relationships

- **`tests/support/stub.ts`** — provides the `asStub` helper used to read `Router.stack`, a property absent from Express's public type definitions. This is the only cross-file dependency in the test.

## Notes

- A failure here signals that `tests/support/routes.ts` must be updated for the new Express internals. It does **not** indicate an application bug.
- The probe deliberately uses a named function expression (`function isAuth`) so that `route.stack[0].handle` is a function with a `.name`, matching what `tests/support/routes.ts` reads.
- The comment at the top of the file explicitly references a historical Express change (router split into a separate package) as motivation for keeping this guard in place.
