---
source: src/modules/users/services/update.ts
sha256: 62643acb52b705f34918f3f26350132eba2b6ceb8e3ab74e5a4bdae7c99c1ae6
generated_at: 2026-11-08T08:52:35.345192+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/update.ts

## Purpose

Admin-side user update service. Assigns field changes (username, phone, website, image, locale, consent) onto a loaded user document, optionally grants or revokes a staff role, writes an audit row, emits a GDPR Art. 19 rectification event, and commits everything in a single transaction. Returns a `ResponseSuccess` / `ResponseReject` envelope rather than throwing.

## Key elements

- **`update`** (exported, `@internal`) — Main entry point. Reads the "before" state, mutates the document, resolves the role change, and delegates to `saveWithRole`. Typed off `UpdateUserByIdRequest` so new contract fields reach the write automatically.
- **`rectifiedFields`** — Compares the incoming change-set against the stored document *before* mutation and returns the list of fields that actually moved. Handles the encrypted-phone comparison by decrypting in plaintext.
- **`announcing`** — Wraps the caller's optional `SaveHook` with a `USER_PROFILE_CHANGED` outbox enqueue, so the rectification event commits with the document or not at all.
- **`SaveHook`** (exported type) — `(session: ClientSession) => Promise<unknown>`; a write that joins the update's transaction (e.g. `account` writing its own outbox row).
- **`RoleChange`** (internal type) — `{ grant: string } | { revoke: string } | undefined`.
- **`changedRole`** — Resolves the request's `role` field against the held membership (via `accessService.rolesOf`) and returns the actual change, filtering out no-op re-grants.
- **`roleChangeRequested`** (exported) — Route-level guard: given an id and raw `role` value, returns whether a real role change is pending. Used *before* the controller to decide if the caller owes a fresh login.
- **`writeRole`** — Executes the membership write (`assignRole` or `revokeRole`) inside the caller's transaction.
- **`saveWithRole`** — The write half: document save + membership write + audit row, all within `withTransaction`.

## Relationships

- **`@infrastructure/security/pii-encryption`** — Encrypts the phone on write (`encryptPii` with `phoneAad`); decrypts for the before/after comparison in `rectifiedFields`.
- **`@infrastructure/adapters/image-store`** — `applyImageWriteback` captures the old image URL so the save can delete the old file + thumbnail after the new one is durable.
- **`@infrastructure/persistence/changes`** — `clearedOrValue` normalises `null` vs. value for nullable string fields (locale, website).
- **`@infrastructure/persistence/versioning`** — `rearmPrecondition` re-arms the optimistic-lock token after save.
- **`@infrastructure/runtime/database`** — `withTransaction` provides the `ClientSession` that all writes (document, role, audit, outbox) join atomically.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the audit row inside the transaction.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape the return envelope.
- **`@kernel/outbox`** — `enqueueOutboxEvent` writes the `USER_PROFILE_CHANGED` row in-transaction; `nudgeOutbox` (post-commit) wakes the relay.
- **`@kernel/access/tenant`** — `DEPLOYMENT_TENANT_ID` scopes all role lookups and writes.
- **`@modules/access`** (`accessService`) — `rolesOf` reads the held tenant role; `assignRole` / `revokeRole` write the membership. The caller's `permissions` are passed as the granter check.
- **`@modules/users/audit`** — `usersAuditActions` supplies the action identifier for the audit row.
- **`@modules/users/events`** — `USER_PROFILE_CHANGED` event name and `UserChangedField` union type for the outbox payload.

## Notes

- `update` is deliberately `@internal`; it sits beneath `updateById` (which checks staff-role permissions first) and `updateOwnProfile`. Calling it directly skips the privilege check.
- `analyticsConsent` is **not** on the admin `UpdateUserByIdRequest` contract. It rides in via the `account` module's `updateProfile` caller and is intentionally excluded from the admin surface — consent belongs to the data subject.
- The phone field is stored with a random IV, so two identical numbers never match byte-for-byte. `rectifiedFields` decrypts before comparing; calling it *after* assignment would be a bug.
- `role` is not a column on the user document. It is a separate membership record written by `writeRole` in the same transaction.
- `nudgeOutbox` fires **after** the transaction commits, never inside it — the relay must read durable rows.
- `roleChangeRequested` and `changedRole` share the same `roleDiffers` comparison so the route-level guard and the in-service logic cannot disagree.
