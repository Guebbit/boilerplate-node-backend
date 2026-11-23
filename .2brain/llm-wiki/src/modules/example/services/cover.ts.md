---
source: src/modules/example/services/cover.ts
source_sha256: 15b7eb923bb3494ad1d680a3a29966cdcaf9e5ca8423c520626e16148f9a36b2
context_sha256: ac3d926501180414b64c178ac6f7456d13dce351950236d3db81a37a69c08085
generated_at: 2026-11-22T05:11:50.522190+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/services/cover.ts

## Purpose
Service for an example's cover image upload. It applies the fields produced by the upload middleware to the example row, hands a still-pending image to the image digest pipeline, and removes the cover that was replaced. It is a template capability: the module doc says to delete it, together with the controller, route, contract path and manifest entry, if the module has no upload.

## Key elements
- `EXAMPLE_IMAGE_COLLECTION` (`'examples'`): the collection key carried in `ImageDigestJobPayload.collection`. It must match the string `module.ts` registers its `imageTargets` entry under.
- `setCover(id, image, context)`: exported entry point.
  - Looks up the example with `exampleRepository.findScoped`, filtered by `accessibleFilterFor(caller, 'Example', 'update')`.
  - Returns a 404 reject (`example.not-found`) if the caller can't edit an example with that id.
  - Otherwise delegates to `applyCover`.
- `applyCover` (private), in order:
  1. `applyImageWriteback` sets url, thumbnail and pending key together and returns the replaced url.
  2. `exampleRepository.save` persists the example.
  3. `afterCommit` runs `enqueueIfImagePending` with `exampleRepository.writebackImage`.
  4. `imageStore.remove(replaced)` deletes the old cover.
  5. `recordAudit` records `EXAMPLE_COVER_CHANGED`.
  6. `presentForCaller` shapes the result, returned as `generateSuccess(..., 200)`.

## Relationships
- `src/infrastructure/adapters/image-store.ts`: supplies `applyImageWriteback` and the `imageStore` used to remove the replaced cover.
- `src/infrastructure/adapters/image.worker.ts`: supplies `enqueueIfImagePending`, which queues the digest job.
- `src/infrastructure/http/uploads.ts`: defines the `ImageChanges` type for the upload middleware output.
- `src/infrastructure/runtime/after-commit.ts`: runs the enqueue after the save.
- `src/infrastructure/http/response.ts`: provides `generateSuccess` and `generateReject` and the response types.
- `src/infrastructure/i18n/index.ts`: `t` supplies the not-found message.
- `src/infrastructure/observability/audit.ts`: provides `recordAudit`.
- `src/modules/example/audit.ts`: provides `exampleAuditActions`.
- `src/kernel/access/query.ts`: provides `accessibleFilterFor` for the scoped lookup.
- `src/modules/example/repository.ts`: provides `findScoped`, `save` and `writebackImage`.
- `src/modules/example/model.ts`: provides the `ExampleDocument` type.
- `src/modules/example/services/owner.ts`: provides `presentForCaller`.
- `src/modules/example/module.ts`: registers the matching `imageTargets` entry.

## Notes
- The old image is deleted only after the save succeeds, never before.
- A failed enqueue is handled by `afterCommit`, which logs it, so the saved cover still answers normally.
- The 404 is the same whether the example is missing or the caller lacks `update` access.
