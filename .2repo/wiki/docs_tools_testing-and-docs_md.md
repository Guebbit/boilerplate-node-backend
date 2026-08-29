# docs/tools/testing-and-docs.md

## Purpose

Hub page that maps the project's eight testing layers, links to each layer's detail page, explains how to interpret test-run reports, and documents where test data comes from. It exists so a reader can orient themselves before diving into any individual testing or tooling doc.

## Key elements

- **Testing-layer flowchart (Mermaid)** — visual dependency/flow across Unit → Integration → Concurrency / Contract (Response + Request) → Fuzzing, with Property and Mutation annotated as cross-cutting.
- **Layer table** — one row per layer (Unit, Integration, Contract–Response, Contract–Request, Property, Concurrency, Fuzzing, Mutation) with the question it answers, tool(s), npm command, and link to its detail page.
- **Per-layer uniqueness notes** — bullet list explaining why no two layers duplicate each other's coverage (e.g., Contract–Response is the only layer that catches over-serialization; Mutation tests the tests, not the app).
- **"Reading a run" section** — describes `npm run test:report` and the per-module breakdown it produces; notes that `scripts/report-test-results.ts` is shared verbatim with the paired frontend.
- **Test-data source table** — four sources (`demo-data.json`, `modules/*/demo.ts`, `modules/*/factory.ts`, `tests/support/contract-data.ts`) and the distinct question each answers.
- **Test-data flowchart (Mermaid)** — shows the single-dataset pipeline (`demo.ts` → `seed:export` → `demo-data.json` → FE) alongside three independent generators (factories, contract-data, random profiles).

## Relationships

- **`docs/tools/testing-quickstart.md`** — the quickstart is the entry point that sends readers to this page for the full layer map and data-source reference.
- Links outward to eight sibling detail pages (`unit-testing.md`, `integration-testing.md`, `contract-testing.md`, `contract-request-data.md`, `property-testing.md`, `concurrency-testing.md`, `fuzz-testing.md`, `mutation-testing.md`) and `demo-profile.md`.
- References `scripts/report-test-results.ts` (shared with the paired frontend repo) and `db/demo/demo-data.json` as runtime artifacts the page documents.

## Notes

- `scripts/report-test-results.ts` is kept byte-identical in the paired frontend **by convention only**; it was previously enforced via a shared-file list that has since been narrowed to three documents.
- `demo-data.json` is the single serialized snapshot of the demo dataset; `npm run check:seed-export` gates staleness. Editing is done through each module's `demo.ts`, then republished via `npm run seed:export`—never by hand-editing the JSON.
- The "Contract–Request Data" and "Contract–Response Shape" layers share the same npm command (`npm run test:contract`) but answer opposite questions (does the validator reject illegal input vs. does the response omit undeclared fields) and use different mechanisms.
