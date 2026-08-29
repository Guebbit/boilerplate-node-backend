# docs/tools/fuzz-testing.md

## Purpose

Documentation page for the spec-driven fuzzing test suite. It explains how the suite auto-discovers every operation in `openapi.yaml`, generates spec-valid but hostile requests via `fast-check`, drives them at the real app with `supertest`, and asserts no 5xx responses and full spec conformance. The page exists so readers (human or AI) can understand the fuzzer's design, limitations, and operational model without reading the source.

## Key elements

- **`tests/fuzz/endpoints.fuzz.test.ts`** — the driver: one Jest case per discovered operation, the two assertions (no 5xx, response satisfies spec), and the self-tripwire test.
- **`tests/support/spec-walk.ts`** — parses `openapi.yaml`, resolves `$ref`/`allOf`, enumerates all path×method operations, and owns the `SUPPORTED_KEYWORDS` list.
- **`tests/support/spec-arbitraries.ts`** — converts JSON Schema into `fast-check` arbitraries; defines the hostile-value tables (empty strings, boundary numbers, omitted optional props, etc.).
- **`tests/support/http.ts`** — shared `supertest` harness and `authenticateAs` helper (also used by integration and contract suites).
- **`tests/support/contract.ts`** — registers `toSatisfyApiSpec()` against `openapi.yaml` (imported for side effect).
- **`.github/workflows/fuzz.yml`** — nightly schedule + manual dispatch trigger.
- **`SUPPORTED_KEYWORDS`** — the self-tripwire: the test fails if the spec uses a keyword the generator does not yet honour, preventing silent degradation to "testing only the validator."
- **Commands:** `npm run test:fuzz` (full run, not in `npm run test`); `npx jest tests/fuzz -t 'POST /products'` (target one operation).

## Relationships

No direct graph neighbors are recorded for this page. The document cross-references several sibling wiki pages it depends on for context: `contract-testing.md`, `contract-request-data.md`, `property-testing.md`, `mutation-testing.md`, and `testing-and-docs.md`. At the code level it shares `tests/support/http.ts` and `tests/support/contract.ts` with the integration and contract test suites, and delegates `multipart/form-data` coverage to `tests/integration/upload-security.test.ts`.

## Notes

- Runs are **seeded**; a failure is reproducible and the `fast-check` counterexample can be pasted directly into a regression test.
- The suite is a **nightly**, not a PR gate. A green PR does not imply fuzzer agreement.
- `multipart/form-data` operations are deliberately skipped; a test asserts the skipped set stays small.
- The `SUPPORTED_KEYWORDS` tripwire has already fired once (for `minItems`). When it fires, the only acceptable responses are teaching the generator the keyword or switching to a full OpenAPI tool—silencing is explicitly not an option.
- Generated values are **weighted**, not uniform, so edge cases like empty strings actually appear.
- The page positions this fuzzer as a lightweight alternative to `schemathesis`, justified by avoiding a Python dependency for a capability composable from existing repo tools.
