---
source: tests/unit/scripts/contracts/analytics-browser-events.test.ts
sha256: 3de530ec4c1098862139ca52ff1eaceb7aa91520e25378960fb99d8fc6697bd4
generated_at: 2026-11-08T10:32:04.819142+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/analytics-browser-events.test.ts

## Purpose

Unit tests for the `analytics-browser-events` contract module. Verifies that `browserEventFragments` discovers event-schema fragment files on disk and that `withBrowserEvents` correctly assembles those fragments into an OpenAPI document: building a `oneOf` discriminator on the `AnalyticsEventRequest` placeholder, inserting event schemas in the right position, localizing root `$ref`s, and rejecting invalid inputs (duplicate event names, non-enum `event` fields).

## Key elements

- **`scratch()`** — Creates a `mkdtempSync` directory under `os.tmpdir()` and tracks it in the `made` array for later cleanup.
- **`fragment(schemas)`** — Serialises `{ components: { schemas } }` as YAML into a temp file named `openapi.browser-events.yaml`; returns the file path for passing to `withBrowserEvents`.
- **`eventSchema(event)`** — Builds a minimal object schema whose `event` property is a single-value string enum and whose `id` property is a cross-file `$ref` into `openapi.root.yaml`, simulating a real module fragment.
- **`bundle()`** — Returns a stub `OpenApiDocument` containing the placeholder `AnalyticsEventRequest` plus unrelated `Other` and `Tail` schemas, used as the base document under test.
- **`assembled(document, fragments)`** — Convenience wrapper that calls `withBrowserEvents` in-place and returns the resulting `components.schemas`.
- **`describe('browserEventFragments')`** — Asserts that the returned file list includes a path segment `products`.
- **`describe('withBrowserEvents')`** — Six cases covering: discriminator construction, schema insertion order + root-ref localisation, no-op when no events are declared, no-op when the bundle lacks `AnalyticsEventRequest`, duplicate-event rejection, and non-enum-event rejection.

## Relationships

- **`scripts/contracts/analytics-browser-events.ts`** — The module under test; the file imports `browserEventFragments` and `withBrowserEvents` directly.
- **`scripts/contracts/openapi-document.ts`** — Provides the `OpenApiDocument` type used to type the stub documents and the return of `assembled`.
- **`tests/support/stub.ts`** — Supplies `asStub`, used to cast plain objects to `OpenApiDocument` without exercising the real adapter.

## Notes

- Each call to `fragment()` spawns a **new** scratch directory (it calls `scratch()` internally). Tests that pass multiple fragments therefore write into separate temp folders; all are cleaned up via the `made` array in `afterEach`.
- The fragment files are written as `{ components: { schemas: … } }` YAML — the same shape the production `withBrowserEvents` reader expects, so the tests exercise the real file-parsing path.
- `asStub` is a type-level cast only; it does **not** invoke any runtime logic from the OpenAPI document adapter. The assertions rely on plain-object shape equality (`toEqual`, `toHaveProperty`), not on document-method calls.
