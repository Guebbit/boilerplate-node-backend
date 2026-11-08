---
source: tests/unit/infrastructure/http/middlewares/content-type.test.ts
sha256: 746b1f57742de34515ba9fe81041d33ea66d9011d8a30790d56d68aff7e5ce41
generated_at: 2026-11-08T10:13:33.554054+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/content-type.test.ts

## Purpose

Unit tests for the `requireDeclaredContentType` middleware (the "415 guard"). Unlike a pure-function test, this file drives the middleware with real Express `Request` prototype objects so that the media-type matching under test is the exact logic Express's `request.is` performs in production.

## Key elements

- **`TABLE`** – A local `RequestContentType[]` fixture covering five routes (JSON-only POST, form-encoded POST, multi-type PATCH, no-body DELETE, and a nested-path POST) used to instantiate the middleware under test.
- **`Sent`** – Minimal interface describing the fields a mock request must expose (`method`, `path`, optional `type`, optional `length`).
- **`run(sent)`** – Helper that builds a real Express `Request` via `Object.create(express.request)`, stubs a `Response` (capturing `status`, `json` calls), invokes the middleware, and returns `{ status?, body?, passed }`.
- **`describe('requireDeclaredContentType')`** – Eleven behavioural tests: accepted types, rejected types (415 + error body), merge-patch accept/reject, no-type DELETE, body-less requests, static-before-param ordering, trailing-slash handling, and unknown-route passthrough.
- **`describe('the generated operation table')`** – Single invariant test asserting `REQUEST_CONTENT_TYPES` is sorted ascending by `parameterCount` (the guard's static-before-param matching depends on this).

## Relationships

- **`src/infrastructure/http/middlewares/content-type.ts`** – The module under test. This file imports `requireDeclaredContentType` and calls it once per assertion.
- **`tests/support/stub.ts`** – Provides `asStub<Response>(…)` to build a typed mock that satisfies Express's `Response` interface while capturing `status()` and `json()` side-effects into the `outcome` object.

## Notes

- `path` is set via `Object.defineProperties` (not plain assignment) because Express defines it as a getter on the request prototype.
- `run` always emits a `content-length` header (default `5`). A "body-less" request must therefore be expressed as `length: 0`, not by omitting the header.
- The test file imports `REQUEST_CONTENT_TYPES` from `@api/request-content-types` to validate a sort-order invariant of the *generated* table, coupling the test to a codegen contract beyond the middleware's own logic.
