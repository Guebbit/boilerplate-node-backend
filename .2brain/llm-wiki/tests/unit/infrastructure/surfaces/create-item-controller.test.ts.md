---
source: tests/unit/infrastructure/surfaces/create-item-controller.test.ts
sha256: 3e1bf1f50c230fa415dc935b19cf3e01f5fc156616f13e03a098ec77c1ca953d
generated_at: 2026-10-15T13:20:44.943851+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/surfaces/create-item-controller.test.ts

## Purpose

Unit tests for `createItemController`, the shared read-one factory used by both `products` and `users` surfaces. The file pins three contracts: the generated operation name (default and `handlerSuffix` override), the found / not-found / malformed-id response round-trip, and ETag stamping from `editRevision`.

## Key elements

- **`OBJECT_ID`** – a valid 24-char hex ObjectId used as the canonical "well-formed" id in every test.
- **`makeRequest(id)`** – builds a minimal `Request` stub (via `asStub`) carrying `params.id`.
- **`makeResponse()`** – builds a minimal `Response` stub with chainable `status` / `json` mocks.
- **`jest.mock('@infrastructure/adapters/logger')`** – replaces the real logger with a spy so tests can assert the operation name embedded in the `rejectDatabaseError` log line.
- **`describe('operation naming')`** – two tests asserting `logger.error` is called with a string containing `getWidgetItem` (default) or `getWidgetAdmin` (with `handlerSuffix: 'Admin'`).
- **`describe('found/not-found round trip')`** – three tests covering 200 + row, 404 + `success:false` on empty fetch, and 404 on a malformed id (verifying `fetch` is never invoked).
- **`describe('ETag')`** – one test asserting `response.setHeader` is called with `'ETag'` and the quoted revision string (`'"12"'`).

## Relationships

- **`src/infrastructure/surfaces/create-item-controller.ts`** – the system under test; `createItemController` is imported and invoked directly with varying config objects.
- **`src/infrastructure/adapters/logger.ts`** – mocked at module level; the test reads `logger.error` calls to observe the operation name the controller passes to `rejectDatabaseError`.
- **`tests/support/stub.ts`** – provides the `asStub<T>` helper used to cast plain objects into typed `Request` / `Response` stubs.

## Notes

- The operation name is **not** asserted on a return value; it is only visible through the logger call, so the test triggers the error path (`fetch` rejects) to force that log line.
- `handlerSuffix` is exercised with the value `'Admin'` to mirror the real `get-product-admin.ts` collision-avoidance use case.
- The ETag value is a **quoted** string (`'"12"'`), not a bare number — the controller serialises `editRevision` into HTTP-header form.
- The malformed-id test explicitly asserts `fetch` was **not** called, guarding against a regression where validation is skipped.
