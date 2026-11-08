---
source: tests/unit/infrastructure/surfaces/create-search-controller.test.ts
sha256: 42e90a8c9e0eb26beeb7984076d0dbef91a2d1ea001fa55ddd1f43111f097c03
generated_at: 2026-11-08T10:25:34.374870+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/surfaces/create-search-controller.test.ts

## Purpose

Unit tests for the `createSearchController` factory. Pins the shared contract every list-and-search module relies on: `id` as a batch filter, the sort-token grammar, the `extendInput` overlay precedence, and the exact status-code / body shapes for success, refusal (422), and failure (500).

## Key elements

- **`schema`** – Minimal Zod schema (`id?: string[]`) used by the batch-filter tests.
- **`sortSchema`** – Zod schema exercising the real sort grammar: `sort?: ('price' | '-price' | 'title')[1..3]` plus an optional `userId` overlay field.
- **`makeRequest` / `makeResponse`** – Local helpers that wrap `asStub` to produce type-safe Express `Request` / `Response` fakes with the few methods the controller touches.
- **`describe` blocks** – One per concern:
  - *id is a batch filter* – repeated query key and single-value → both arrive as arrays.
  - *the module overlay* – `extendInput` value replaces caller input; `extendInput` receives the already-split sort array.
  - *the answer* – 200 + `json(result)` on success.
  - *refusals and failures* – 422 for invalid body sort / out-of-enum tokens (search never called); 500 + single `status` call when `runSearch` rejects; blank sort strings (`','`, `' '`) strip the key entirely.

## Relationships

- **`src/infrastructure/surfaces/create-search-controller.ts`** – The system under test; every `it` block calls `createSearchController` with a fresh config and asserts on the resulting handler.
- **`tests/support/stub.ts`** – Provides `asStub<T>`, a typed partial-object helper used by `makeRequest` and `makeResponse` (and directly in the body-sort tests) to build Express request/response fakes without a full supertest setup.

## Notes

- **Sort split is asymmetric.** A CSV `sort` in the *query* is split into a token array before schema validation; a `sort` in the *body* is passed through raw and therefore fails the `z.enum` check, yielding 422. Tests explicitly verify both paths.
- **Blank sort values** (`','`, `' '`) are treated as "no sort" — the `sort` key is absent from the input handed to `runSearch`, not an empty array.
- **Overlay precedence is absolute.** A caller-supplied `userId` is discarded in favor of the `extendInput` return value; the test asserts the final input equals `{ userId: 'from-session' }`.
- **500 path asserts exactly one `status` call.** This guards against a double-send (e.g., a 200 followed by a 500) if error handling regresses.
