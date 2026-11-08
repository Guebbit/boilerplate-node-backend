---
source: tests/unit/infrastructure/http/middlewares/json-depth.test.ts
sha256: bb0c0e58b5d5951b22ea3fe6428bc919b52f6bcd79619bf35b42604fe5fdf580
generated_at: 2026-11-08T10:14:14.976490+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/json-depth.test.ts

## Purpose

Unit tests for the JSON depth-guard middleware. They verify that `exceedsDepth` correctly measures nesting depth (iteratively, without stack overflow) and that `limitJsonDepth` enforces the limit by rejecting over-deep JSON bodies with a 400 response while passing shallow or non-JSON bodies through untouched.

## Key elements

- **`nestedArrays(levels)`** – Helper that builds a JSON value of exactly `levels` deep by stringifying and parsing repeated brackets (e.g. `[[[1]]]`).
- **`run(body, contentType)`** – Helper that invokes `limitJsonDepth` with a stubbed Express `Request`/`Response` and returns the mocked `status`, `json`, and `next` functions for assertion.
- **`describe('exceedsDepth')`** – Tests the pure depth-checking function:
  - Boundary behavior (exactly at limit passes, one past fails).
  - Mixed object/array nesting counts together.
  - Leaf nodes don't add depth; depth is found in the deepest sibling.
  - 50 000-level nesting does not throw `RangeError` (validates the iterative implementation).
  - Scalars, `null`, and empty containers are always shallow.
- **`describe('limitJsonDepth')`** – Tests the middleware:
  - Over-deep JSON → `400` + structured error (`code: 'BAD_REQUEST'`, `reason: 'body-too-deep'`, `maxDepth`); `next` not called.
  - Within-limit JSON → `next()` called, no status set.
  - Non-JSON content type (`is` returns `false`) → body is not judged; `next()` called regardless of depth.

## Relationships

- **`src/infrastructure/http/middlewares/json-depth.ts`** – The module under test. The test imports `MAX_JSON_DEPTH`, `exceedsDepth`, and `limitJsonDepth` from it.
- **`tests/support/stub.ts`** – Provides `asStub`, used to create minimal structural-typed mock objects for Express `Request` and `Response` without a full framework mock.

## Notes

- The 50 000-level test exists specifically to guard against a regression to recursive traversal; a recursive walk would throw `RangeError` on that input.
- The `run` helper stubs `req.is` to return the `contentType` argument, so the "not JSON" path is exercised without real content negotiation.
- `exceedsDepth` is treated as a public, independently testable unit separate from the middleware wrapper—its contract is a pure boolean, not tied to Express.
