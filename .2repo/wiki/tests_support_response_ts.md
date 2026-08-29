# tests/support/response.ts

## Purpose

Test helper that narrows a service's `ResponseSuccess<T> | ResponseReject` union at the assertion site. Instead of an inline `as` cast (which silently succeeds even when the wrong arm is hit), these helpers **assert the expected branch first**, so a response that took the wrong path fails on that single, readable fact before any property is read from it.

## Key elements

- **`asReject<T>(response)`** — Asserts `response.success === false`, then returns the value typed as `ResponseReject`. Use when the test expects a rejected response.
- **`asSuccess<T>(response)`** — Asserts `response.success === true`, then returns the value typed as `ResponseSuccess<T> & { data: T }`, guaranteeing `data` is present (the reject arm declares it `undefined`). Use when the test expects a successful response.

Both are exported as plain arrow-function consts and rely on the global `expect` (Jest/Vitest) for the assertion.

## Relationships

- **`src/infrastructure/http/response.ts`** — Provides the `ResponseSuccess` and `ResponseReject` type imports that these helpers narrow. This file is a thin test-side wrapper over that module's type contract.
- **`src/modules/account/tests/integration/self-service.test.ts`** — Consumes `asReject` / `asSuccess` to assert the shape of service responses in integration tests.
- **`src/modules/account/tests/integration/service.test.ts`** — Same consumer relationship; uses the helpers to avoid per-assertion `as` casts.

## Notes

- The helpers call `expect` at runtime, so they are **test-only** utilities (they will throw / fail a test if the wrong branch is hit). Do not import them in production code.
- `asSuccess` deliberately intersects with `{ data: T }` to make the presence of `data` explicit in the return type, even though `ResponseSuccess<T>` already declares it — this keeps the type signature self-documenting and safe if the base type ever loosens.
- The ordering matters: the `expect` call happens **before** the cast, which is the entire point of the file. Swapping them defeats the purpose.
