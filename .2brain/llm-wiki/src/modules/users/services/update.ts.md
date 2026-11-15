---
source: src/modules/users/services/update.ts
sha256: f3bda8bc4a593df1f16608f42f3470a852153c80faee356e0420de5c3ef3ba12
generated_at: 2026-11-14T22:32:27.268877+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/update.ts

## Purpose

Admin-side user update service: assigns requested fields onto a loaded `UserDocument`, saves it inside a database transaction (atomically with any caller-supplied `SaveHook`), cleans up a replaced avatar image, and enqueues a GDPR rectification event only when a personal-data field actually changed. It also exposes the public `updateById` entry point that wraps the core `update` with a staff-role check and an admin audit row.

## Key elements

- **`update`** *(internal)* — Core write. Assigns `username`, `imageUrl`, `locale`, `phone` (PII-encrypted), `website`, and optionally `analyticsConsent` onto the document; then delegates to `saveThenClean`. Returns a `ResponseSuccess | ResponseReject` envelope (never throws).
- **`updateById`** *(public)* — Loads the document via `withClearedAccount` (staff-role gate), then calls `applyUpdate`, which records an admin audit row on success.
- **`SaveHook`** *(exported type)* — `(session: ClientSession) => Promise<unknown>`; a write that joins the update's transaction so it commits or rolls back atomically.
- **`rectifiedFields`** *(private)* — Compares incoming vs. stored values (decrypting phone first) and returns the list of `UserChangedField`s that genuinely moved. Must be called *before* assignment.
- **`announcing`** *(private)* — Wraps the caller's `SaveHook` with an outbox row for `USER_PROFILE_CHANGED` when `rectifiedFields` is non-empty, so the event commits in the same transaction.
- **`saveInTransaction`** *(private)* — Runs `userRepository.save` inside `withTransaction`, calling `rearmPrecondition` on each attempt for optimistic-concurrency retry.
- **`saveThenClean`** *(private)* — After a successful commit, removes the old avatar via `imageStore.remove`, then calls `enqueueIfPending` (deferred image upload) and wraps the result in `generateSuccess`.
- **`applyUpdate`** *(private)* — Captures audit metadata via `userAuditChanges` *before* `update` mutates the document, then records the audit row on success.

## Relationships

- **`src/infrastructure/adapters/image-store.ts`** — `applyImageWriteback` assigns the new image URL and returns the old one; the exported `imageStore` is used post-commit to delete the replaced file and thumbnail.
- **`src/infrastructure/http/response.ts`** — All return values are `ResponseSuccess<UserDocument>` or `ResponseReject`; `generateSuccess` wraps the final envelope.
- **`src/infrastructure/security/pii-encryption.ts`** — `encryptPii` / `decryptPii` (with `phoneAad` as AAD) protect the `phone` field on write and enable plaintext comparison in `rectifiedFields`.
- **`src/infrastructure/persistence/changes.ts`** — `clearedOrValue` maps `null` → `$unset` for `locale` and `website`.
- **`src/infrastructure/persistence/versioning.ts`** — `rearmPrecondition` re-checks the caller's `If-Match` header on each transaction retry.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` provides the `ClientSession` and retry loop.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` writes the admin audit row after a successful save.
- **`src/kernel/outbox.ts`** — `enqueueOutboxEvent` writes the `USER_PROFILE_CHANGED` row inside the transaction; `nudgeOutbox` triggers the relay after commit.
- **`src/modules/users/model.ts`** — `UserDocument` type and `phoneAad` (AEAD associated-data helper).
- **`src/modules/users/repository.ts`** — `userRepository.save` performs the actual Mongoose write.
- **`src/modules/users/audit.ts`** — Provides the `ADMIN_USER_UPDATED` action constant for the audit row.
- **`src/modules/users/events.ts`** — `USER_PROFILE_CHANGED` event name and `UserChangedField` union type.
- **`src/modules/users/services/image.ts`** — `enqueueIfPending` queues a deferred image upload if the avatar field is set.
- **`src/modules/users/services/audit-changes.ts`** — `userAuditChanges` snapshots which fields differ for the audit metadata.
- **`src/modules/users/services/cleared-account.ts`** — `withClearedAccount` enforces the staff-role protection and loads the document.

## Notes

- **`update` is intentionally `@internal`.** A sibling service could bypass the staff-role check by calling it directly; always go through `updateById` (admin) or the self-service path.
- **`analyticsConsent` is deliberately absent from `UpdateUserByIdRequest`.** Consent is a data-subject self-service field; it rides along via the single caller (`account`'s `updateProfile`) through the widened parameter type.
- **Phone comparison requires decryption.** The stored value uses a random IV, so two identical plaintexts never match as ciphertext. `rectifiedFields` decrypts before comparing.
- **Order matters:** `rectifiedFields` and `userAuditChanges` must be called *before* any field is assigned onto the document; `applyImageWriteback` captures the old URL before overwriting.
- **Image cleanup is post-commit.** `imageStore.remove` runs only after the transaction succeeds, so a rollback leaves the old file intact.
- **`nudgeOutbox` fires after commit**, not inside the transaction, because the relay reads durable rows.
- **`rearmPrecondition` inside the transaction callback** ensures each retry attempt re-validates the caller's `If-Match` against the current row, not the first attempt's already-consumed token.
