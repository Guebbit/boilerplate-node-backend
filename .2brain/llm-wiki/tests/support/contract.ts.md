---
source: tests/support/contract.ts
sha256: d85a55aac2741fe7aeec1d2c965457a6dcfcc1239425d501c25867e519bf5d5b
generated_at: 2026-09-23T20:10:07.165489+00:00
model: ollama:qwen3.8:27b
---

# tests/support/contract.ts

## Purpose

Registers `jest-openapi` with the repository's `openapi.yaml` so that any test can assert an HTTP response conforms to the OpenAPI spec via the `toSatisfyApiSpec()` matcher. It exists to catch **over-serialization** (fields like `password`, `_id`, `__v` leaking into responses) — a class of bug that Zod's non-strict schemas silently mask by stripping unknown keys.

## Key elements

- **`jestOpenAPI(specPath)` call** — the sole executable statement. Loads `openapi.yaml` (resolved to `<repo-root>/openapi.yaml` via `path.join(__dirname, '..', '..')`) and injects the `toSatisfyApiSpec` Jest matcher globally.
- **No exports.** The module is a side-effect import: tests do `import '@tests/contract'` (or `import 'tests/support/contract'`) purely to trigger registration.
- **Extensive header comment** — documents _why_ Zod is deliberately not used here (non-strict `zod.object` strips unknown keys; response objects are never validated by the request-only Zod schemas) and positions this file as the over-serialization guard.

## Relationships

- **Consumed by every contract test in the graph** (e.g. `src/modules/account/tests/contract/api.contract.test.ts`, `src/modules/cart/tests/contract/api.contract.test.ts`, `src/modules/payments/tests/contract/api.contract.test.ts`, etc.). Each of those files imports this module and then calls `expect(response).toSatisfyApiSpec()` against live HTTP responses.
- **Resolves to `openapi.yaml` at the repo root** — the single source of truth for the API contract that both the Orval code generator and this file consume.
- **Complementary to `api/schemas.zod.ts`** (mentioned in the comment): Zod schemas handle _request_ validation and field-level type checks; this file handles _response_ shape validation against the spec.

## Notes

- The import is **side-effect only** — there is nothing to destructure. A test file that forgets the import will get an "undefined matcher" error at runtime, not a compile-time one.
- Path resolution is relative to `tests/support/`, so `openapi.yaml` must live at the repository root. Moving this file without adjusting the `..` segments will break every consumer.
- The comment explicitly notes that Orval _can_ emit `zod.strictObject` (the frontend enables it for its mock layer), so the Zod limitation is a config choice, not a hard limitation — but no one in this repo has flipped it on for the backend response path.
