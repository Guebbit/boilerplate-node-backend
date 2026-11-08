---
source: tests/unit/infrastructure/surfaces/create-item-controller.test.ts
sha256: af9467cb4ed910a0bedda4e5b1c685347bd101a1b95575df866931823a25f247
generated_at: 2026-11-08T10:25:22.466264+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/surfaces/create-item-controller.test.ts

## Purpose
Unit tests for the `createItemController` factory (shared by `products` and `users` surfaces). The suite pins three contracts: the generated operation name (`get<Entity>Item`), the found / not-found / malformed-id response round trip, and the ETag header stamped from the row's `editRevision`.

## Key elements
- **`OBJECT_ID`** — a well-formed 24-char hex id used as the canonical valid parameter.
- **`makeRequest(id)`** — builds a stubbed Express `Request` with `params.id` set to the given value.
- **`makeResponse()`** — builds a stubbed Express `Response` with `status`, `json`, and header methods mocked to return `this`.
- **`describe('…operation naming')`** — asserts that `logger.error` is called with a message containing `getWidgetItem`, confirming the generated operation name.
- **`describe('…found/not-found round trip')`** — covers three cases: 200 + row on hit, 404 + `about:blank` body on miss, and 404 with `fetch` never invoked for a malformed id.
- **`describe('…ETag')`** — asserts `res.setHeader('ETag', '"12"')` when the fetched row carries `editRevision: 12`.

## Relationships
- **`src/infrastructure/surfaces/create-item-controller.ts`** — the module under test; the suite imports `createItemController` and exercises the returned `(req, res) => Promise<void>` handler.
- **`src/infrastructure/adapters/logger.ts`** — mocked at module level (`jest.mock`); the test reads `logger.error` call arguments to observe the operation name without depending on the real logger.
- **`tests/support/stub.ts`** — provides `asStub`, the typed-stub helper used to construct `Request` and `Response` objects with only the fields the test needs.

## Notes
- The operation name is verified **indirectly** through the logger's error line (written by `rejectDatabaseError`), not via a return value or exported constant. Any test that changes how the name is surfaced will need to adjust this observation point.
- The 404 body shape uses `type: 'about:blank'` — a project-wide convention for "no resource" responses; the test locks it in via `expect.objectContaining`.
- The malformed-id case asserts `fetch` is **not** called, pinning the "validate before DB" ordering.
- ETag value is the revision number wrapped in literal double-quotes (`"12"`), matching the HTTP ETag opaque-tag format.
