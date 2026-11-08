---
source: tests/unit/support/body-of.test.ts
sha256: dfe135dedde494c68a06f5f94466515fd884aae0d1b51235d8d4949f84091dce
generated_at: 2026-11-08T10:43:56.813065+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/support/body-of.test.ts

## Purpose

Unit tests for the `bodyOf` helper, verifying that it extracts a response body when the HTTP status matches the schema it stands for, and that it rejects mismatches (wrong status, non-conforming body, or a schema that is not a per-status response schema).

## Key elements

- **`respond(status, body)`** – local helper that builds the minimal response shape `{ status, body }`, the only fields `bodyOf` reads.
- **`SESSION`** – a constant object (`{ token: 'abc' }`) that satisfies `Login200Response` and is used as the "good" body throughout the tests.
- **`describe('bodyOf')`** – four test cases:
  - Returns the parsed body when status and body both match the schema.
  - Throws on a wrong status, with an error message that names both the expected and actual status *and* includes the body.
  - Throws when the body fails schema validation (e.g. an unexpected `extra` key).
  - Throws when the passed schema is a plain `zod.object` rather than a per-status response schema.

## Relationships

- **`tests/support/body-of.ts`** – the module under test; `bodyOf` is imported and exercised directly in every test case.
- **`@api/schemas.zod`** – supplies `Login200Response`, the per-status zod schema used as the happy-path fixture.
- **`zod`** – used in one test to construct a non-conforming schema (`zod.object({})`) and assert the "not a per-status response" rejection.

## Notes

- The `respond` helper intentionally omits headers and other response fields; the comment in the source clarifies that it carries "only what `bodyOf` reads." If `bodyOf` ever needs to inspect additional response properties, this fixture will need updating.
- The status-mismatch test asserts a regex (`/expected 200, got 401.*success/`), coupling the test to the exact error-message wording in `body-of.ts`. Changing that message will break this assertion.
