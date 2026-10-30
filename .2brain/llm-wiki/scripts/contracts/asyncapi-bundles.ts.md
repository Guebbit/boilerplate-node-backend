---
source: scripts/contracts/asyncapi-bundles.ts
sha256: 143e559da06ad34268faad8765d158da7603bed0a1ba390e4a62f0ca455f789b
generated_at: 2026-10-29T01:29:22.145388+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/asyncapi-bundles.ts

## Purpose

Builds two AsyncAPI bundle files — the full backend contract (`asyncapi.yaml`) and the public/shared contract (`asyncapi.public.yaml`) — by shallow-merging section-level AsyncAPI documents into a single output. It deliberately avoids the `asyncapi bundle` CLI (which dereferences every `$ref`, tripling the document and breaking the type generator that walks those refs) and instead copies five known maps, throwing on any key collision so no channel or schema can be silently dropped.

## Key elements

- **`AsyncScope`** — `'shared' | 'backend'`; determines which sections a bundle includes.
- **`ASYNC_SECTION_ORDER`** — the definitive merge order: module sections with a top-level `asyncapi.yaml` (in `MODULE_ASYNC_ORDER` preference), then `-internal` queue sections, then `'workers'`.
- **`SHARED_SECTIONS`** — the set of sections visible to an API client; derived from which modules own a public `asyncapi.yaml`.
- **`sectionsInScope(scope)`** — filters `ASYNC_SECTION_ORDER` to only shared sections when scope is `'shared'`.
- **`asyncSectionDocument(section)`** — resolves the on-disk YAML path for a section (module `asyncapi.yaml`, module `asyncapi.internal.yaml`, or `shared/contracts/asyncapi.workers.yaml`).
- **`MERGED_PATHS`** — the five key-paths copied per section: `servers`, `channels`, `operations`, `components.messages`, `components.schemas`.
- **`mergeInto(target, keyPath, section, source)`** — appends a section's map entries into the target; throws with both owners named if a key already exists.
- **`mergeDocument(target, section, source)`** — iterates `MERGED_PATHS` and calls `mergeInto` for each.
- **`compile(scope)`** — reads the root document, strips its header comment, merges every in-scope section (wrapping `webhooks` with `withWebhookEvents`), and returns the final YAML text. Cached in `compiled`.
- **`asyncapiBundle: ContractBundle`** — exported backend bundle descriptor (output path, source list, `compiled: true`).
- **Public bundle export** (truncated in source) — the shared half, committed as the frontend's `asyncapi.yaml`.
- **`marker(sections)`** — generates the `DO NOT EDIT` header listing every source file.

## Relationships

- **`scripts/contracts/section-order.ts`** — provides `orderSections`, which orders module sections by preference before falling back to alphabetical.
- **`scripts/modules-on-disk.ts`** — provides `REPO_ROOT`, `MODULES_ROOT`, and `modulesWith`, used to discover which modules own `asyncapi.yaml` or `asyncapi.internal.yaml` without hard-coding names.
- **`scripts/contracts/asyncapi-webhook-events.ts`** — provides `webhookEventFragments` (list of fragment files) and `withWebhookEvents` (wraps the `webhooks` section read to inject per-module event fragments before merging).
- **`scripts/contracts/bundle-kinds.ts`** — defines the `ContractBundle` interface that `asyncapiBundle` satisfies.
- **`scripts/contracts/bundle-registry.ts`** — consumes the exported bundle descriptors to register them in the contract pipeline.
- **`src/modules/webhooks/asyncapi.yaml`** and **`src/modules/webhooks/asyncapi.internal.yaml`** — concrete source documents merged into the respective bundles (public channels vs. backend-only queues).
- **`tests/contract/request-sources.test.ts`** — validates that the `sources()` array on each bundle correctly lists every input file.
- **`tests/cross-cutting/side-effects-have-one-layer.test.ts`** — asserts the bundle script is the sole writer of its output files.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — ensures this script runs in the correct CI wave relative to other contract generators.

## Notes

- **Collision guard is the core safety mechanism.** Two sections claiming the same channel, server, message, or schema key will throw rather than silently overwrite. The error names both the key and the offending section.
- **YAML AST merge preserves authored style.** The merge operates on `yaml` `Document` nodes (not parsed-then-serialized objects), so quoting, scalar tags, and comments inside copied nodes survive.
- **Root header comment stripping is non-obvious.** `yaml` attaches a leading comment block to the first key node, not to `doc.commentBefore`. The code explicitly clears `firstKey.commentBefore`; setting `document_.commentBefore` would be a silent no-op.
- **`lineWidth: 0`** is intentional — prevents line-wrapping in the output from creating spurious diffs on unrelated edits, which the contract-staleness check in `npm run check` would flag.
- **`compiled` cache** means calling `content()` twice in one process (e.g., for both a write and a checksum) only parses the source tree once.
- **Section membership is discovered, not listed.** Adding or removing a module that owns an `asyncapi.yaml` or `asyncapi.internal.yaml` requires no edit to this file; `modulesWith` picks it up from disk.
