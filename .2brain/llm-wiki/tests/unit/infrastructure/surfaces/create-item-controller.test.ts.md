---
source: tests/unit/infrastructure/surfaces/create-item-controller.test.ts
sha256: 444788d0af66263fe1716b83982571e7ced012258679bd2c5609408763d69afd
generated_at: 2026-09-27T16:10:49.731062+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/surfaces/create-item-controller.test.ts

## Purpose

Unit tests for the `createItemController` factory. They pin the generated operation name (both the `get<Entity>Item` default and the `get<Entity><Suffix>` override via `handlerSuffix`) by observing the log line written by `rejectDatabaseError`, and they confirm that the found/not-found response contract (200 / 404) is unaffected by any naming change.

## Key elements

- **`makeRequest(id)`** — returns a stubbed Express `Request` carrying only `params.id`, sufficient for the controller under test.
- **`makeResponse()`** — returns a stubbed Express `Response` whose `status()` and `json()` are chainable `jest.fn()`s, used to assert on status code and body.
- **`describe('createItemController — operation naming')`** — two tests: default name `getWidgetItem` when `handlerSuffix` is omitted, and `getWidgetAdmin` when `handlerSuffix: 'Admin'` is supplied. Both trigger a rejected `fetch` so the error path (and thus `logger.error`) fires.
- **`describe('createItemController — found/not-found round trip…')`** — two tests: 200 + `{ success: true, data }` on a resolved row, and 404 + `{ success: false }` on `undefined`. Verifies response shape is independent of `handlerSuffix`.

## Relationships

- **`src/infrastructure/surfaces/create-item-controller.ts`** — the system under test; the file imports and exercises `createItemController` directly.
- **`src/infrastructure/adapters/logger.ts`** — module-mocked at the top of the file; tests assert on `logger.error` call arguments to observe the generated operation name.
- **`tests/support/stub.ts`** — provides `asStub<T>()`, used to build the `Request` and `Response` objects without pulling in real Express types at runtime.

## Notes

- Operation name is asserted **through the log line**, not via `handler.name`. The file documents that `namedHandler`'s computed-key rename only applies to a function literal written at that property position; a reference passed in as an argument leaves `handler.name` as `''`. This is a known, pre-existing gap in the factory, unrelated to these tests.
- The logger mock is a bare `jest.mock` with a single `error: jest.fn()`; no other logger methods are available in these tests.
- The entity used throughout is the arbitrary `'widget'`; the tests are not tied to any real domain entity (`products`, `users`).
