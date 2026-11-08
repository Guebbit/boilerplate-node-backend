---
source: src/modules/users/services/image.ts
sha256: 67835f8433854ea66daf9bc5bd6027aa7186a97b567f1afeef17f40e1eb7b065
generated_at: 2026-11-08T08:49:28.327980+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/image.ts

## Purpose

Single-purpose service that enqueues the image-digest job for a user document immediately after its persisting write commits. It decouples "the user is saved" from "the uploaded image is processed," so a digest failure never blocks account creation or update.

## Key elements

- **`enqueueIfPending(user: UserDocument): Promise<UserDocument>`** — The sole export. Schedules `enqueueIfImagePending` (from the image worker) to run **after the surrounding transaction commits**. Passes the user, the collection name `'users'`, and `userRepository.writebackImage` as the callback the worker uses to stamp the final image back onto the document. Always resolves to the original `user`; enqueue errors are logged, not thrown.

## Relationships

- **`src/infrastructure/adapters/image.worker.ts`** — Provides `enqueueIfImagePending`, the actual job-queueing call this file delegates to.
- **`src/infrastructure/runtime/after-commit.ts`** — Provides the `afterCommit` guard that defers the enqueue until the transaction is durable.
- **`src/modules/users/model.ts`** — Source of the `UserDocument` type used in the signature.
- **`src/modules/users/repository.ts`** — Supplies `userRepository.writebackImage`, the persistence callback handed to the worker.
- **`src/modules/users/services/create.ts` / `update.ts`** — Upstream callers that invoke `enqueueIfPending` after persisting a user.
- **`src/modules/users/services/index.ts`** — Barrel re-export making this service importable as part of the users service API.

## Notes

- `pendingImageKey` on the document is only ever present when the upload queue looked ready at write time (see `quarantineUploadedImages`). If it is absent, `enqueueIfImagePending` is a no-op and the placeholder image is left for the quarantine reaper to pick up later.
- Because the call runs inside `afterCommit`, the function **cannot** roll back the user write; the account exists regardless of whether the digest job lands. Treat the returned `Promise<UserDocument>` as guaranteed-fulfilled from the caller's perspective.
