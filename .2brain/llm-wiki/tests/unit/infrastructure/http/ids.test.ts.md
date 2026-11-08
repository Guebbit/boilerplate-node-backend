---
source: tests/unit/infrastructure/http/ids.test.ts
sha256: 036c398dc1a649e3102a77513b44342d7eeb9bf43ff8b38fe9df619c9ee9d106
generated_at: 2026-11-08T10:13:03.707529+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/ids.test.ts

## Purpose

Unit tests for the HTTP id-validation layer (`src/infrastructure/http/ids.ts`). Pins the contract that a path id which is not a valid 24-hex ObjectId receives the same 404 as an unknown id, while a malformed id in a body or query receives a 422 `VALIDATION_ERROR` naming the offending field. Also exercises the Zod schema walk that discovers id-typed fields, since every body/query validation depends on it finding them all.

## Key elements

- **`isValidObjectId` tests** — verifies 24-hex acceptance (case-insensitive) and rejection of short/long/non-hex strings, plus a guard against non-string values whose `toString` mimics a valid id (hostile object, single-element array).
- **`requireId` tests** — covers the three surfaces (path, body, query): path → 404 with `NOT_FOUND`, body/query → 422 with `VALIDATION_ERROR`; i18n message resolution (string key, `null` fallback, function form); custom param name; path id wins over a body id; missing body id reported as required rather than malformed.
- **`malformedIdIssues` tests** — walks a composite Zod schema (scalars, arrays, nested objects, nullable, `z.preprocess` pipes, unions, intersections) and asserts that only fields whose schema carries `CONTRACT_ID_PATTERN` and whose input value is a string that fails `isValidObjectId` are flagged, by dotted path. Confirms it skips already-refused fields (passed `flagged` set) and non-Zod inputs.
- **`parseBody` integration tests** — confirms that `parseBody` (from `controller.ts`) invokes id validation after Zod parse: a contract-valid-but-backend-invalid id yields 422, and multiple violations (bad id + bad quantity) are both reported.
- **`idSchema()` helper** — reconstructs the generated Zod `Id` shape (`min(1).max(64).regex(CONTRACT_ID_PATTERN)`) so tests are independent of the code generator.
- **`makeRequest` / `makeResponse` helpers** — build Express `Request`/`Response` stubs via `asStub` that capture `status` + `json` calls for assertion.

## Relationships

- **`src/infrastructure/http/ids.ts`** — the module under test; all four exports (`CONTRACT_ID_PATTERN`, `isValidObjectId`, `malformedIdIssues`, `requireId`) are imported and exercised.
- **`src/infrastructure/http/controller.ts`** — `parseBody` is imported to verify that id validation is wired into the body-parsing pipeline, not just the standalone helpers.
- **`src/infrastructure/i18n/index.ts`** — `t` is imported to compute expected i18n messages in assertions (e.g. `t('orders.not-found')`, `t('validation.invalid-format', …)`).
- **`src/infrastructure/i18n/context.ts`** — provides the active i18n context that `t` resolves against during the test run.
- **`tests/support/stub.ts`** — `asStub` is used to create the `Request` and `Response` stand-ins without pulling in a full Express app.

## Notes

- The test deliberately distinguishes "contract-valid but not a real ObjectId" (`'abc'`) from "contract-invalid" — the former is the case the backend must reject even though the shared `Id` type would accept it.
- `isValidObjectId` is tested against a hostile `toString` and a one-element array because `RegExp#test` stringifies its argument; the implementation must check `typeof` first.
- `malformedIdIssues` receives an optional `flagged` set of field names the schema has already refused; the test confirms those are excluded from the result to avoid duplicate errors in `parseBody`.
- The `z.preprocess` pipe case matters: `z.preprocess(fn, idSchema())` produces a `ZodPipe` internally, and the walk must still detect the inner `idSchema()` as an id field.
