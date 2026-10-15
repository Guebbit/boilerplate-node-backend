---
source: src/modules/users/services/image.ts
sha256: 135340e5d56b39e166536ba76c7766aad8a7e870e863f396b69718ed6215553e
generated_at: 2026-10-15T12:10:26.043459+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/image.ts

## Purpose

Thin service wrapper that queues a background image-digest job for a user document immediately after it has been persisted, but only when that write carried a pending image upload (`pendingImageKey`). It exists so that `create` and `update` flows can trigger the digest in one call without duplicating the queue-logic.

## Key elements

- **`enqueueIfPending(user: UserDocument): Promise<UserDocument>`** — The sole export. Delegates to `enqueueIfImagePending` with the user, the bucket name `'users'`, and `userRepository.writebackImage` as the write-back callback. Returns the (potentially updated) user document once the enqueue step resolves.

## Relationships

- **`@infrastructure/adapters/image.worker`** — Provides `enqueueIfImagePending`, the actual adapter that checks whether `pendingImageKey` is set, enqueues the digest job, and clears the key.
- **`src/modules/users/repository.ts`** — Supplies `userRepository.writebackImage`, the function the adapter calls to persist the digested image key back onto the user document.
- **`src/modules/users/model.ts`** — Defines the `UserDocument` type used as both the input and return type of `enqueueIfPending`.
- **`src/modules/users/services/create.ts` / `update.ts`** — Call `enqueueIfPending` after a successful user write to kick off the digest pipeline.
- **`src/modules/users/services/index.ts`** — Re-exports `enqueueIfPending` as part of the users service public API.

## Notes

- `pendingImageKey` is only ever present on a user document that went through `quarantineUploadedImages` at upload time; for all other documents `enqueueIfPending` is effectively a no-op (the adapter sees no key to process).
- The bucket/partition name is hardcoded as the string `'users'`; if this file is ever copied to another module, that literal must change.
