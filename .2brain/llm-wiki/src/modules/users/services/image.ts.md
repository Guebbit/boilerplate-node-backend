---
source: src/modules/users/services/image.ts
sha256: 67835f8433854ea66daf9bc5bd6027aa7186a97b567f1afeef17f40e1eb7b065
generated_at: 2026-10-29T06:16:21.100050+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/image.ts

## Purpose

Provides the post-persistence hand-off that enqueues the image-digest job for a user whose write carried a pending upload. It exists so that the digest work is deferred until the transaction has committed, guaranteeing the account is saved regardless of whether the enqueue succeeds.

## Key elements

- **`enqueueIfPending(user: UserDocument): Promise<UserDocument>`** — The sole export. Wraps the digest enqueue in an `afterCommit` hook:
  - Delegates to `enqueueIfImagePending` (from `image.worker`) with the collection name `'users'` and `userRepository.writebackImage` as the writeback callback.
  - On failure, the error is logged and the original `user` document is returned unchanged; the placeholder image is left for the quarantine reaper to reclaim.

## Relationships

- **`src/infrastructure/adapters/image.worker.ts`** — Source of `enqueueIfImagePending`, the actual queue-dispatch function that inspects `pendingImageKey` and performs the writeback.
- **`src/infrastructure/runtime/after-commit.ts`** — Supplies the `afterCommit` runtime hook that defers the enqueue until the surrounding DB transaction commits.
- **`src/modules/users/model.ts`** — Provides the `UserDocument` type used as the function's parameter and return type.
- **`src/modules/users/repository.ts`** — Provides `userRepository.writebackImage`, the callback `enqueueIfImagePending` invokes to persist the final image reference back to the user document.
- **`src/modules/users/services/create.ts` / `update.ts`** — Callers that invoke `enqueueIfPending` after persisting a new or modified user (per dependency graph).
- **`src/modules/users/services/index.ts`** — Re-exports `enqueueIfPending` as part of the public user-services surface.

## Notes

- `pendingImageKey` is only ever set while the upload queue looked ready (see `quarantineUploadedImages` in the worker); by the time this function runs the key either exists (enqueue proceeds) or is absent (no-op).
- The function always resolves (never rejects to the caller) because `afterCommit` swallows enqueue errors into a log entry. Callers can treat it as fire-and-forget after the main write.
- The `userId` in the options object is passed as a `String` for structured logging, not for any functional routing.
