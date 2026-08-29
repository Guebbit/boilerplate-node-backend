# docs/reference/tests.md

## Purpose

Reference index for the entire test suite. It exists so a developer or AI assistant can look up *which* test covers a given rule without grepping the codebase. The page is organized as a table (one row per test file) where the column of interest is "what it guarantees."

## Key elements

- **Two-location split.** Co-located module tests (inside each module folder) cover single-module behavior; `tests/` covers system-wide rules. `eslint-plugin-boundaries` enforces the boundary at the import site.
- **`tests/cross-cutting/` (the "house speciality").** One file per architectural rule, asserted across all thirteen modules simultaneously. A new module is covered on the day it is added with zero new test code. The table lists ~24+ files covering: context-map edges, subdomain discipline, published barrel language, service namespaces, controller naming, locale ownership/parity, audit vocabulary, contract bundles/scalars/aliases, generated-type shadowing, seed conformance, process-snapshot single-read, authenticated-controller wiring, CI gate coverage, probe wiring, module shape/file shapes, frontend pairing, metric names, outbox names, and credential-field safety.
- **`tests/support/`.** Harness and helpers only; contains no assertions. Feeds both unit and integration suites.
- **Hierarchy (mermaid diagram).** unit → cross-cutting → integration → contract → fuzz, with `tests/support` and co-located module suites as helpers.

## Relationships

- **`docs/reference/src-modules.md`** — Several cross-cutting rows (controller-naming, locale-parity, module-shape, module-file-shapes) link here as "Read next"; those tests validate the structural contract that page describes.
- **`docs/theory/architecture.md`** — The cross-cutting suite is the executable enforcement of the architectural invariants documented there (layering, module boundaries, published language, service namespaces).
- **`docs/theory/clustering.md`** — `subdomain-discipline.test.ts` and `module-shape.test.ts` codify the clustering rules (which files belong in which module, whether the manifest/folder/registry agree).

## Notes

- The split between co-located and `tests/` is by **scope**, not convention or preference. Placing a cross-module test inside a module folder is an ESLint error.
- "Read next" links in the table point to theory or tool pages, not to other test files — follow them to understand *why* a rule exists before deciding to change it.
- `tests/support/` is deliberately assertion-free; adding assertions there breaks the contract that it is shared harness.
