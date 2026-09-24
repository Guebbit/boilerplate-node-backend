---
source: tests/unit/infrastructure/surfaces/create-search-controller.test.ts
sha256: 4147c3e3202820ed8fa57729351159707a9fe4df7bdfa926af3cc21f3a04b3f9
generated_at: 2026-09-23T20:26:50.456478+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/surfaces/create-search-controller.test.ts

## Purpose

Unit tests for the `createSearchController` factory that pin the contract: the `id` query parameter is always forwarded to `runSearch` as an **array** (batch filter), whether the client sends a repeated key (`id=a&id=b`) or a single value (`id=a`). This is the one place in the codebase where that normalization guarantee is asserted.

## Key elements

- **`schema`** — `z.object({ id: z.array(z.string()).optional() })`. The Zod schema passed to the controller under test; declares `id` as an optional string array.
- **`makeRequest(query)`** — Builds a stub `Express.Request` via `asStub` with the supplied `query` (plus empty `params`, `body: undefined`, `is: () => false`).
- **`makeResponse()`** — Builds a stub `Express.Response` whose `status()` and `json()` are `jest.fn()`s that `mockReturnThis()`.
- **`describe('createSearchController — id is a batch filter, not a lookup')`**
  - *Test 1:* query `{ id: ['a', 'b'] }` → `runSearch` receives `id: ['a', 'b']` (array preserved).
  - *Test 2:* query `{ id: 'a' }` → `runSearch` receives `id: ['a']` (single value normalized to a one-element array).

## Relationships

- **`src/infrastructure/surfaces/create-search-controller.ts`** — the system under test. The test calls `createSearchController({ entity, schema, runSearch })` to obtain the Express handler it then invokes.
- **`tests/support/stub.ts`** — provides `asStub`, which casts a plain object literal to a typed `Request`/`Response` without pulling in a full Express mock.

## Notes

- The `entity` is set to the arbitrary string `'widgets'`; it is not tied to a real domain entity (`products`, `users`, `orders`). The test is purely about the `id`-normalization contract, not entity-specific behavior.
- The Zod schema deliberately declares `id` as `z.array(z.string()).optional()`. The second test case proves the controller normalizes a scalar incoming value *before* Zod validation would reject it — the contract being pinned is at the controller layer, not the schema layer.
- `runSearch` is always a `jest.fn()` that resolves `{ items: [] }`; the tests assert only the argument passed in, never the response body.
