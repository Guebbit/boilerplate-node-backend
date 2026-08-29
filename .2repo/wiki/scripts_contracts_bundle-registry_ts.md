# scripts/contracts/bundle-registry.ts

## Purpose

Central registry that enumerates every contract document this repo produces. It is the single list the CLI (`build-contract-bundles.ts`), the staleness check, and the cross-cutting test iterate over, so adding or removing a bundle is a one-line change here plus its spec file.

## Key elements

- **`CONTRACT_BUNDLES`** (`readonly ContractBundle[]`): The complete list of eight bundles — `openapiBundle`, `asyncapiBundle`, `asyncapiPublicBundle`, `analyticsEventsBundle`, and the four client-collection bundles (`bruno`, `insomnia`, `mockoon`, `postman`). Declared `as const`.
- **`findBundle(name)`**: Looks up a single bundle by its CLI handle (the `name` field). Returns `ContractBundle | undefined`.
- **`export * from './bundle-kinds'`**: Re-exports the `ContractBundle` type and any other kinds so downstream consumers can import from this one path.

## Relationships

- **`scripts/contracts/bundle-kinds.ts`** — provides the `ContractBundle` type used by the array declaration; re-exported here.
- **`scripts/contracts/openapi-bundle.ts`**, **`scripts/contracts/asyncapi-bundles.ts`**, **`scripts/contracts/analytics-events-bundle.ts`**, **`scripts/contracts/client-collections-bundle.ts`** — each supplies one or more bundle objects that are collected into `CONTRACT_BUNDLES`.
- **`scripts/build-contract-bundles.ts`** — the CLI entry point that reads `CONTRACT_BUNDLES` to decide which documents to build and which to validate for staleness.
- **`tests/cross-cutting/contract-bundles.test.ts`** — iterates `CONTRACT_BUNDLES` to assert invariants across every registered bundle.

## Notes

- Two bundles publish a *subset* of their source for opposite reasons: `asyncapiPublicBundle` ships the public half of `asyncapi.yaml` to the frontend (the full file is the source of this repo's own types), while `analyticsEventsBundle` publishes only client-facing event names because the backend names are ordinary TS imports.
- The four client-collection bundles are **GENERATED** (`.gitignore`d); they exist in the list only so the CLI can locate them by name. An uncommitted file cannot be stale, so they skip the staleness guard.
- The paired frontend repo holds byte-identical copies of the **AUTHORED** bundles and never edits them.
- Adding a new bundle requires exactly one new entry in `CONTRACT_BUNDLES` plus its spec file; the CLI, staleness check, and cross-cutting test pick it up automatically.
