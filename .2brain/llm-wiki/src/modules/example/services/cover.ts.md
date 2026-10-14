---
source: src/modules/example/services/cover.ts
sha256: 9f6b8772d3285aaf83234e6f4d39a209e7f35498de2a38f32b4f065f60ff404d
generated_at: 2026-10-14T15:44:50.870219+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/services/cover.ts

## Purpose

Implements the optional cover-image capability for the `example` module. After upload middleware has quarantined the bytes, this service writes the new image fields onto the document, enqueues a pending image to the digest pipeline, deletes the previously-replaced image, records an audit row, and shapes the success response.

## Key elements

- **`EXAMPLE_IMAGE_COLLECTION`** (`'examples'`) — the collection key `ImageDigestJobPayload` carries for this module; must match the `imageTargets` registration in `module.ts`.
- **`setCover(id, image, context)`** (exported) — public entry point. Loads the example with an `update`-scoped access filter, returns **404** if not found, checks `outrankedRefusalFor` (returns **403 OUTRANKED** for a higher-ranked owner), then delegates to `applyCover`.
- **`applyCover(example, image, context)`** (private) — applies the image writeback via `applyImageWriteback`, saves through `exampleRepository`, enqueues a pending digest job (`enqueueIfImagePending`), removes the replaced image (`imageStore.remove`), records an audit entry (`EXAMPLE_COVER_CHANGED`), and returns a `200` success response with the localized `example.cover-changed` message.

## Relationships

- **`image-store.ts`** — `applyImageWriteback` mutates the document's image fields; `imageStore.remove` deletes the superseded cover.
- **`image.worker.ts`** — `enqueueIfImagePending` hands a not-yet-processed image to the digest pipeline so `module.ts`'s `imageTargets` can write back later.
- **`http/response.ts`** — `generateSuccess` / `generateReject` build the typed HTTP envelopes.
- **`http/uploads.ts`** — `ImageChanges` is the shape the upload middleware passes in.
- **`i18n/index.ts`** / **`i18n/context.ts`** — `t()` localises the user-facing strings (`example.cover-changed`, `example.not-found`).
- **`observability/audit.ts`** — `recordAudit` writes the audit row.
- **`kernel/access/query.ts`** — `accessibleFilterFor` builds the scoped query so only `update`-eligible documents are loaded.
- **`../model.ts`** — `ExampleDocument` is the document type the service mutates.
- **`../repository.ts`** — `exampleRepository.save` / `.findScoped` and `exampleRepository.writebackImage` (the digest writeback callback).
- **`../audit.ts`** — `exampleAuditActions.EXAMPLE_COVER_CHANGED` enum value.
- **`./owner.ts`** — `outrankedRefusalFor` (rank check) and `presentWithOwner` (response shaping with owner info).
- **`./services/index.ts`** — barrel re-export of `setCover`.

## Notes

- **Order matters in `applyCover`:** the replaced image is deleted *after* the save lands, never before, to avoid orphaning a reference if the write fails.
- **Self-contained capability:** the module docstring lists the exact set of artifacts to remove to drop this feature — this file, `../controllers/put-example-cover.ts`, the route, the contract path, and the manifest entry. There are no hidden side-effects elsewhere.
- `EXAMPLE_IMAGE_COLLECTION` must stay in sync with the `imageTargets` key registered in `module.ts`; a mismatch silently breaks digest writeback.
