---
source: scripts/contracts/asyncapi-bundles.ts
sha256: e1cdf62043007ed92fc486a7d35e0f851fd2b146ee73b156ba18f45b47ebb53a
generated_at: 2026-10-15T09:35:27.989136+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/asyncapi-bundles.ts

## Purpose

Builds two committed AsyncAPI bundles from per-section source documents: `asyncapi.yaml` (every channel the service owns) and `asyncapi.public.yaml` (only the channels an API client can reach). It merges by copying five YAML map nodes (servers, channels, operations, messages, schemas) rather than dereferencing `$ref`s, preserving those references for downstream type generation while keeping the output compact.

## Key elements

- **`ASYNC_SECTION_ORDER`** (exported) — ordered list of all section names merged into the bundles (public module sections → internal sections → `workers`).
- **`asyncapiBundle`** (exported, `ContractBundle`) — the full/backend bundle; writes to `asyncapi.yaml` at repo root.
- **`asyncapiPublicBundle`** (exported, `ContractBundle`) — the shared/public bundle; writes to `asyncapi.public.yaml`. Contains only sections in `SHARED_SECTIONS`.
- **`compile(scope)`** — assembles one bundle: reads the root document, merges each in-scope section's map nodes, strips the root's leading comment, and serialises with `indent: 4, lineWidth: 0`. Caches results in the `compiled` map.
- **`mergeInto` / `mergeDocument`** — copies map entries node-by-node; **throws** on any key collision (two sections claiming the same channel, server, message, or schema name).
- **`sectionsInScope(scope)`** — filters `ASYNC_SECTION_ORDER` to shared-only or all sections.
- **`SHARED_SECTIONS`** — set of module names that own a top-level `asyncapi.yaml`; everything else is backend-only.
- **`internalSections()`** — discovers modules with an `asyncapi.internal.yaml` and appends the `-internal` suffix.
- **`asyncSectionDocument(section)`** — resolves the on-disk YAML file for a given section name.
- **`marker(sections)`** — generates the `# DO NOT EDIT` header listing every source file used.
- **`fragmentsFor(sections)`** — returns webhook-event fragment files when the `webhooks` section is present.
- **`withWebhookEvents`** (imported) — wraps a section document to inject per-module webhook event definitions before merging.

## Relationships

- **`scripts/contracts/bundle-kinds.ts`** — provides the `ContractBundle` type shape used by the two exported bundle objects.
- **`scripts/contracts/section-order.ts`** — provides `orderSections`, which reorders the discovered module list to match `MODULE_ASYNC_ORDER`.
- **`scripts/modules-on-disk.ts`** — provides `REPO_ROOT`, `MODULES_ROOT`, and `modulesWith` (disk-based discovery of which modules own an `asyncapi.yaml` or `asyncapi.internal.yaml`).
- **`scripts/contracts/asyncapi-webhook-events.ts`** — provides `webhookEventFragments` (source file list) and `withWebhookEvents` (injects event definitions into the `webhooks` section before merge).
- **`src/modules/webhooks/asyncapi.yaml`** — read as the source document for the public `webhooks` section.
- **`src/modules/webhooks/asyncapi.internal.yaml`** — read as the source document for the `webhooks-internal` section.
- **`scripts/contracts/bundle-registry.ts`** — consumes the exported `asyncapiBundle` / `asyncapiPublicBundle` objects within the broader contract-bundling pipeline.
- **`tests/contract/request-sources.test.ts`** — verifies the `sources()` arrays report every file the bundle actually reads.
- **`tests/cross-cutting/side-effects-have-one-layer.test.ts`** — asserts this file performs no writes (output is pure string content; the registry handles disk I/O).
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — exercises the mutation/Ci-wave logic that this bundle participates in.

## Notes

- **Not `asyncapi bundle`:** the AsyncAPI CLI dereferences every `$ref`, tripling the document and leaving `generate-asyncapi-types.ts` with no refs to walk. This file deliberately copies nodes only.
- **Collision = error, not overwrite:** a duplicate key (e.g. two modules both declaring `MetricsPayload`) throws with both section names in the message. There is no "last one wins."
- **Comment stripping quirk:** the root document's leading comment is removed from the *first map key node* (`contents.items[0].key.commentBefore`), not from `doc.commentBefore`. Setting `doc.commentBefore` is a no-op when the document has content.
- **`lineWidth: 0`** prevents `yaml` from re-wrapping long lines, which would produce spurious diffs unrelated to channel changes.
- **Discovery over registration:** module sections are found by scanning `MODULES_ROOT` for the presence of `asyncapi.yaml` / `asyncapi.internal.yaml`. Adding or deleting a module's contract file is the only required change.
- **Scope split is per-section, not per-channel:** a section is either fully public (`shared`) or fully backend. The `webhooks` module's public event catalogue goes into both bundles; its internal queue section goes into the backend bundle only.
