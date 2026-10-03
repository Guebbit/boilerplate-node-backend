---
source: scripts/contracts/asyncapi-bundles.ts
sha256: 81dd2f0bbf367c97d486c983f0e54543b4f707c3a2d4d264a60e938e91d65aa9
generated_at: 2026-10-01T12:25:05.364642+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/asyncapi-bundles.ts

## Purpose

Merges one AsyncAPI document per section into two committed bundles: `asyncapi.yaml` (every channel the service has) and `asyncapi.public.yaml` (only channels an API client can reach). The split is driven by a per-section `scope` convention (top-level `asyncapi.yaml` = public, `asyncapi.internal.yaml` = backend-only), so both bundles come from the same source documents and can never disagree. This file performs a shallow copy of five known maps into a root skeleton document, deliberately avoiding `asyncapi bundle`'s `$ref` dereferencing to keep refs intact for the downstream type generator.

## Key elements

- **`ASYNC_SECTION_ORDER`** (exported) — readonly array of section names in merge/output order: public module sections (in `MODULE_ASYNC_ORDER` preference), then `-internal` queue sections (sorted), then `workers`.
- **`asyncapiBundle`** (exported, `ContractBundle`) — the full backend bundle; `content()` compiles all sections, `sources()` lists the root + every section file.
- **`asyncapiPublicBundle`** (exported, `ContractBundle`) — the shared/public bundle; same shape but `content()` compiles only sections in `SHARED_SECTIONS`.
- **`compile(scope)`** (internal) — reads the root document, strips its leading comment, iterates `sectionsInScope(scope)`, calls `mergeInto` for each of the five `MERGED_PATHS`, then serialises with `indent: 4, lineWidth: 0`. Caches result per scope in a module-level `Map`.
- **`mergeInto(target, keyPath, section, source)`** (internal) — copies items from a section's map into the target at `keyPath`; **throws** on any key collision with both section names in the message.
- **`modulesWithAsyncapi()`** / **`internalSections()`** — discover module directories from disk that contain `asyncapi.yaml` or `asyncapi.internal.yaml` respectively.
- **`resolveModuleAsyncSections()`** — applies `MODULE_ASYNC_ORDER` preference over discovered modules via `orderSections`.
- **`SHARED_SECTIONS`** — a `Set` of public section names; everything else is backend-only.
- **`asyncSectionDocument(section)`** — resolves the file path for a section (workers → shared, `-internal` suffix → module internal file, otherwise → module public file).
- **`MERGED_PATHS`** — the five key paths copied per section: `servers`, `channels`, `operations`, `components.messages`, `components.schemas`.
- **`marker(sections)`** — generates the `# Code generated … DO NOT EDIT` header listing every source file.

## Relationships

- **`scripts/contracts/bundle-kinds.ts`** — provides the `REPO_ROOT` constant and the `ContractBundle` interface that both exported bundles implement.
- **`scripts/contracts/section-order.ts`** — provides `orderSections`, used to reconcile `MODULE_ASYNC_ORDER` against the modules actually present on disk.
- **`scripts/contracts/bundle-registry.ts`** — consumes the two exported bundles (registers them for build/check scripts); this file is the sole producer of the AsyncAPI bundle definitions.
- **`src/modules/webhooks/asyncapi.yaml`** — discovered by `modulesWithAsyncapi()`; contributes a public section.
- **`src/modules/webhooks/asyncapi.internal.yaml`** — discovered by `internalSections()`; contributes a `webhooks-internal` backend section.
- **`tests/contract/request-sources.test.ts`** — exercises the `sources()` methods of both bundles to verify the declared dependency list.
- **`tests/cross-cutting/side-effects-have-one-layer.test.ts`** — asserts that compiled-contract output is produced by exactly one layer (this file), not scattered across modules.

## Notes

- **No `$ref` dereferencing.** The merge copies map nodes verbatim via the YAML AST (`keepSourceTokens: true`), preserving authored quoting and scalar style. Using the `asyncapi` CLI's `bundle` command would inline every ref, tripling the document and removing the refs that `scripts/contracts/generate-asyncapi-types.ts` walks to name its models.
- **Collision is fatal, not a warning.** `mergeInto` throws if two sections declare the same server, channel, message, or schema key. This prevents a silent "last writer wins" that would drop a channel from the frontend-generated client.
- **Comment stripping is key-level, not document-level.** The `yaml` library attaches a leading comment block to the node that follows it; `doc.commentBefore` is only set on empty documents. The code clears `commentBefore` on the first map key's key node.
- **`lineWidth: 0`** in serialisation prevents the YAML emitter from re-wrapping long lines, which would produce diff noise on unrelated edits and false staleness in `check:contracts-bundle`.
- **Discovery, not enumeration.** Module sections are found by reading `src/modules/` from disk. Adding or removing a module with an AsyncAPI file requires no edit here; only the `MODULE_ASYNC_ORDER` preference array needs updating to change narrative order.
- **`compiled` cache** is a module-level `Map<AsyncScope, string>`: a full build run compiles each scope once even if both bundles are requested.
