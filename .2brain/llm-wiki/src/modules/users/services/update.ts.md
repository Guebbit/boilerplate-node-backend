---
source: src/modules/users/services/update.ts
sha256: 62643acb52b705f34918f3f26350132eba2b6ceb8e3ab74e5a4bdae7c99c1ae6
generated_at: 2026-10-29T06:19:05.665298+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/update.ts

## Purpose

Admin-side user update: assigns field values on the user document, handles the staff-role membership change, saves both atomically in a transaction, and enqueues the GDPR Art. 19 rectification announcement. It is the single write path shared by `updateById` (staff editing another user) and `updateOwnProfile` (self-service), centralising PII encryption, image writeback, and audit in one place.

## Key elements

- **`update`** (exported, `@internal`) — The main write function. Accepts a loaded `UserDocument`, a change-set typed off `UpdateUserByIdRequest`, the caller's `CallerContext`, an optional `RoleChange`, and an optional `SaveHook`. Returns a `ResponseSuccess | ResponseReject` envelope rather than throwing.
- **`SaveHook`** (exported type) — A `(session: ClientSession) => Promise<unknown>` that joins the save transaction. Lets callers (e.g. `account`) commit their own row alongside the user document.
- **`RoleChange`** (module-private type) — `{ grant: string } | { revoke: string } | undefined`, representing the membership delta.
- **`roleChangeRequested`** (exported) — Pre-controller check (id + body only) that returns `true` if the edit would grant or revoke the tenant role. Used to decide whether the caller must re-authenticate before the controller runs.
- **`changedRole`** (module-private) — Resolves the actual `RoleChange` by comparing the requested value against the held tenant role via `accessService.rolesOf`. A PUT that resends the current role yields `undefined` (no-op).
- **`rectifiedFields`** (module-private) — Computes which personal-data fields truly moved. Must be called **before** assignment. Decrypts stored phone to compare plaintexts (stored value uses a random IV).
- **`announcing`** (module-private) — Builds the `SaveHook` that enqueues `USER_PROFILE_CHANGED` into the outbox within the same session, so the announcement commits with the rectification or not at all.
- **`writeRole`** (module-private) — Performs `accessService.assignRole` or `revokeRole` inside the transaction session, passing the caller's permissions as the granter bound.
- **`saveWithRole`** (module-private, truncated) — The transactional write: document save + role membership write, both-or-neither, using `withTransaction` and `rearmPrecondition`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `infrastructure/security/pii-encryption.ts` | `encryptPii` on write, `decryptPii` in `rectifiedFields` for plaintext comparison; `phoneAad` (from `../model`) supplies the AAD. |
| `infrastructure/adapters/image-store.ts` | `applyImageWriteback` captures the old URL before overwrite and schedules file/thumbnail deletion after the new image is durably saved. |
| `infrastructure/persistence/changes.ts` | `clearedOrValue` maps `null` → `$unset` for `locale` and `website`. |
| `infrastructure/persistence/versioning.ts` | `rearmPrecondition` re-stamps the optimistic-concurrency token inside the transaction. |
| `infrastructure/runtime/database.ts` | `withTransaction` wraps the document save + role write as an atomic unit. |
| `infrastructure/observability/audit.ts` | `recordAudit` writes the audit row (action from `usersAuditActions`, diff from `userAuditChanges`). |
| `infrastructure/http/response.ts` | `generateSuccess` / `generateReject` shape the returned envelope. |
| `infrastructure/i18n/index.ts` | `t` imported for (presumably) rejection messages. |
| `kernel/outbox.ts` | `enqueueOutboxEvent` writes the `USER_PROFILE_CHANGED` row in-session; `nudgeOutbox` flushes the relay **after** commit. |
| `kernel/access/tenant.ts` | `DEPLOYMENT_TENANT_ID` scopes all `accessService` role calls. |
| `modules/access/index.ts` / `services/index.ts` | `accessService.rolesOf`, `.assignRole`, `.revokeRole` for membership reads and writes. |
| `modules/users/audit.ts` | `usersAuditActions` provides the action identifier for the audit row. |
| `modules/users/events.ts` | `USER_PROFILE_CHANGED` event name and `UserChangedField` union type. |

## Notes

- **`update` is `@internal`.** It deliberately skips the staff-role pre-check that `updateById` performs; calling it directly from a sibling module would let a caller re-role an account without that gate.
- **`analyticsConsent` is not on the admin contract.** It is appended to the parameter type and only ever supplied by the `account` self-service caller. An operator cannot set or unset it on another user's behalf.
- **Phone comparison requires decryption.** Because the stored value uses a random IV, two identical numbers produce different ciphertexts; `rectifiedFields` decrypts before comparing.
- **`role` is not a document field.** It is a separate membership record managed by `accessService`; the document save and the membership write are two statements in one transaction.
- **Outbox nudge is post-commit.** `nudgeOutbox()` runs only after `result.success`, so the relay reads durable rows.
- **`roleChangeRequested` duplicates `changedRole`'s comparison logic** (via shared `roleDiffers`) but operates on id + body without loading the full document, so it can gate the route before the controller loads the user.
