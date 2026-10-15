---
source: src/modules/users/services/update.ts
sha256: 090fa5d2fc770041261729031176cd2008b65e412f5a52facded1559f8d969b9
generated_at: 2026-10-15T12:12:20.405422+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/update.ts

## Purpose

Admin-side update of a single user document. Applies field changes (username, active, avatar, locale, phone, website, analytics consent), optionally grants a new role, and returns a typed success/reject envelope. Enforces per-field permission keys, PII encryption, optimistic-concurrency preconditions, and audit/telemetry for every mutation.

## Key elements

- **`update`** (exported) — Entry point. Assigns plain fields, captures the old image URL, encrypts `phone`, handles `active` toggling (including session revocation on ban), and delegates to `saveWithRole`.
- **`changedRole`** — Resolves whether the requested role actually differs from the stored membership; returns `undefined` when no real change occurred, preventing spurious grants or audits.
- **`saveAndGrant`** — Inside the caller's `ClientSession`, re-arms the `If-Match` precondition, marks `updatedAt` modified (so `editRevision` moves even for role-only edits), saves via `userRepository`, then calls `assignRole` if a role changed.
- **`saveWithRole`** — Orchestrator after role resolution: validates the grant (`assertCanGrantAudited`), runs `withTransaction(saveAndGrant)`, then calls `finishUpdate`.
- **`finishUpdate`** — Post-commit side effects: removes the replaced avatar from `imageStore`, emits the role-assigned audit event, enqueues any pending image task, and wraps the result in `generateSuccess`.
- **`FIELD_KEYS` / `extraKeysNeeded`** — Maps the `active` field to the `users.any.ban` key; only a *change* triggers the extra requirement.
- **`missingKeyRefusal`** — Builds a `403` reject envelope and records a `SECURITY_FORBIDDEN` audit row for a field the caller's keys do not cover.

## Relationships

- **`@infrastructure/http/response`** — All return paths use `generateSuccess` / `generateReject` envelopes; no exceptions escape.
- **`@infrastructure/persistence/versioning`** — `rearmPrecondition` is called inside `saveAndGrant` so a retried transaction re-checks `If-Match` against the row it currently holds.
- **`@infrastructure/persistence/changes`** — `clearedOrValue` wraps nullable fields (`locale`, `website`) so `null` produces a `$unset` on save.
- **`@infrastructure/security/pii-encryption`** — `encryptPii(data.phone, phoneAad(user.id))` before assignment.
- **`@infrastructure/adapters/image-store`** — `applyImageWriteback` overwrites the avatar field and returns the old URL; `imageStore.remove` deletes it after commit.
- **`@infrastructure/runtime/database`** — `withTransaction` wraps `saveAndGrant` so the document save and the membership write are atomic.
- **`@modules/access`** — `assertCanGrantAudited` validates the grant before any write; `assignRole` persists the membership; `rolesOf` reads the current role for change detection; `auditRoleAssigned` fires post-commit.
- **`@kernel/access/tenant`** — `DEPLOYMENT_TENANT_ID` is the fixed tenant scope for every role lookup and grant.
- **`@kernel/ability`** — `heldKeys` is consulted in the per-field permission check.
- **`@infrastructure/observability/audit`** — `recordAudit` + `coreAuditActions.SECURITY_FORBIDDEN` for field-level refusals; `auditRoleAssigned` for successful grants.
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` / `buildAnalyticsBase` fire on committed updates.
- **`@infrastructure/i18n`** — `t` localises error message strings in reject envelopes.
- **`@modules/users/analytics`** — `usersAnalyticsEvents` provides the event catalog.

## Notes

- The file deliberately types its input off `UpdateUserByIdRequest` (minus `role`) rather than a hand-picked `Pick`, because a prior hand-picked list omitted `active` and caused `USER_DEACTIVATED` analytics to fire without the field ever being written.
- `analyticsConsent` is **not** part of the admin `/users/:id` contract; it rides in as an extra parameter only when the caller is the account's own `updateProfile`. Consent is a data-subject right, never an operator action.
- `markSessionsEnded` runs *inside* the update's save (same transaction), not in a post-commit hook, so a ban immediately invalidates tokens without a race window.
- A role re-grant of the value already held is a no-op (`changedRole` returns `undefined`), avoiding both a spurious privilege check and a phantom audit row.
- `user.markModified('updatedAt')` is required for role-only changes because Mongoose would otherwise see no document diff and the ETag (`editRevision`) would not advance, defeating optimistic concurrency.
