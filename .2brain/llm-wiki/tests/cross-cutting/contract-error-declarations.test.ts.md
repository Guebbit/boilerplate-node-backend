---
source: tests/cross-cutting/contract-error-declarations.test.ts
sha256: 0d8dae304345a23c455b91b4c44f8fa375e59ff0846290aab213c8216d9da4a1
generated_at: 2026-11-08T09:25:36.029431+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-error-declarations.test.ts

## Purpose

Verifies that every OpenAPI contract fragment declares a `404` response on any operation whose path template carries an id parameter (e.g. `{id}`, `{orderId}`). This is a cross-cutting invariant: a malformed id always yields 404 (same as an unknown id), so the contract must state that on *every* such operation, not just the ones whose service happens to return a miss. The test reads the per-module fragments rather than the generated bundle so failure messages point at an editable file.

## Key elements

- **`METHODS`** – `Set` of the five valid OpenAPI operation keys (`get` … `delete`); used to filter non-operation entries out of a path object.
- **`TAKES_AN_ID`** – regex `/\{[^}]*[Ii]d}/` matching any path template whose parameter name contains "id" (case-insensitive). Matching on the parameter *name* rather than a route list is the actual trigger condition.
- **`Operation`** – interface capturing `module`, `route`, `method`, and the list of declared response `codes`.
- **`operations()`** – walks `MODULES_ROOT`, reads each module's `openapi.yaml`, parses it with the `yaml` library, and flattens every method-keyed operation into an `Operation[]`.
- **`takingAnId()`** – filters `operations()` to those whose route matches `TAKES_AN_ID`.
- **`describe('declared error responses')`** – two tests:
  - *Canary*: asserts `operations().length > 40` and `takingAnId().length ≥ 20` so the suite cannot pass vacuously if fragments are renamed or the path shape changes.
  - *404 assertion*: collects id-taking operations that omit `404` from their declared codes and expects the list to be empty.

## Relationships

- **`tests/support/paths.ts`** – provides `MODULES_ROOT` (imported as `@tests/paths`), the directory under which per-module `openapi.yaml` fragments are discovered.

## Notes

- **Scope is 404 on a path id only.** The 422 that a malformed id in a *body* or *query* produces is covered by `tests/integration/malformed-ids.test.ts`, which discovers those sites from the schema itself.
- **500 is intentionally not asserted.** A sweep over 500 finds three operations (`GET /account`, `GET /observability/events`, `GET /observability/metrics`) whose status is either an omission or a deliberate shape; deciding which is an endpoint-level question, not a cross-cutting one.
- **The contract is a shared, three-repo artifact.** `openapi.yaml` must stay byte-identical with the paired frontend and the PHP twin; an undeclared status breaks the generated client types and the twin's response-schema suite. Fixes therefore require coordinated edits across repositories.
- **Fragments, not the bundle.** The bundled `openapi.yaml` is generated; a failure in it would name a line nobody edits. Reading the fragments keeps the error message actionable.
