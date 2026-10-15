---
source: tests/unit/infrastructure/http/middlewares/json-depth.test.ts
sha256: e4d1a1a439b0cbfa67c3de8174d5fa6798d06d3f4f5d1998e93b3eb3192b29de
generated_at: 2026-10-15T13:12:34.479005+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/json-depth.test.ts

## Purpose

Unit tests for the JSON depth guard middleware. Verifies that `exceedsDepth` correctly measures nesting (arrays and objects combined), that the walk is iterative (no stack overflow), and that `limitJsonDepth` rejects only non-JSON or over-limit bodies with a structured 400 response while passing valid or non-JSON bodies through.

## Key elements

- **`nestedArrays(levels)`** — builds a JSON body of `levels` nested arrays around a leaf via `JSON.parse`; used as the canonical deep-body fixture.
- **`run(body, contentType)`** — wires `asStub<Request>`/`asStub<Response>` with jest mocks for `status`, `json`, `next`, invokes `limitJsonDepth`, and returns the mock handles for assertion.
- **`describe('exceedsDepth')`** — five cases: boundary (limit vs limit+1), mixed object/array nesting, leaf/sibling depth, 50 000-level stack-safety, and scalar/empty-container baselines.
- **`describe('limitJsonDepth')`** — three cases: 400 response shape (status + JSON body with `code: 'BAD_REQUEST'`, `reason: 'body-too-deep'`, `maxDepth`) and `next` not called; pass-through within limit; non-JSON content type skipped.

## Relationships

- **`src/infrastructure/http/middlewares/json-depth.ts`** — the system under test; imports `MAX_JSON_DEPTH`, `exceedsDepth`, and `limitJsonDepth`.
- **`tests/support/stub.ts`** — provides `asStub<T>()` to construct minimal Express `Request`/`Response` objects without a running server.

## Notes

- The 50 000-level test exists specifically to guard against a regression to a recursive implementation (the file comment calls this out).
- `exceedsDepth` treats a bare scalar or empty container as depth 0, so `exceedsDepth(5, 0)` is `false` — depth counts container levels, not leaves.
- The middleware is a no-op when `req.is('application/json')` returns falsy; it never calls `next` on rejection.
