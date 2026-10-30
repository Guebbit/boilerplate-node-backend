---
source: tests/cross-cutting/api-standards.test.ts
sha256: 9633514acb0682d36f58fc3d1409e3f04b2afe63e1958f9e7d131381a3b7aace
generated_at: 2026-10-29T06:43:05.168618+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/api-standards.test.ts

## Purpose

Enforces four REST API conventions (lifecycle `actions`, presenter isolation, 409 error codes, paged-list sorting) as automated checks that read directly from source files — module `openapi.yaml` fragments and `.ts` files — so a failing test always names a file a developer edits. It exists to prevent a new module from shipping half-compliant with the API standards documented in `docs/theory/tactical-ddd.md`, `docs/api/write-methods.md`, and `docs/api/sorting.md`.

## Key elements

- **`contracts`** (module-level constant) — Parses every module's `openapi.yaml` into a typed `Fragment` at import time; all four rules iterate over this list.
- **`enumValues(fragment, node)`** — Resolves an `enum` through local `$ref` and `allOf` wrappers to determine how many status values a schema has.
- **`sourceFiles(directory)`** — Recursively collects `.ts` files, skipping `tests/` subdirectories.
- **`callText(source, start)`** — Extracts a full call expression by manual parenthesis-depth matching (no AST).
- **`takesSort(operation, fragment)`** — Checks whether a paged operation accepts a `sort` query param or a `sort` property on its search-body schema.
- **`presenterFiles(module)`** — Locates `presenter.ts` / `presenters.ts` in a module folder.
- **`describe('a resource with a lifecycle status publishes required actions')`** — Sweeps all schemas with a multi-value `status` enum; asserts `actions` is in `required`. Maintains a manual `EXEMPT` allowlist (e.g., `tickets.TicketRef`, `payments.Refund`) with written justifications, and a canary count floor.
- **`describe('presenters')`** — Asserts every HTTP-owning module has a presenter file, and that presenter imports never reference `@kernel/ability`, `AuthContext`, `Caller`, or `*Service`.
- **`describe('a 409 refusal carries an error code')`** — Regex-scans `src/` for 409 call sites; asserts each names a code, and every `ERROR_CODES.X` used is declared in a contract fragment's `x-error-codes`.
- **`describe('a paged list takes sort or states its one fixed order')`** — Asserts every paged/search operation either accepts `sort` or its 200 description matches the fixed-order phrasing from `docs/api/sorting.md`.
- **`SchemaNode`, `OperationNode`, `Fragment`** — Narrow interfaces covering only the slice of OpenAPI/JSON-Schema this file reads.

## Relationships

- **`tests/support/paths.ts`** — Supplies `MODULES_ROOT` and `REPO_ROOT` constants used to locate module fragments, source trees, and the shared root contract.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Sibling test in the cross-cutting suite; shares the same `@tests/paths` dependency but has no direct import or runtime interaction with this file.

## Notes

- **Source, not bundle.** Every check reads the YAML fragments and `.ts` files a developer edits. A generated-bundle change won't break or fix these tests.
- **Regex-based 409 scanning.** The 409 rule and the presenter-import rule use regex over raw file text (not an AST). Refactoring call sites or import styles can silently break detection without changing behavior.
- **`EXEMPT` is a manual allowlist.** Adding a new schema that legitimately omits `actions` requires a new entry with a justification string; the "stale exemption" test will fail if the schema later gains `required: ["actions"]`.
- **`NOT_A_RECORD` regex** (`Search|Export|Update|Create|Observability`) carves out request/response shapes that carry a `status` field but are not caller-actionable records. New schema naming conventions may need this updated.
- **Canary floors.** Several tests assert a minimum count (≥ 3 lifecycle records, ≥ 20 refusals, ≥ 1 presenting module) to catch a silently empty sweep if the filesystem layout changes.
- **Contracts parsed at module load.** `contracts` is a top-level `const`; a new module folder with an `openapi.yaml` is picked up on the next test run without code changes.
