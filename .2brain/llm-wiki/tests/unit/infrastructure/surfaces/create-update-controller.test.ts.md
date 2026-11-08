---
source: tests/unit/infrastructure/surfaces/create-update-controller.test.ts
sha256: 1a6a2405ced5469f5e377bc9bc983e1a4a1bbb9f9013a80874e1f729285f9ac3
generated_at: 2026-11-08T10:25:51.539470+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/surfaces/create-update-controller.test.ts

## Purpose

Unit tests for the `createUpdateController` factory. Verifies the core pipeline contract — PUT fills omitted clearable fields with `null` before calling `update()`, PATCH passes only caller-supplied fields — plus the supporting behaviors: `clearableFields` enumeration, `keptWhenOmitted`, multipart boolean decoding, `idFrom` vs path-param id resolution, error short-circuits (404/422/service rejection), and conditional-write (ETag / `If-Match`) enforcement. The `clearableFields` helper is pinned in its own block because a route-level test that never omits a field would not catch a mutant in that helper.

## Key elements

- **`replaceSchema` / `patchSchema`** – Zod schemas used across every case. `replaceSchema` has one required string, one nullable+optional clearable field, and one optional non-nullable boolean; `patchSchema` is `.partial()` of the same shape.
- **`makeController(overrides?, idSource?)`** – Builds a `createUpdateController` instance with a default successful `update()`, identity `present()`, and a path-id `notFoundKey`. Each test overrides only what it exercises.
- **`makeRequest(body, id?, multipart?, ifMatch?)`** – Returns an `asStub<Request>` carrying `params.id`, `body`, a selective `is()` for multipart, and a selective `get()` for `If-Match`.
- **`describe('createUpdateController')`** – Main block. Tests PUT null-filling, `completeReplace` invocation order, `keptWhenOmitted` (omission keeps, explicit `null` clears), PATCH omission semantics, explicit-null passthrough, multipart boolean decoding, 404 on malformed id (before body read), 422 on schema violation, service-rejection forwarding (e.g. 409), `present()` shaping, and `idFrom` as an alternative id source.
- **`describe('clearableFields')`** – Asserts the helper returns exactly the fields whose schema permits `null`.
- **`describe('createUpdateController — conditional writes')`** – Uses `savingUpdate` (wraps `fencedSave`) and a response stub with `setHeader`. Verifies 412 on stale `If-Match`, 200 on matching revision, and that unversioned resources ignore `If-Match` entirely.
- **`LOADED_REVISION`** – Constant revision number shared by the conditional-write cases.
- **`VALID_ID`** – A well-formed 24-char hex ObjectId; `requireId` rejects anything else with 404.

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** – Module under test. Imports `createUpdateController`, `createPatchController`, `clearableFields`, and the `UpdateControllerSpec` / `UpdateIdSource` types.
- **`src/infrastructure/http/response.ts`** – Provides `generateSuccess` / `generateReject` used to shape `update()` return values and verify service-rejection forwarding.
- **`src/infrastructure/persistence/versioning.ts`** – Provides `etagOf` (to craft a matching `If-Match` header) and `fencedSave` (wrapped inside `savingUpdate` to simulate a real revision-guarded write).
- **`tests/support/express.ts`** – `makeResponseStub` supplies the Express `Response` mock every case passes to the controller.
- **`tests/support/stub.ts`** – `asStub` casts a plain object into a typed `Request` stub without implementing the full Express interface.

## Notes

- The file deliberately pins `clearableFields` in isolation: the docblock explains that a mutant in `fillOmittedWithNull` or `clearableFields` would pass any route test that always sends every field, so the helper needs its own assertion.
- `keptWhenOmitted` is semantically distinct from regular clearable fields: omission *preserves* the stored value (field absent from the change-set), but an explicit `null` still clears it. This models uploaded-file fields where the client cannot echo back the current value.
- The multipart boolean test exists because `multer` (or similar) delivers boolean form fields as the strings `"true"` / `"false"`; the controller must decode before Zod validation.
- The 404-on-malformed-id test uses a *bad body* (`title: ''`) simultaneously to prove the id check runs before body parsing, so a schema violation cannot mask the 404.
