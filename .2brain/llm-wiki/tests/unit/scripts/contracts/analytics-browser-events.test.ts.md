---
source: tests/unit/scripts/contracts/analytics-browser-events.test.ts
sha256: b1e7f683f83a1c7e80d4aececa3749329a74abcba117f8fe5dbe91ccb117b5f6
generated_at: 2026-10-15T13:25:25.191371+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/analytics-browser-events.test.ts

## Purpose

Unit tests for the `browserEventFragments` and `withBrowserEvents` functions in the analytics-browser-events contract script. Verifies that browser-event YAML fragments are correctly discovered, merged into an OpenAPI bundle as a `oneOf` discriminated union, and that malformed or conflicting declarations are rejected.

## Key elements

- **`scratch()`** – creates a unique temp directory under `os.tmpdir()` for writing test fragment files.
- **`fragment(schemas)`** – serialises a schema map into an OpenAPI-style YAML file inside a scratch dir and returns the file path.
- **`eventSchema(event)`** – builds a representative event schema object: an `event` field (single-value enum) plus an `id` field with a cross-file `$ref` that exercises the "make root refs local" behaviour.
- **`bundle()`** – returns a YAML string representing a bundle with the placeholder `AnalyticsEventRequest` schema alongside unrelated `Other` and `Tail` schemas.
- **`schemasOf(text)`** – parses a bundle YAML string and extracts the `components.schemas` record for assertions.
- **`describe('browserEventFragments')`** – asserts the function locates a fragment whose parent directory is `products`.
- **`describe('withBrowserEvents')`** – six cases covering: oneOf + discriminator output; insertion order and `$ref` localisation; no-op when no fragments supplied; no-op when bundle lacks the placeholder; duplicate-event-name rejection; and rejection of a non-enum `event` field.

## Relationships

- **`scripts/contracts/analytics-browser-events.ts`** – the module under test; the file imports `browserEventFragments` and `withBrowserEvents` from it.

## Notes

- Fragments are written to a real temp directory (`mkdtempSync`) rather than mocked, so the "finds on disk" test exercises actual filesystem resolution.
- The `$ref` in `eventSchema` intentionally points to a path (`../../../shared/contracts/openapi.root.yaml#/components/schemas/Id`) that does not exist on disk; the test only asserts that `withBrowserEvents` rewrites it to a local `#/components/schemas/Id`.
- The "refuses" tests assert on error message *patterns* (regex), not exact strings, so wording can change as long as the schema name and event value appear.
- Sibling contract test `tests/unit/scripts/modules/new-module-needs-nothing.test.ts` is not imported here but lives in the same directory tree and tests a complementary "no-op" scenario.
