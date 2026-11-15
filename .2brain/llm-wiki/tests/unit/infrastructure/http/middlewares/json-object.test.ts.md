---
source: tests/unit/infrastructure/http/middlewares/json-object.test.ts
sha256: f56d122dfe7fb054d968b4ad17f08c71e47c0559f4477cc8649972b5d20c5b85
generated_at: 2026-11-15T00:24:45.604291+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/json-object.test.ts

## Purpose

Unit tests for the `requireJsonObjectBody` Express middleware. Verifies that the middleware rejects (422) parsed JSON bodies that are not plain objects, and passes through requests whose body is an object, absent, or non-JSON.

## Key elements

- **`run(body, contentType)`** — Local helper that wires up a stubbed `Request`, `Response`, and `next`, invokes `requireJsonObjectBody`, and returns the `status` and `next` mocks for assertion.
- **`describe('requireJsonObjectBody')`** — The test suite:
  - `it.each([...])('refuses %j with a 422', …)` — Parameterised cases (number, string, boolean, null, flat array, nested array) asserting `status(422)` is called and `next` is *not*.
  - `'lets an object, including an empty one, through'` — Asserts `next` is called once for `{}` and `{ a: [1] }`, covering both `application/json` and `application/merge-patch+json` content types.
  - `'lets a request with no parsed body through'` — `body` is `undefined` and `is()` returns `false`.
  - `'judges only a JSON body'` — Non-JSON body (`'plain text'`) with `is()` returning `false` must pass.

## Relationships

- **`src/infrastructure/http/middlewares/json-object.ts`** — Source of `requireJsonObjectBody`, the unit under test. The middleware is called directly with the stubbed Express objects.
- **`tests/support/stub.ts`** — Provides `asStub<T>`, a generic helper used to cast partial mock objects into `Request`/`Response` types so they satisfy the Express signatures without needing full class instances.

## Notes

- Express's `req.is()` is stubbed to return the `contentType` parameter; this is the sole mechanism the middleware uses to decide whether the body is JSON. All "refusal" tests pass `'application/json'`; the "pass-through" non-JSON test passes `false`.
- The `status` mock is chained (`.mockReturnThis()`) to mimic Express's `res.status(...).json(...)` fluent API, but only `status` and `next` are actually asserted.
- `asStub` is used for the Request/Response objects, while `jest.fn()` is used inline for the individual methods — a deliberate mix to keep the helper readable without a full response mock.
