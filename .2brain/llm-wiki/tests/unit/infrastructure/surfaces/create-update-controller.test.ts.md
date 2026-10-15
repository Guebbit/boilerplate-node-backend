---
source: tests/unit/infrastructure/surfaces/create-update-controller.test.ts
sha256: 0cbd9432757197d1452cdb8d076a7234bb367baac1507f9a559bad1cb2396061
generated_at: 2026-10-15T13:21:11.790987+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/surfaces/create-update-controller.test.ts

## Purpose

Unit tests for `createUpdateController`, the shared PUT/PATCH controller factory. The core property under test is the split between PUT (fills every omitted clearable field with `null` before delegating to `update()`) and PATCH (forwards only the fields the caller sent). The file also pins the helpers `clearableFields` and `fillOmittedWithNull` in isolation, because a mutant in either would still pass any route-level test that never omits a field. A final suite covers conditional-write (ETag / `If-Match`) behavior.

## Key elements

- **`replaceSchema` / `patchSchema`** — Zod test schemas: one required field, one clearable-nullable field, one non-nullable optional field; `patchSchema` is the `.partial()` of `replaceSchema`.
- **`makeController(overrides?, idSource?)`** — builds a fully stubbed controller over the widget schemas; every test case overrides only what it exercises (`update`, `completeReplace`, `present`, `keptWhenOmitted`, `input`, etc.).
- **`makeRequest(body, id?, multipart?, ifMatch?)`** — constructs an Express `Request` stub via `asStub`; supports `multipart/form-data` detection and `If-Match` header.
- **`makeResponse()`** — response stub extended with `setHeader` (needed for ETag assertions in conditional-write tests).
- **`savingUpdate(write)`** — an `update` mock that calls `fencedSave` with a fixed `editRevision`, modelling a real service save.
- **`describe('createUpdateController')`** — PUT/PATCH pipeline: null-filling, `completeReplace` passthrough, `keptWhenOmitted`, multipart boolean decoding, 404 for bad id, 422 for schema violation, service-reject passthrough (409), `present()` shaping, `idFrom` alternative id source.
- **`describe('clearableFields')`** — asserts it returns exactly the nullable-optional field names.
- **`describe('fillOmittedWithNull')`** — asserts it fills absent declared keys, leaves present keys, ignores undeclared keys, and never mutates the input.
- **`describe('createUpdateController — conditional writes')`** — 412 on stale `If-Match`, successful write when `If-Match` matches the loaded revision (using `etagOf` / `fencedSave`).

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** — the module under test; provides `createUpdateController`, `clearableFields`, `fillOmittedWithNull`, and the `UpdateControllerSpec` / `UpdateIdSource` types.
- **`src/infrastructure/http/response.ts`** — source of `generateSuccess` / `generateReject`, used to simulate the shape the service layer returns so the controller's response branch is exercised.
- **`src/infrastructure/persistence/versioning.ts`** — source of `fencedSave` (revision-guarded write) and `etagOf` (ETag derivation); used in the conditional-write suite.
- **`tests/support/express.ts`** — provides `makeResponseStub`, the base response object most cases assert against.
- **`tests/support/stub.ts`** — provides `asStub`, used by `makeRequest` to cast a plain object to a typed Express `Request`.

## Notes

- `keptWhenOmitted` (e.g. file-upload fields) suppresses null-filling on omission but still honours an explicit `null` — a distinct semantic from the default clearable behaviour.
- The malformed-id tests assert the 404 fires *before* body validation, so a bad body cannot mask the 404.
- `idFrom` (a function returning an id) fully replaces the path `:id`; the test passes `id: undefined` to prove no path param is read.
- `fillOmittedWithNull` is verified to be a pure function (no mutation of its input object).
- `LOADED_REVISION = 4` is a module-level constant shared by all conditional-write cases; change it in one place if the fixture revision changes.
