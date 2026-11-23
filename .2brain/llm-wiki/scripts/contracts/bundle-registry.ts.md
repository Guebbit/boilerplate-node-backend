---
source: scripts/contracts/bundle-registry.ts
source_sha256: cd19c402e4c02f9d9973b7874bb2048e9dd8fe2437734f7471d53ca812603049
context_sha256: de1f2ffc3ed5edadab070e684b76e6ad25a79c5f9bd78c220c2df360e0577a97
generated_at: 2026-11-22T01:54:28.930162+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/bundle-registry.ts

## Purpose
Single registry of every contract document this repo produces from sources it owns. The CLI, the staleness check and the cross-cutting test all iterate this list, so adding a bundle means one entry here plus its spec file.

Two kinds of bundle are listed:
- **Authored**: the shared files from `scripts/pairing/spec-identity.ts`, which exist both here and as byte-identical copies in the paired frontend. `asyncapi.yaml` and the public AsyncAPI document are `.gitignore`d like `openapi.yaml` and rebuilt on every install.
- **Generated**: the client collections. They are listed only so the CLI can find them by name. An uncommitted file cannot be stale, so they are not guarded.

## Key elements
- `CONTRACT_BUNDLES`: readonly list of all bundles, in this order: `openapiBundle`, `asyncapiBundle`, `asyncapiPublicBundle`, `brunoBundle`.
- `findBundle(name)`: returns the bundle whose `name` matches its CLI handle, or `undefined`.
- `collectionBundle(tool, file)`: private factory for a generated entry.
  - It sets `name` to the tool, `generated: true`, `label` to the file name, and `output` to `REPO_ROOT/<file>`.
  - Its `content` is a lazy `import('./client-collections-bundle')` that calls `collectionContent(tool)`.
- `brunoBundle`: the Bruno collection bundle, built with the `'bruno'` tool and a Bruno-specific file name at the repo root.
- `export * from './bundle-kinds'`: re-exports the bundle types, so consumers can import them from here.

## Relationships
- `bundle-kinds.ts`: provides the `ContractBundle` type and is re-exported wholesale.
- `openapi-bundle.ts`: supplies `openapiBundle`.
- `asyncapi-bundles.ts`: supplies `asyncapiBundle` and `asyncapiPublicBundle`.
- `client-collections-bundle.ts`: loaded dynamically, and only when a collection bundle is built. It exports `collectionContent`.
- `modules-on-disk.ts`: supplies `REPO_ROOT` for the generated output paths.
- `build-bundles.ts` and `tests/cross-cutting/contract-bundles.test.ts`: consume the registry. The header says the CLI, staleness check and cross-cutting test iterate this list.

## Notes
- The collection import must stay dynamic. Collections load app code (the seed values), and `api.generated/` does not exist yet while `postinstall` bundles. The dependency-cruiser rule `contracts-bundler-loads-no-generated-code` enforces this.
- Generated collections are written to the repo root as `contract.<tool>.<ext>`, next to `openapi.yaml`, and are kept out of the repo by `.gitignore`.
- `asyncapi.yaml` keeps every channel, because this repo's own types come from it. The frontend receives only the public subset.
