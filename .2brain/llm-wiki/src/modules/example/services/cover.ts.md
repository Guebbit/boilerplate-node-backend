---
source: src/modules/example/services/cover.ts
sha256: d66791036b969a9aa6f706868958709e506d6a2583672208f2e4ef94193b41f4
generated_at: 2026-11-08T05:53:08.781597+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/services/cover.ts

## Purpose

Applies a cover-image upload (already parsed by upload middleware) to an `Example` document, enqueues the new image for the digest pipeline, and deletes the image it replaced. It is the module's upload-capability service for the example's cover image.

## Key elements

- **`EXAMPLE_IMAGE_COLLECTION`** (`'examples'`) — constant that identifies this module's image collection to the digest pipeline; must match the key under which `module.ts` registers its `imageTargets` entry.
- **`applyCover`** (module-private) — writes the `ImageChanges` fields onto the loaded document via `applyImageWriteback`, saves through the repository, then (post-commit) enqueues the pending image, removes the replaced image from `imageStore`, records an audit row, and shapes the response.
- **`setCover`** (exported) — public entry point. Loads the example with a caller-scoped `update` filter; returns a 404 reject if not found/not editable, otherwise delegates to `applyCover`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/example/repository.ts` | `findScoped` to load the example; `save` to persist changes; `writebackImage` passed as the digest writeback callback. |
| `src/infrastructure/adapters/image-store.ts` | `applyImageWriteback` sets url/thumbnail/pending fields; `imageStore.remove` deletes the replaced file. |
| `src/infrastructure/adapters/image.worker.ts` | `enqueueIfImagePending` hands the saved document to the image digest worker. |
| `src/infrastructure/runtime/after-commit.ts` | `afterCommit` defers the enqueue until the DB write is durable. |
| `src/infrastructure/http/response.ts` | `generateSuccess` / `generateReject` build the HTTP response envelope. |
| `src/infrastructure/http/uploads.ts` | `ImageChanges` type — the shape the upload middleware produces. |
| `src/infrastructure/observability/audit.ts` | `recordAudit` logs the `EXAMPLE_COVER_CHANGED` action. |
| `src/modules/example/audit.ts` | Provides the `exampleAuditActions.EXAMPLE_COVER_CHANGED` enum value. |
| `src/modules/example/services/owner.ts` | `presentForCaller` shapes the saved document for the response. |
| `src/kernel/access/query.ts` | `accessibleFilterFor` builds the scoped lookup filter. |
| `src/infrastructure/i18n/index.ts` | `t` localizes the 404 error message. |
| `src/modules/example/module.ts` | Registers `imageTargets` under the same collection string; this file's comment links back to it. |

## Notes

- **Ordering is intentional.** The replaced image is deleted *after* the save commits, so a crash mid-write never loses the old cover while the new one is still being processed.
- **`applyCover` is not exported.** All callers go through `setCover`, which owns the load-and-access-check step.
- **Template origin.** The doc comment marks this as a per-module upload capability and instructs deletion (along with the controller, route, contract path, and manifest entry) if the module no longer needs uploads.
- **`EXAMPLE_IMAGE_COLLECTION` is a load-bearing string.** If it drifts from the `imageTargets` key in `module.ts`, the digest pipeline will not find the job payload.
