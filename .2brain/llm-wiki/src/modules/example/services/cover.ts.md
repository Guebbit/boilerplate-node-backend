---
source: src/modules/example/services/cover.ts
sha256: d66791036b969a9aa6f706868958709e506d6a2583672208f2e4ef94193b41f4
generated_at: 2026-10-29T03:55:21.078669+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/services/cover.ts

## Purpose
Implements the cover-image upload flow for the Example module: applies the image fields produced by the upload middleware to an already-loaded example row, persists the change, hands a pending image to the digest pipeline, deletes the replaced cover, and records an audit entry.

## Key elements
- **`EXAMPLE_IMAGE_COLLECTION`** (exported const) — The string (`'examples'`) used as `ImageDigestJobPayload.collection`; must match the key under which `module.ts` registers its `imageTargets` entry.
- **`setCover`** (exported) — Public entry point. Looks up the example with a scoped `update` access filter; on miss returns a 404 with an i18n message. On hit delegates to the internal `applyCover`.
- **`applyCover`** (internal) — Runs the write-back, save, after-commit enqueue, old-image removal, audit recording, caller-facing shaping, and 200 response as a chained Promise.

## Relationships
- **`src/modules/example/repository.ts`** — Calls `exampleRepository.save` and `exampleRepository.findScoped`; also passes `exampleRepository.writebackImage` as the callback to the digest worker.
- **`src/modules/example/module.ts`** — Not imported here, but `EXAMPLE_IMAGE_COLLECTION` must match the `imageTargets` key registered in that module.
- **`src/infrastructure/adapters/image-store.ts`** — `applyImageWriteback` mutates the document; `imageStore.remove` deletes the replaced image after the commit.
- **`src/infrastructure/adapters/image.worker.ts`** — `enqueueIfImagePending` submits the pending digest job (invoked inside `afterCommit`).
- **`src/infrastructure/runtime/after-commit.ts`** — Wraps the enqueue and old-image removal so they run only after the DB transaction has committed.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape the HTTP envelope.
- **`src/infrastructure/http/uploads.ts`** — Provides the `ImageChanges` type describing the middleware-produced image fields.
- **`src/infrastructure/i18n/index.ts`** — `t` for the 404 message.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` writes the `EXAMPLE_COVER_CHANGED` audit row.
- **`src/kernel/access/query.ts`** — `accessibleFilterFor` builds the ownership/role filter passed to `findScoped`.
- **`src/modules/example/audit.ts`** — Supplies the `exampleAuditActions.EXAMPLE_COVER_CHANGED` action identifier.
- **`src/modules/example/model.ts`** — `ExampleDocument` type for the loaded row.
- **`src/modules/example/services/index.ts`** — Re-exports this service to the module's public surface.

## Notes
- Image removal and digest enqueue are deliberately deferred behind `afterCommit`; a failure in either step is logged but does **not** roll back the saved cover (the saved row still answers the request).
- The 404 path is indistinguishable from a genuine missing document: the scoped filter hides examples the caller cannot `update`, so no information is leaked about existence.
- Deleting this file is the documented way to remove the cover-upload capability from the module (along with its controller route, contract path, and manifest entry).
