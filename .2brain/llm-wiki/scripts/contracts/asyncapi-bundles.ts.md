---
source: scripts/contracts/asyncapi-bundles.ts
sha256: c9846c18af3dec0ca47ad9c0ffee796e4f4ed16a4bb306cb7086e7013ab69f8c
generated_at: 2026-09-23T17:21:29.731610+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/asyncapi-bundles.ts

## Purpose

Merges per-section AsyncAPI YAML documents into two complete bundles: a full backend contract (every channel the service has) and a shared/public contract (only channels an API client can reach). The split is determined by a `SHARED_SECTIONS` allowlist. Deliberately avoids `asyncapi bundle` (which dereferences `$ref`s and would strip the refs that type generation walks), instead performing a shallow, collision-refusing merge of five top-level maps through the YAML AST to preserve authored quoting and scalar style.

## Key elements

- **`ASYNC_SECTION_ORDER`** (export) — Ordered list of all section names: fixed sections (`observability`, `webhooks`, `workers`) plus dynamically discovered `<module>-internal` sections.
- **`internalSections()`** — Scans `src/modules/` for directories containing `asyncapi.internal.yaml` and returns sorted `<name>-internal` identifiers. Deleting or adding a module's internal queue requires no change here.
- **`SHARED_SECTIONS`** — Set of section names visible to API clients (`observability`, `webhooks`). Everything absent is backend-only.
- **`sectionsInScope(scope)`** — Filters `ASYNC_SECTION_ORDER` to the subset for a given `AsyncScope` (`'shared'` or `'backend'`).
- **`asyncSectionDocument(section)`** — Resolves the file path for a section: `shared/contracts/asyncapi.workers.yaml` for workers, `<module>/asyncapi.internal.yaml` for internal sections, `<module>/asyncapi.yaml` otherwise.
- **`mergeInto(target, keyPath, section, source)`** — Copies a section's map into the target document at the given key path. Throws with a named-collision error if a key already exists (prevents silent channel/schema loss).
- **`compile(scope)`** — Reads the root document, clears its leading comment, merges each in-scope section's five maps (`servers`, `channels`, `operations`, `components.messages`, `components.schemas`) in order, serialises with `indent: 4, lineWidth: 0`, prepends a source-marker header, and caches the result.
- **`asyncapiBundle`** (export, `ContractBundle`) — The full backend bundle. Output: `asyncapi.yaml`. `compiled: true`.
- **`asyncapiPublicBundle`** (export, `ContractBundle`) — The shared/public bundle. Output: `asyncapi.public.yaml`. `compiled: true`.
- **`AsyncScope`** (type) — `'shared' | 'backend'`.
- **`AsyncSectionName`** (type) — `FixedSection | \`${string}-internal\``.

## Relationships

- **`scripts/contracts/bundle-kinds.ts`** — Source of the `ContractBundle` type and `REPO_ROOT` constant used throughout this file.
- **`scripts/contracts/bundle-registry.ts`** — Consumes the two `ContractBundle` exports (`asyncapiBundle`, `asyncapiPublicBundle`) to register them in the build/check pipeline.
- **`scripts/contracts/generate-asyncapi-types.ts`** — Walks the `$ref`s that this merge deliberately preserves (rather than dereferencing) to derive TypeScript model names. Using `asyncapi bundle` here would leave that script with nothing to follow.
- **`src/modules/webhooks/asyncapi.yaml`** — Read as the `webhooks` section; present in both the backend and shared bundles.
- **`src/modules/webhooks/asyncapi.internal.yaml`** — Discovered by `internalSections()` and merged as `webhooks-internal`; present only in the backend bundle.
- **`tests/contract/request-sources.test.ts`** — Exercises the `sources()` methods on both bundle exports to verify the declared input files.
- **`tests/cross-cutting/side-effects-have-one-layer.test.ts`** — Enforces that this module only reads files and returns strings (no `writeFileSync`, no side effects beyond the `compiled` cache), keeping the I/O boundary in the registry layer.

## Notes

- The merge is a **shallow copy of five maps**, not a deep merge. A collision (e.g. two sections declaring the same channel name) throws immediately rather than last-write-wins, because the loser would silently vanish from the frontend-generated client.
- The root document's leading comment is cleared off the **first key node**, not off the document itself. The `yaml` library attaches a leading comment block to whatever node follows it; `doc.commentBefore` is only set when the document has no content. Setting the latter silently does nothing.
- `lineWidth: 0` prevents the YAML serializer from re-flowing long lines, which would produce spurious diff noise on unrelated edits and trip the `check:contracts-bundle` staleness check.
- The `compiled` map caches one result per scope, so a build that emits both bundles merges the shared sections only once.
- `asyncapiPublicBundle` has no `shared` property set to `false` (unlike `asyncapiBundle`), signalling to the registry that it is the cross-repo hash-compared artefact that must be committed rather than generated on demand.
