# docs/reference/scripts.md

## Purpose

Reference catalogue of every file in `scripts/`, `eslint/rules/`, and `.husky/`. It explains *what each file is* (its role, its output, whether it is a CLI or a library), complementing `tools/package-scripts.md`, which explains *when* to run each `npm run` entry.

## Key elements

- **Naming convention table** — maps verb prefixes (`check-`, `build-`, `generate-`, `run-`, `report-`, `export-`, `sync-`, no-verb) to a file's behaviour: exit-code-only, committed artifact, gitignored artifact, process driver, human summary, data write, cross-repo write, or library import.
- **Contract generation** — `build-contract-bundles.ts` (CLI + CI gate), `bundle-registry.ts` (document catalogue), `bundle-kinds.ts` (two bundle kinds + staleness comparison), `openapi-bundle.ts`, `asyncapi-bundles.ts`, `client-collections-bundle.ts`, `generate-asyncapi-types.ts` (writes `src/types/asyncapi.generated.ts`), `regenerate-artifacts.ts` (ordered top-level generator).
- **Cross-repo pairing** — `paired-frontend-path.ts` (sibling path resolution), `spec-identity.ts` (which files must match + comparison), `check-spec-identity.ts` (CI CLI), `sync-shared-files-to-frontend.ts` (write side).
- **Data & demo** — `run-demo-server.ts` (in-memory MongoDB demo), `export-demo-dataset.ts` (publishes the demo dataset with a check mode).
- **Checks** — `run-prism-smoke-test.ts` (Prism smoke test against `openapi.yaml`).
- **Mutation testing** — `run-mutation-tests.ts` (Stryker wrapper), `mutation-baseline.ts` (per-file ratchet), `check-mutation-baseline.ts` (compare / record CLI).
- **Diagnostics** — `report-test-results.ts`, `report-heap-summary.ts`, `report-heap-retainers.ts` (all `report-` prefix; never fail, never gate).
- **Repo lint rules** — two custom rules in `eslint/rules/` promoted from former tests to fix-at-keystroke enforcement.

## Relationships

- **`tools/package-scripts.md`** — the companion page; this page is "what each file is," that page is "what the user types and when."
- **`api/openapi-workflow.md`** / **`api/asyncapi-workflow.md`** — `openapi-bundle.ts` and `asyncapi-bundles.ts` / `generate-asyncapi-types.ts` are the implementation of the workflows described there.
- **`api/contract-fragmentation.md`** — `build-contract-bundles.ts` and `bundle-kinds.ts` implement the fragmentation model.
- **`api/regenerating.md`** — `regenerate-artifacts.ts` is the single entry point described on that page.
- **`reference/contracts.md`** — `bundle-registry.ts` and `client-collections-bundle.ts` operate on the documents catalogued there.
- **`reference/data.md`** — `export-demo-dataset.ts` produces the dataset described there.
- **`tools/mutation-testing.md`** — the three mutation-test scripts are the mechanism behind that tool page.
- **`tools/contract-testing.md`** — `run-prism-smoke-test.ts` is the response-side smoke test.
- **`tools/demo-profile.md`** — `run-demo-server.ts` and `export-demo-dataset.ts` implement the demo profile.
- **`reference/src-modules.md`** — `generate-asyncapi-types.ts` writes into `src/types/`, tying script output to the source tree.
- **`reference/index.md`** — this page is one entry in the reference section index.

## Notes

- `report-` scripts **never fail** (exit 0 regardless); they exist solely to produce a human-readable summary. Do not wire them into CI as gates.
- The frontend's corresponding Artisan/CLI commands use the same verb nouns in StudlyCase; keeping names aligned across repos is a convention, not an automatic mechanism.
- Abbreviated filenames are a lint error (`unicorn/prevent-abbreviations`); use full words (`directory`, not `dir`).
- `build-` and `generate-` differ only in whether the output is committed or gitignored; choosing the wrong prefix misclassifies the artifact in CI.
- `check-spec-identity.ts` degrades to a warning (not a failure) locally when the sibling checkout is missing, so a half-cloned pair can still commit.
