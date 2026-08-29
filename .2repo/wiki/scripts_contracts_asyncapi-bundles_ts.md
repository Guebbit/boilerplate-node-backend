# scripts/contracts/asyncapi-bundles.ts

## Purpose

Builds the two committed AsyncAPI bundle files (`asyncapi.yaml` and `asyncapi.public.yaml`) by merging per-section YAML documents into a single root document. The merge copies only the four structural maps (servers, channels, components.messages, components.schemas) and refuses key collisions, deliberately avoiding `asyncapi bundle`'s full `$ref` dereferencing so that `scripts/generate-asyncapi-types.ts` can still walk the remaining refs. The public bundle exposes only `shared`-scoped sections to API clients; the full bundle includes all sections.

## Key elements

- **`ASYNC_SECTION_ORDER`** — Ordered list of mergeable sections: `['observability', 'workers']`. Determines output key order.
- **`SHARED_SECTIONS`** — ReadonlySet of sections an API client can reach (currently only `observability`). Everything else is `backend`-only.
- **`asyncapiBundle`** (`ContractBundle`) — The full contract. Scope `backend`, output `asyncapi.yaml`, includes all sections. Read by the linter and `gen:asyncapi`.
- **`asyncapiPublicBundle`** (`ContractBundle`) — The shared half. Scope `shared`, output `asyncapi.public.yaml`, includes only shared sections. Committed so the paired frontend can hash-compare it via `check:spec-identity`.
- **`compile(scope)`** — Internal merge logic. Reads the root document, strips its leading comment, then merges each section's four maps in order. Caches results per scope.
- **`mergeInto(target, keyPath, section, source)`** — Merges one section's map into the target at a given path. Throws a descriptive error if a key already exists (prevents silent channel/schema loss).
- **`asyncSectionDocument(section)`** — Resolves the source file: `src/modules/<section>/asyncapi.yaml` for module-owned sections, `shared/contracts/asyncapi.workers.yaml` for the workers queue.
- **`ASYNC_ROOT_DOCUMENT`** — Path to `shared/contracts/asyncapi.root.yaml`; holds version, id, info, content-type, and tags. No channels or servers.

## Relationships

- **`scripts/contracts/bundle-kinds.ts`** — Provides the `ContractBundle` type and `REPO_ROOT` constant imported at the top of this file.
- **`scripts/build-contract-bundles.ts`** — Consumes the exported bundle objects (`asyncapiBundle`, `asyncapiPublicBundle`) to invoke their `content()` functions and write the `output` paths.
- **`scripts/contracts/bundle-registry.ts`** — Registers the two bundles so the build pipeline and staleness checks can discover them by name.
- **`scripts/generate-asyncapi-types.ts`** — Downstream consumer. This file intentionally preserves `$ref` nodes (no dereferencing) so that script can walk them to name its generated models.
- **`docs/theory/modules.md`** / **`docs/theory/module-lifecycle.md`** — Document the module layout (`src/modules/<section>/`) that determines where per-section AsyncAPI files live, which `asyncSectionDocument` encodes.
- **`tests/contract/request-sources.test.ts`** — Exercises contract source resolution; relevant because this file defines which files count as sources for each bundle via the `sources()` methods.

## Notes

- The merge is a **node-copy**, not a document merge. File-level comments in section documents are lost (only the four map values are copied), but comments *within* a map node survive.
- The root document's leading comment block is explicitly cleared (attached to the first key's `commentBefore`, not `doc.commentBefore`) to avoid leaking editing guidance into the generated file.
- Serialization uses `lineWidth: 0` to prevent line-wrapping that would cause spurious diffs and false staleness reports from `check:contracts-bundles`.
- Both bundles are marked `compiled: true`, indicating they are generated artefacts that must be checked in (the public one in particular, for cross-repo hash comparison).
