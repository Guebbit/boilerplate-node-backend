---
source: scripts/contracts/asyncapi-bundles.ts
source_sha256: 113e3ca5e8094854de87336284f8275e1bd6ebc9ca4376a0ec2b06a8f8d19592
context_sha256: 4602bd32b8e5a42d72b1a9185ad260fcede9840250dd0efe8f4fdb827d1d27bf
generated_at: 2026-11-22T01:53:16.157591+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/asyncapi-bundles.ts

## Purpose
Builds the realtime contract bundles by merging one whole AsyncAPI document per section into two outputs: a full bundle (`asyncapi.yaml`, every channel the service has) and a public bundle (only what an API client can reach). A single `scope` per section produces both, so they cannot describe a channel differently. It deliberately avoids `asyncapi bundle` because that dereferences every `$ref`, which would leave the type generator nothing to follow. Instead it copies five maps and refuses on a collision. Merging goes through the YAML AST so authored quoting and scalar style are preserved.

## Key elements
- `AsyncScope` (`'shared' | 'backend'`): `shared` sections go into both bundles and to the paired frontend. `backend` sections stay internal (queues).
- `MODULE_ASYNC_ORDER`: preferred order (`observability`, `webhooks`) for modules owning a top-level `asyncapi.yaml`. It is a preference only, and membership comes from disk.
- `resolveModuleAsyncSections()`: public sections, found via `modulesWith(MODULES_ROOT, 'asyncapi.yaml')` and ordered by `orderSections`.
- `internalSections()`: discovers modules with `asyncapi.internal.yaml` and names them `<module>-internal`.
- `DOMAIN_EVENTS_SECTION` (`'domain-events'`): backend-only section for outbox and in-process domain events. It merges last because its schemas may reference earlier enums.
- `ASYNC_SECTION_ORDER`: module public sections, then internal sections, then `workers`, then `domain-events`.
- `SHARED_SECTIONS`: the set of public module sections. `-internal` sections and `workers` never join it.
- `sectionsInScope(scope)`: returns the full order for `backend`, or the shared subset otherwise.
- `asyncSectionDocument(section)`: maps a section to its source file. `workers` and `domain-events` live in `shared/contracts/`. Internal sections use `src/modules/<name>/asyncapi.internal.yaml`. Everything else uses `src/modules/<name>/asyncapi.yaml`.
- `ASYNC_ROOT_DOCUMENT`: `shared/contracts/asyncapi.root.yaml`, the preamble (version, id, info, content type, tags). It holds no channels or servers.
- `MERGED_PATHS`: `servers`, `channels`, `operations`, `components.messages` and `components.schemas`, in that order. This order is the output key order.
- `fragmentsFor`, `marker`: `marker` builds the "Code generated ... DO NOT EDIT" header, listing the root, section documents and fragment files as sources.
- `read`: parses YAML with `keepSourceTokens: true`.
- `mergeInto` / `mergeDocument`: merge a section's maps into the target and throw an `[asyncapi]` error naming the colliding key and the second section if a key is already present.
- `compiled` / `compile(scope)`: builds one scope's YAML text and caches it per scope for the run. It reads the root, clears the root's leading comment, then merges each in-scope section together with its fragments. The visible part of the file ends partway through the YAML output options in `compile`.

## Relationships
- `./asyncapi-section-fragments`: `sectionFragments` and `withSectionFragments` bring in fragments other modules ship for a section (such as webhook events). They are merged with this file's `mergeDocument`.
- `./bundle-kinds`: provides the `ContractBundle` type (imported here).
- `./section-order`: `orderSections` applies the preferred ordering to the on-disk discovery.
- `../modules-on-disk`: provides `REPO_ROOT`, `MODULES_ROOT` and `modulesWith` for locating module documents.

## Notes
- Section membership is discovered from disk, so adding or removing a module with an `asyncapi.yaml` or `asyncapi.internal.yaml` needs no edit here.
- The root file's leading comment is cleared from its first key node, not from `doc.commentBefore`. The latter silently does nothing when the document has content.
- The `compile` comments say `lineWidth: 0` is used so that unrelated edits do not re-flow prose and make the bundle check report false staleness.
