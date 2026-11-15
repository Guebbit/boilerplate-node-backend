---
source: scripts/contracts/asyncapi-bundles.ts
sha256: 50a8c1b6b616e2c794c2ef249ecb03c66ab640dda888810013253461ca444f8b
generated_at: 2026-11-14T17:22:36.589497+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/asyncapi-bundles.ts

## Purpose

Merges per-section AsyncAPI documents into two committed bundles — `asyncapi.yaml` (every channel the service exposes) and a public bundle (only the channels an API client can reach). The split is driven by a `scope` field per section, so both bundles derive from the same sources and can never disagree. Deliberately avoids the `asyncapi bundle` CLI (which dereferences `$ref`s) and instead copies five top-level maps via the YAML AST, throwing on any key collision to prevent silent channel loss.

## Key elements

- **`AsyncScope`** — `'shared' | 'backend'`; determines which sections appear in a bundle.
- **`MODULE_ASYNC_ORDER`** — preferred narrative order for modules that own a public `asyncapi.yaml`.
- **`resolveModuleAsyncSections()`** — discovers (from disk) which modules have a top-level `asyncapi.yaml`.
- **`internalSections()`** — discovers modules with an `asyncapi.internal.yaml`, appending `-internal` to the section name.
- **`ASYNC_SECTION_ORDER`** — final merge order: public module sections, internal sections, then `workers`.
- **`SHARED_SECTIONS`** — `ReadonlySet` of section names that go into the public bundle; everything else is backend-only.
- **`sectionsInScope(scope)`** — filters `ASYNC_SECTION_ORDER` to the sections for a given scope.
- **`asyncSectionDocument(section)`** — resolves the on-disk YAML path for a section (module file, internal file, or the shared `workers` file).
- **`ASYNC_ROOT_DOCUMENT`** — path to `shared/contracts/asyncapi.root.yaml` (version, id, info, tags — no channels/servers).
- **`MERGED_PATHS`** — the five key-paths copied from each section: `servers`, `channels`, `operations`, `components.messages`, `components.schemas`.
- **`fragmentsFor(sections)`** / **`withSectionFragments`** — pulls in cross-module fragment files (e.g. webhook event payloads) attached to a section.
- **`marker(sections)`** — generates the `DO NOT EDIT` header listing every source file.
- **`read(file)`** — parses a YAML file into a `yaml` `Document` with `keepSourceTokens` so comments survive.
- **`mergeInto(target, keyPath, section, source)`** — merges one map into the target; **throws** if a key already exists (collision guard).
- **`mergeDocument(target, section, source)`** — calls `mergeInto` for every entry in `MERGED_PATHS`.
- **`compile(scope)`** — assembles the full bundle text (root + all in-scope sections + fragments), caches in `compiled` map. Clears the root document's leading comment block off the first key node. Serialises with `indent: 4, lineWidth: 0, singleQuote: true`.
- **`asyncapiBundle`** (exported `ContractBundle`) — the full backend bundle written to `asyncapi.yaml`.
- A second exported `ContractBundle` for the public/shared scope (its identifier is in the truncated tail of the file).

## Relationships

| Neighbor | Interaction |
|---|---|
| `scripts/contracts/bundle-kinds.ts` | Provides the `ContractBundle` type that both exports conform to. |
| `scripts/contracts/section-order.ts` | `orderSections` is used to sort `resolveModuleAsyncSections` against `MODULE_ASYNC_ORDER`. |
| `scripts/contracts/asyncapi-section-fragments.ts` | `sectionFragments` and `withSectionFragments` supply cross-module YAML fragments merged into each section. |
| `scripts/modules-on-disk.ts` | `REPO_ROOT`, `MODULES_ROOT`, and `modulesWith` drive all disk discovery of section files. |
| `src/modules/webhooks/asyncapi.yaml` | A section source document consumed by `asyncSectionDocument('webhooks')`. |
| `src/modules/webhooks/asyncapi.internal.yaml` | An internal section source consumed as `webhooks-internal`. |
| `tests/contract/request-sources.test.ts` | Validates the public bundle's request-source declarations. |
| `tests/unit/scripts/mutation/ci/waves.test.ts` | Exercises the bundle in a CI wave (mutation/staleness check context). |

## Notes

- **Collision is fatal, not last-wins.** `mergeInto` throws with both the key path and the offending section name. This is the primary safety net against two modules declaring the same channel, server, or schema.
- **`lineWidth: 0`** in the serialiser prevents Prettier re-flowing long prose lines, which would otherwise cause spurious staleness diffs in `npm run check`.
- **`singleQuote: true`** matters for schemas copied from the REST contract via `asyncapi-section-fragments.ts`; without it those schemas emit double-quoted and the committed bundle fails Prettier.
- **Root comment clearing** targets `contents.items[0].key.commentBefore`, not `doc.commentBefore` — the `yaml` package attaches a leading block comment to the first content node, so clearing the document-level field silently does nothing.
- **`servers` is merged per section**, not kept in the root document, because a server travels with the section that binds to it.
- The file does **not** use `asyncapi bundle` (the CLI tool); the naming similarity is coincidental and the approach is intentionally a shallow four-map copy.
