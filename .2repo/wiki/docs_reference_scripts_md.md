# docs/reference/scripts.md

## Purpose

Reference catalog of every file under `scripts/` and `eslint/rules/`, explaining what each file *is* (its role, its npm-run entry, and its neighbors in the contract/tooling graph). Complements `docs/tools/package-scripts.md`, which covers the user-facing names and when to run them; this page covers the file-level implementation landscape.

## Key elements

- **Contract generation** — `build-contract-bundles.ts` (CLI + CI check mode), `contracts/bundle-registry.ts` (catalogue of owned documents), `contracts/bundle-kinds.ts` (two bundle kinds + staleness logic, no building), `contracts/openapi-bundle.ts`, `contracts/asyncapi-bundles.ts`, `contracts/client-collections-bundle.ts`, `generate-asyncapi-types.ts` (byte-identical to frontend copy), `regenerate-artifacts.ts` (ordered top-level driver).
- **Cross-repo pairing** — `paired-frontend-path.ts` (sibling location + env override), `spec-identity.ts` (which files must match + comparison), `check-spec-identity.ts` (CLI, CI-wired, degrades to warning locally), `sync-shared-files-to-frontend.ts` (write side of the identity check).
- **Data & demo** — `run-demo-server.ts` (in-memory MongoDB demo, backs frontend e2e), `export-demo-dataset.ts` (publishes dataset as served, has check mode).
- **Checks** — `run-prism-smoke-test.ts` (boots Prism against `openapi.yaml`, smoke-tests the contract not the app).
- **Mutation testing** — `run-mutation-tests.ts` (Stryker wrapper), `mutation-baseline.ts` (per-file ratchet + comparison), `check-mutation-baseline.ts` (CLI for compare/record).
- **Diagnostics** — `report-test-results.ts` (maps JSON test output to module + timing; never fails).
- **Lint rules** — `eslint/rules/index.ts` (plugin barrel), `eslint/rules/controller-chain-must-catch.ts` (promise chain in controller must end in catch), plus a second rule (content truncated).

## Relationships

- Links outward to **`docs/tools/package-scripts.md`** as the canonical "when to run" reference.
- Every "Read next" column points into **`docs/api/asyncapi-workflow.md`**, **`docs/api/contract-fragmentation.md`**, **`docs/api/openapi-workflow.md`**, **`docs/api/regenerating.md`**, **`docs/reference/contracts.md`**, **`docs/reference/data.md`**, **`docs/reference/root.md`**, **`docs/tools/contract-testing.md`**, **`docs/tools/demo-profile.md`**, and **`docs/tools/mutation-testing.md`**, establishing the file-level → workflow/tooling documentation hierarchy.
- The naming convention (`check-`, `build-`, `generate-`, `run-`, `report-`, `export-`, `sync-`) is shared with the paired frontend and `boilerplate-php-laravel-backend` Artisan commands, making this page the backend authority for the cross-repo verb vocabulary.

## Notes

- **Naming is load-bearing.** A file's verb prefix tells you whether it writes, verifies, or merely reports. `report-*` files never fail; `build-*` produce committed artifacts; `generate-*` produce gitignored ones. Files with no verb prefix are import-only libraries.
- **Abbreviations are a lint error** (`unicorn/prevent-abbreviations` applies to filenames). Use full words: `directory`, not `dir`.
- **`check-spec-identity.ts` degrades to a warning** when the sibling frontend is absent locally, so a half-cloned pair can still commit. In CI the sibling is checked out first, so the check is strict.
- **The two eslint rules were originally tests.** They were promoted to lint rules so the constraint is enforced at the keystroke rather than after the fact.
- **`generate-asyncapi-types.ts` output is byte-identical** to the frontend's copy — the pairing check depends on this.
