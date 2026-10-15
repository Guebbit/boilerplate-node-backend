---
source: tests/unit/infrastructure/http/ids.test.ts
sha256: b3e09b30c0011e1d3c308e5f42d85848274254609b90eba2580191c233e1647c
generated_at: 2026-10-15T13:11:24.614866+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/ids.test.ts

## Purpose

Unit tests for the HTTP ID-validation layer. Pins the behavioural contract that a malformed ObjectId in a URL path yields the same 404 as an unknown id, while the same value in a request body or query yields a 422 `VALIDATION_ERROR` naming the offending field. Also locks down the schema-walk in `malformedIdIssues` that must discover every id field in a Zod schema so that downstream body/query validation is exhaustive.

## Key elements

- **`isValidObjectId` tests** — verifies 24-hex acceptance (case-insensitive), rejection of wrong-length / wrong-char strings, and rejection of non-string values that stringify to an id (hostile `toString`, arrays).
- **`requireId` tests** — covers all three surfaces (`path`, `body`, `query`), custom param names, `notFound` copy as string / function / null, 404 vs 422 status codes, and the "path wins over body" precedence rule.
- **`malformedIdIssues` tests** — walks a Zod schema with scalar, array, nested-object, nullable, and `z.preprocess` (pipe) id fields; asserts dotted-path reporting, deduplication against already-refused fields, union/intersection traversal, and safe no-op on non-Zod or pattern-less schemas.
- **`parseBody` with id fields tests** — integration-style check that `parseBody` (from `controller.ts`) correctly delegates id-format failures to the 422 envelope and reports multiple field errors together without duplication.
- **Helpers** — `idSchema()` (rebuilds the contract `Id` Zod schema), `makeRequest` / `makeResponse` (typed stubs via `asStub`), `errorsOf` (extracts the `errors` array from the captured payload).

## Relationships

- **`src/infrastructure/http/ids.ts`** — the module under test; imports `CONTRACT_ID_PATTERN`, `isValidObjectId`, `malformedIdIssues`, `requireId`.
- **`src/infrastructure/http/controller.ts`** — source of `parseBody`, tested in the final `describe` block to confirm id validation is wired into the body-parsing path.
- **`src/infrastructure/i18n/context.ts` / `src/infrastructure/i18n/index.ts`** — provides `t()` used to assert that error messages are the resolved i18n strings (e.g. `t('orders.not-found')`, `t('validation.invalid-format', …)`).
- **`tests/support/stub.ts`** — `asStub` creates the minimal `Request`/`Response`/`ZodType` fakes that avoid spinning up Express or a real Zod runtime.

## Notes

- The `idSchema()` helper re-derives the contract schema (`min(1).max(64).regex(CONTRACT_ID_PATTERN)`) rather than importing it, so the tests stay decoupled from the generated Zod file but still validate against the same pattern constant.
- `CONTRACT_VALID_NOT_AN_OBJECT_ID` (`'abc'`) is the canonical "passes the contract but is not an ObjectId" fixture used throughout; any test that asserts 404-vs-422 distinction depends on this exact value.
- The `malformedIdIssues` tests use `.toSorted()` on the extracted field names so that assertion order is independent of internal traversal order — do not rely on insertion order when adding new cases.
- The pipe (`z.preprocess`) case in the schema is deliberately included because `z.preprocess` internally builds a `ZodPipe`; omitting it would leave that shape untested.
