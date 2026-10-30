---
source: src/modules/users/services/create.ts
sha256: 1894071b55c451d139cef5e38ba21ee484a2fdd89119ad82e9d4062a002253b1
generated_at: 2026-10-29T06:15:48.773486+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/create.ts

## Purpose

Admin-side user creation. An operator creates a user account (not the self-service `accountService.signup` path). The function assigns a random password the owner must later reset, optionally grants a staff role, fires a `USER_SETUP_REQUESTED` outbox event, and records audit + analytics — all committed atomically.

## Key elements

- **`create(data, context)`** — sole export. Accepts `WithServerImage<CreateUserRequest>` and `CallerContext`; returns `Promise<ResponseSuccess<UserDocument> | ResponseReject>`. Steps in order:
  1. Generates a 32-byte random hex password (never admin-supplied).
  2. If a `role` is present, calls `accessService.grantRefusalAudited` *before* any write; on refusal, returns a reject immediately (no row created).
  3. Runs `announceInTransaction`: `userRepository.create` → optional `accessService.assignRole` → outbox event `USER_SETUP_REQUESTED`, all in one session.
  4. Post-commit: `accessService.auditRoleAssigned` (role only), `recordAudit` (admin action), `emitAnalyticsEvent`.
  5. Calls `enqueueIfPending(user)` for deferred image processing.
  6. Wraps in `generateSuccess(user, 201)`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/response.ts` | Imports `generateSuccess`, `ResponseSuccess`, `ResponseReject` for the result envelope. |
| `src/kernel/outbox.ts` | `announceInTransaction` wraps the DB write, role grant, and event in one atomic session. |
| `src/kernel/access/tenant.ts` | `DEPLOYMENT_TENANT_ID` identifies the tenant scope for role assignment. |
| `src/modules/access/index.ts` | `accessService.grantRefusalAudited`, `.assignRole`, `.auditRoleAssigned`. |
| `src/modules/users/repository.ts` | `userRepository.create(doc, session)` persists the user document. |
| `src/modules/users/events.ts` | `USER_SETUP_REQUESTED` event name for the outbox payload. |
| `src/modules/users/analytics.ts` | `usersAnalyticsEvents.USER_CREATED` event name. |
| `src/modules/users/audit.ts` | `usersAuditActions.ADMIN_USER_CREATED` action name. |
| `src/infrastructure/observability/audit.ts` | `recordAudit` logs the admin-creation action. |
| `src/infrastructure/observability/analytics/index.ts` | `emitAnalyticsEvent` / `buildAnalyticsBase` fire the analytics event. |
| `src/modules/users/services/image.ts` | `enqueueIfPending` kicks off deferred image handling after success. |
| `src/modules/users/services/role-refusal.ts` | `roleRefusalReject` builds the rejection response when a grant is denied. |
| `src/modules/users/services/index.ts` | Barrel re-exports `create` to consumers. |
| `src/modules/users/model.ts` | `UserDocument` type for the return shape. |

## Notes

- **Password is always random.** The admin never supplies one; the owner must self-serve a reset via the outbox-driven link. This is intentional — a credential is the owner's alone.
- **`verifiedAt` is hardcoded to `now`.** No email-confirmation step; the operator typing the address *is* the vouch. A user with `verifiedAt` set and no staff role is a `customer` by default.
- **`imageUrl: null` → `undefined` mapping.** The schema default only applies to `undefined`, not `null`, so the code explicitly converts before passing to the repository.
- **Role refusal leaves zero state.** The check (and refusal audit) runs before `userRepository.create`; a refused grant never creates a user row or outbox event.
- **Role-assignment audit is post-commit.** `auditRoleAssigned` runs in the `.then` after `announceInTransaction` resolves, not inside the session, so the audit reflects a true commit.
- **Analytics event carries no user ID.** By design: pseudonymous IDs are personal data and consent belongs to the data subject, not the admin.
- **No compensating delete.** Because account, membership, and event commit together (or not at all), a partial failure leaves nothing to undo.
