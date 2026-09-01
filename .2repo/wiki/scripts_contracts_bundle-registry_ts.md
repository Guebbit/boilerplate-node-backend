# scripts/contracts/bundle-registry.ts

## Purpose

Central registry that enumerates every contract bundle this repo produces. All consumers (the CLI build, the staleness check, and cross-cutting tests) iterate this single list rather than hard-coding bundle names, so adding a new bundle requires one entry here plus its spec file.

## Key elements

- **`CONTRACT_BUNDLES`** — `readonly ContractBundle[]` containing the seven bundles: `openapiBundle`, `asyncapiBundle`, `asyncapiPublicBundle`, `brunoBundle`, `insomniaBundle`, `mockoonBundle`, `postmanBundle`.
- **`findBundle(name)`** — lookup helper that returns a bundle by its CLI handle string, or `undefined` if not found.
- **`export * from './bundle-kinds'`** — re-exports the `ContractBundle` type (and any other kinds) so downstream importers can pull everything from this one module.

## Relationships

- **`bundle-kinds.ts`** — supplies the `ContractBundle` type used to type the array; this file re-exports its public surface.
- **`openapi-bundle.ts`** — source of `openapiBundle`.
- **`asyncapi-bundles.ts`** — source of `asyncapiBundle` and `asyncapiPublicBundle`.
- **`client-collections-bundle.ts`** — source of the four client-collection bundles (bruno, insomnia, mockoon, postman).
- **`build-contract-bundles.ts`** — the CLI entry point that iterates `CONTRACT_BUNDLES` to perform the actual build.
- **`tests/cross-cutting/contract-bundles.test.ts`** — iterates `CONTRACT_BUNDLES` to assert invariants across every bundle uniformly.

## Notes

- The doc comment distinguishes **AUTHORED** bundles (committed, duplicated byte-identically in the paired frontend, never edited there) from **GENERATED** bundles (the four client collections, which are `.gitignore`d). Only the generated ones can go stale in a git sense; the authored ones are guarded by the shared `scripts/spec-identity.ts` file.
- `asyncapiBundle` publishes the full channel set (this repo's own types derive from it), while `asyncapiPublicBundle` is the subset the frontend receives.
- The `as const` assertion on the array literal is paired with the `readonly` type, giving callers a narrowed tuple shape when they need one.
