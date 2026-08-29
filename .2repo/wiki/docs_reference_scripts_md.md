# docs/reference/scripts.md

## Purpose

Reference catalog of every file in `scripts/` (the repo's own `npm run` tooling), `eslint/rules/`, and `.husky/`. It explains what each file does, how they are named, and which page to read next for workflow details. None of these scripts ship in the image.

## Key elements

- **Naming convention table** — Prefix encodes behavior: `check-` (verify, write nothing), `build-` (committed artifact), `generate-` (gitignored artifact), `run-` (start process), `report-` (human summary, never fails), `export-` (write data file), `sync-` (write into paired repo), no-verb (library, imported only). Abbreviations are a lint error.
- **Contract generation** — `build-contract-bundles.ts` (CLI + CI gate), `bundle-registry.ts` (catalogue of produced documents), `bundle-kinds.ts` (two kinds + staleness logic, builds nothing), `openapi-bundle.ts`, `asyncapi-bundles.ts`, `analytics-events-bundle.ts`, `client-collections-bundle.ts`, `generate-asyncapi-types.ts`, `regenerate-artifacts.ts` (runs all generators in order).
- **Cross-repo pairing** — `paired-frontend-path.ts` (sibling path resolution), `spec-identity.ts` (which files must match + comparison), `check-spec-identity.ts` (CLI, CI-wired, degrades to warning locally), `sync-shared-files-to-frontend.ts` (write side of identity check).
- **Data and demo** — `run-demo-server.ts` (in-memory MongoDB demo), `export-demo-dataset.ts` (publishes dataset as API serves it).
- **Checks** — `run-prism-smoke-test.ts` (boots Prism against `openapi.yaml`).
- **Mutation testing** — `run-mutation-tests.ts` (Stryker wrapper), `mutation-baseline.ts` (per-file ratchet), `check-mutation-baseline.ts` (compare / record CLI).
- **Diagnostics** — `report-test-results.ts` (failure → module mapping), `report-heap-summary.ts` (V8 heap by object kind), `report-heap-retainers.ts` (retainer edges for one object kind).
- **Repo lint rules** — Two custom ESLint rules (content truncated in source; were previously tests, now enforce at keystroke).

## Relationships

No graph neighbors are listed. The page cross-references several sibling docs (`contracts.md`, `package-scripts.md`, `pairing-and-ports.md`, `asyncapi-workflow.md`, `openapi-workflow.md`, `analytics.md`, `regenerating.md`, `demo-profile.md`, `data.md`, `contract-testing.md`, `mutation-testing.md`, `testing-and-docs.md`) as "read next" targets, but those are documentation links, not code dependencies.

## Notes

- This file is a **documentation page**, not an executable script. It mirrors the `npm run` entry names so the mapping between CLI command and implementation file is unambiguous.
- The `report-` prefix scripts are explicitly documented as "never fail" — they are diagnostic aids, not gates.
- `check-spec-identity.ts` degrades to a warning (not an error) when the paired frontend is absent locally, to avoid blocking commits on a half-cloned pair.
- `regenerate-artifacts.ts` is the single entry point to run all generators in the correct dependency order; individual generators should not be invoked directly after editing sources.
- The paired frontend and `boilerplate-php-laravel-backend` use the same words for equivalent operations (Artisan commands are the StudlyCase form of these script names).
