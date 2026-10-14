---
source: scripts/contracts/asyncapi-bundles.ts
sha256: dc860e88da5e370b73fd3b248b8ba66c2c5b77a559735db32d8e9a378187030f
generated_at: 2026-10-14T07:08:53.623642+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/asyncapi-bundles.ts

## Purpose

Builds the two AsyncAPI contract bundles (`asyncapi` / full and `asyncapi.public`) by merging section-level YAML documents into a single AST, without dereferencing `$ref`s. The merge is a shallow copy of five known maps (`servers`, `channels`, `operations`, `components.messages`, `components.schemas`) that refuses on collision, so each source file's refs and scalar style survive intact for downstream type-generation scripts.

## Key elements

- **`ASYNC_SECTION_ORDER`** (exported) — the definitive list of section names in merge order: public module sections (ordered by `MODULE_ASYNC_ORDER`), `-internal` queue sections, then `workers`.
- **`asyncapiBundle`** (exported, `ContractBundle`) — the full-scope bundle descriptor consumed by the bundle registry; its `build()` calls `compile('backend')`.
- **`compile(scope)`** — assembles one bundle: reads `shared/contracts/asyncapi.root.yaml` as the base, merges every in-scope section document via the AST, strips the root file's leading comment, prepends a `DO NOT EDIT` marker listing all sources, and serialises with `indent: 4, lineWidth: 0`. Results are cached per scope.
- **`mergeInto` / `mergeDocument`** — the collision-guarding merge. If two sections declare the same key under any of the five merged paths, it throws naming both owners rather than silently overwriting.
- **`modulesWithAsyncapi` / `internalSections`** — discover sections from `src/modules/*` on disk (presence of `asyncapi.yaml` or `asyncapi.internal.yaml`), so adding/removing a module requires no edit here.
- **`asyncSectionDocument`** — resolves a section name to its file path (`shared/contracts/asyncapi.workers.yaml`, a module's `asyncapi.yaml`, or `asyncapi.internal.yaml`).
- **`SHARED_SECTIONS`** — a `Set` of public section names; `sectionsInScope` filters `ASYNC_SECTION_ORDER` through it for the `public` scope.
- **`MODULE_ASYNC_ORDER`** — `['observability', 'webhooks']`, the narrative preference for public sections (membership is still disk-discovered).

## Relationships

- **`scripts/contracts/bundle-kinds.ts`** — provides `REPO_ROOT` and the `ContractBundle` interface that the exported `asyncapiBundle` implements.
- **`scripts/contracts/section-order.ts`** — provides `orderSections`, which reconciles `MODULE_ASYNC_ORDER` against the disk-discovered list to produce the final public-section order.
- **`scripts/contracts/asyncapi-webhook-events.ts`** — provides `withWebhookEvents` (injected into `mergeDocument` for the `webhooks` section to splice in per-module event fragments) and `webhookEventFragments` (used to list those fragment files in the generated marker header).
- **`scripts/contracts/bundle-registry.ts`** — consumes the `asyncapiBundle` export to register it in the contract-bundle catalogue.
- **`src/modules/webhooks/asyncapi.yaml`** — the public webhook event catalogue; merged as the `webhooks` section when scope includes shared sections.
- **`src/modules/webhooks/asyncapi.internal.yaml`** — the webhooks backend queue; merged as the `webhooks-internal` section (full scope only).
- **`tests/contract/request-sources.test.ts`** — asserts the marker header lists every source file actually read.
- **`tests/cross-cutting/side-effects-have-one-layer.test.ts`** — enforces that file I/O (reads/writes) happens only in this layer of the contract pipeline.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — verifies the bundle script participates in the correct CI wave ordering.

## Notes

- **Not `asyncapi bundle`.** The merge deliberately copies map *nodes* rather than dereferencing `$ref`s. This keeps refs intact so `generate-asyncapi-types.ts` can still walk them to name its generated models. If you see a "two sections declare …" error, the fix is to move the offending key into one owner, not to relax the guard.
- **Comment-stripping quirk.** The root file's leading comment is cleared off the first *key* node (`contents.items[0].key.commentBefore`), not off the document. `yaml` attaches a leading comment block to the next node, so `doc.commentBefore` would be `undefined` on a non-empty document and the clear would be a no-op.
- **`lineWidth: 0`.** Prevents the `yaml` library from re-flowing long lines on output, which would produce spurious diffs on unrelated edits and trip the `check:contracts-bundle` staleness check.
- **Discovery over registration.** Sections are found by scanning `src/modules/` for the presence of `asyncapi.yaml` or `asyncapi.internal.yaml`. A new module with a queue file is picked up automatically; there is no manual registry to update here.
- **`workers` is a fixed section** (not a module), always last, and always backend-only. Its document lives at `shared/contracts/asyncapi.workers.yaml`.
