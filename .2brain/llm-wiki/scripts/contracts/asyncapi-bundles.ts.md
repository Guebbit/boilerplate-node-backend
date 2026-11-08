---
source: scripts/contracts/asyncapi-bundles.ts
sha256: 8efbe1fc63d36c737acdefb7d383023838f8086d3befcfcb24533c2560b23d2b
generated_at: 2026-11-08T02:38:37.088462+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/asyncapi-bundles.ts

## Purpose

Builds the two committed AsyncAPI bundles — `asyncapi.yaml` (every channel the service owns) and the public-facing subset — by merging per-section YAML documents into a single root document via the `yaml` AST. It deliberately does **not** use `asyncapi bundle` (which dereferences every `$ref`), instead copying five top-level maps and throwing on any key collision so no channel or schema is silently dropped.

## Key elements

- **`asyncapiBundle`** (exported, `ContractBundle`) — the full/backend bundle; `content()` returns the compiled YAML text, `output` points to repo-root `asyncapi.yaml`.
- **`compile(scope)`** — assembles one bundle: reads the root document, strips its header comment, iterates sections in scope, merges each via `withSectionFragments` + `mergeDocument`, then serialises with `indent: 4, lineWidth: 0, singleQuote: true`. Caches result in a module-level `Map`.
- **`mergeInto(target, keyPath, section, source)`** — copies one map from a section into the target, **throwing** if a key already exists. This is the primary collision guard.
- **`MERGED_PATHS`** — the five key paths merged per section, in output order: `servers`, `channels`, `operations`, `components.messages`, `components.schemas`.
- **`ASYNC_SECTION_ORDER`** — final merge order: public module sections (from `MODULE_ASYNC_ORDER` + disk discovery), internal-queue sections (`<module>-internal`), then `workers`.
- **`SHARED_SECTIONS`** — set of section names visible to an API client; derived from which modules have a top-level `asyncapi.yaml` (as opposed to `asyncapi.internal.yaml`).
- **`asyncSectionDocument(section)`** — resolves a section name to its source YAML path (module dir, `shared/contracts`, or the workers file).
- **`marker(sections)`** — generates the `# Code generated … DO NOT EDIT` header listing every source file.
- **`read(file)`** — wraps `parseDocument(readFileSync(…))` with `keepSourceTokens: true` so comments survive re-serialisation.

## Relationships

- **`./bundle-kinds.ts`** — provides the `ContractBundle` type that `asyncapiBundle` satisfies.
- **`./section-order.ts`** — `orderSections()` orders the discovered module sections against `MODULE_ASYNC_ORDER`.
- **`./asyncapi-section-fragments.ts`** — `sectionFragments()` lists per-module fragment files for a section; `withSectionFragments()` merges those fragments into a section's document before the main merge.
- **`../modules-on-disk.ts`** — `modulesWith()` discovers which module folders contain a given filename; `REPO_ROOT` / `MODULES_ROOT` supply base paths.
- **`bundle-registry.ts`** (sibling) — registers `asyncapiBundle` (and the public variant) so `npm run contracts:bundle` can write them.
- **`src/modules/webhooks/asyncapi.yaml`** and **`src/modules/webhooks/asyncapi.internal.yaml`** — concrete source documents consumed by the merge (webhooks is a module with both a public catalogue and an internal queue).
- **`tests/contract/request-sources.test.ts`**, **`tests/cross-cutting/side-effects-have-one-layer.test.ts`**, **`tests/unit/scripts/mutation/ci/waves.test.ts`** — exercise the bundle output or the script's contract as part of CI.

## Notes

- **No `$ref` dereferencing.** The merge copies map nodes verbatim. `scripts/contracts/generate-asyncapi-types.ts` relies on those refs still being present in the committed bundle to walk them for model naming.
- **Collision is fatal, not last-wins.** If two sections declare the same channel, server, message, or schema key, `mergeInto` throws with both owners named. There is no override or priority.
- **Comment handling is position-sensitive.** The root document's leading comment is stripped by clearing `commentBefore` on the *first key node*, not via `doc.commentBefore` (which is unset when the document has content). Section documents lose file-level comments automatically because only their merged-map nodes are copied.
- **`lineWidth: 0`** in serialisation prevents Prettier from re-flowing long schema descriptions on unrelated edits, which would trip the staleness check in `npm run check`.
- **Discovery over registration.** New modules that add an `asyncapi.yaml` or `asyncapi.internal.yaml` are picked up automatically via `modulesWith`; no list in this file needs updating.
- **`workers`** is a fixed, domainless section pointing at `shared/contracts/asyncapi.workers.yaml` — not a module on disk.
