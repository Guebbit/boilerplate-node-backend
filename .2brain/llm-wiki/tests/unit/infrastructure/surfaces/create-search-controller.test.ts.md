---
source: tests/unit/infrastructure/surfaces/create-search-controller.test.ts
sha256: 4eecb992e50625a695195ea036c38fb4b4cc0e75b3a6ef13a62b362c1edb944b
generated_at: 2026-10-15T13:20:55.962866+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/surfaces/create-search-controller.test.ts

## Purpose
Unit tests that pin the behavioral contract of the `createSearchController` factory — the shared search/list handler every module uses. The tests lock in how `id` is treated as a batch, how the sort grammar is parsed (query vs. body), how the module overlay (`extendInput`) overrides caller input, and what the success/refusal/failure HTTP responses look like.

## Key elements
- **`schema`** — a minimal Zod object schema (`id?: string[]`) used in the id-batch tests.
- **`sortSchema`** — a Zod schema with `sort` (1–3 enum tokens: `price`, `-price`, `title`) and `userId`, used in the overlay and refusal tests.
- **`makeRequest(query)`** — builds a stubbed Express `Request` via `asStub`, carrying the given query and a `body: undefined`.
- **`makeResponse()`** — builds a stubbed Express `Response` whose `status` and `json` are Jest mocks that return `this` (chaining).
- **`describe('id is a batch filter')`** — asserts repeated query keys produce the full array and a single value is wrapped in a one-element array.
- **`describe('the module overlay')`** — asserts `extendInput` values replace caller-supplied values, and that the overlay receives sort as a split array (not raw CSV).
- **`describe('the answer')`** — asserts the 200 success envelope (`{ success: true, data: { items } }`).
- **`describe('refusals and failures')`** — asserts 422 (with `runSearch` never called) for invalid body sort values, out-of-enum tokens, and empty arrays; 200 pass-through for valid query sort (CSV or repeated key); 500 + `success: false` when `runSearch` rejects; and that blank sort strings (`,`, ` `) are forwarded without a `sort` key.

## Relationships
- **`src/infrastructure/surfaces/create-search-controller.ts`** — the factory under test; every test calls `createSearchController({ entity, schema, runSearch, … })` and drives the returned Express handler with stubbed request/response pairs.
- **`tests/support/stub.ts`** — provides `asStub<T>`, the helper used to create the minimal `Request` and `Response` objects without a real Express instance.

## Notes
- The tests deliberately distinguish **query** `sort` (split from CSV into an array before reaching `extendInput` / `runSearch`) from **body** `sort` (must already be a valid array; a CSV string in the body is a 422). This is the single most non-obvious contract the file pins.
- `asStub` is used instead of real Express objects or supertest, keeping these as pure unit tests with no HTTP layer.
- The 500 test asserts `response.status` is called **exactly once** and **not** with 200, guarding against double-send bugs.
