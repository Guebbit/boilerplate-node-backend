---
source: tests/cross-cutting/api-standards.test.ts
sha256: 30ed1c55416762a6e387d3a33fd60faae0c6f38df17ec1d797164ee23f08338a
generated_at: 2026-11-08T09:23:33.475560+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/api-standards.test.ts

## Purpose

Enforces two REST standards that the docs state in prose but nothing else mechanically checks: (1) every resource whose `status` enum has more than one value must list `actions` as required, and (2) every 409 refusal in source must carry an error code that a contract fragment declares. Both rules read from **source** (module `openapi.yaml` fragments and `.ts` files under `src/`), never from a generated bundle, so a failure points at a file a developer edits.

## Key elements

- **`Fragment`, `SchemaNode`, `OperationNode`** – narrow interfaces describing only the slice of the OpenAPI/JSON-Schema document the checks actually read.
- **`contracts`** – every module under `MODULES_ROOT` that ships an `openapi.yaml`, parsed into a `Fragment`.
- **`enumValues(fragment, node)`** – resolves an `enum` by following `allOf` wrappers and local `#/components/schemas/…` `$ref`s.
- **`sourceFiles(directory)`** – recursively collects `.ts` files, skipping any directory named `tests`.
- **`callText(source, start)`** – returns the balanced-parenthesis call text starting at `start`.
- **`NOT_A_RECORD`** – regex of schema name prefixes (Search, Export, Update, Create, Observability) that carry a `status` field but are request/response envelopes, not actionable records.
- **`EXEMPT`** – map of `module.Schema` names that intentionally publish no `actions`, each with a one-line reason.
- **`lifecycleRecords`** – computed list of all non-exempt, non-envelope schemas whose `status` enum has > 1 value.
- **`CALL`** – regex matching the three call shapes that produce a 409 response (`generateReject`, `refuse`, `rejectResponse`).
- **`refusals`** – every 409 call site in `src/`, with a `file:line` location and the full call text.
- **Canary assertions** (`>= 3` records, `>= 20` refusals) – fail loudly if a layout change makes the sweep silently empty.

## Relationships

- **`tests/support/paths.ts`** – supplies `MODULES_ROOT` (base dir of module contracts) and `REPO_ROOT` (base for `src/` walks and the root `shared/contracts/openapi.root.yaml` lookup).

## Notes

- The `EXEMPT` map is a **deliberate allowlist**, not a TODO. A companion test (`keeps no exemption that has since published required actions`) fails if an exempted schema later adds `actions` to its `required`, forcing the entry to be removed.
- The 409 error-code check pulls declared codes from **both** the per-module fragments **and** the shared root contract (`shared/contracts/openapi.root.yaml`), since the root owns cross-cutting codes (idempotency, rate-limit).
- `enumValues` only resolves **local** `$ref`s within the same fragment; a cross-fragment reference would silently return `[]`.
- `sourceFiles` hard-excludes directories named `tests` at any depth to avoid matching test fixtures or mocks.
- The `CALL` regex is the single definition of "what counts as a 409-producing call." Adding a new helper that emits 409 requires extending this regex or the bare-code test will not see it.
