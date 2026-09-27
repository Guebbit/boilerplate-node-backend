---
source: tests/unit/infrastructure/surfaces/create-update-controller.test.ts
sha256: 23c2a911074433b138c6dd2ceb6ab44bf724e86dcb27193dd937e9e38efc87db
generated_at: 2026-09-27T16:11:03.908664+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/surfaces/create-update-controller.test.ts

## Purpose

Unit tests for the `createUpdateController` factory and its two exported helpers (`clearableFields`, `fillOmittedWithNull`). The tests pin the PUT/PATCH contract—PUT fills omitted clearable fields with `null` before calling `update()`, while PATCH forwards only what the caller sent—plus edge cases around validation, id resolution, multipart boolean decoding, and response shaping. The helpers are tested in isolation because a mutation in either would slip past route-level tests that never omit a field.

## Key elements

- **`replaceSchema` / `patchSchema`** – Zod schemas exercising all three field categories (required, nullable+optional, optional-but-non-nullable) used throughout the suite.
- **`makeController(overrides?)`** – Builds a `createUpdateController` spec with a default `update` mock returning `generateSuccess`; each test overrides only what it targets.
- **`makeRequest(body, id?, multipart?)`** – Wraps a plain object in an Express `Request` stub via `asStub`; the `multipart` flag makes `request.is('multipart/form-data')` return the type.
- **`describe('createUpdateController')`** – Nine cases covering: null-filling on PUT, pass-through on PATCH, explicit-null idempotency, multipart boolean decode, 422 on bad id, 422 on schema violation, service-reject passthrough (409), `present()` shaping on 200, and `idFrom` as the sole id source (no `:id` param).
- **`describe('clearableFields')`** – Asserts the function returns exactly the nullable-optional keys from a schema.
- **`describe('fillOmittedWithNull')`** – Four cases: leaves present fields alone, fills only declared fields, does not invent keys, and never mutates the input object.

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** – Module under test. Imports `createUpdateController`, `clearableFields`, `fillOmittedWithNull`, and the `UpdateControllerSpec` type.
- **`src/infrastructure/http/response.ts`** – Provides `generateSuccess` / `generateReject` used to mock the `update()` return value in every controller case.
- **`tests/support/express.ts`** – Provides `makeResponseStub`, the canned Express `Response` object whose `.status` and `.json` calls are asserted.
- **`tests/support/stub.ts`** – Provides `asStub`, which wraps a plain object into a Jest-`as`-typed stub typed as `Request`.

## Notes

- `VALID_ID` is a real 24-hex ObjectId; any other string triggers the module's `extractAndValidateId` 422 path. Use it as-is when writing new cases.
- The multipart-boolean test requires **both** the `multipart` flag on the request stub **and** `input: { booleans: ['featured'] }` in the spec—either alone will not exercise the decode branch.
- The `idFrom` test passes `id: undefined` to `makeRequest`, deliberately omitting `params.id` to mirror a self-service route (e.g. `/account`) that has no `:id` segment.
- `fillOmittedWithNull` is asserted to be **non-mutating**; a future refactor to in-place assignment will break the last case in that block.
