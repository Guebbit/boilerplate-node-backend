---
source: src/modules/users/services/create.ts
sha256: a1e6bafe6e20e8c0f077256056b15ede40728826c2d1abd5f9f4011de6d41bfe
generated_at: 2026-10-15T12:10:00.306648+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/create.ts

## Purpose

Admin-side user creation: writes a new user document, grants a role membership, and emits a setup-request event — all in a single MongoDB transaction. Unlike the self-service `accountService.signup` path, the caller supplies the email and role; the password is never accepted from the client and is generated as an unguessable random value the owner must later replace via a reset link.

## Key elements

- **`create(data, context)`** — The sole export. Accepts a `WithServerImage<CreateUserRequest>` (optionally carrying `pendingImageKey`) plus a `CallerContext`. Returns `Promise<ResponseSuccess<UserDocument> | ResponseReject>` with HTTP 201 on success.
  - Generates a 32-byte hex password via `node:crypto` (`randomBytes`); this value is never stored in a way the owner can retrieve — it exists only to block the account until the owner self-serves a reset.
  - Defaults the role to `VERIFIED_CUSTOMER_ROLE` when `data.role` is absent.
  - Runs `assertCanGrantAudited` *before* any write so a privilege-escalation attempt is audited without creating a user.
  - Commits three things atomically via `announceInTransaction`: the user document (`userRepository.create`), the role membership (`assignRole`), and a `USER_SETUP_REQUESTED` outbox event keyed to the new user's ID.
  - Post-commit: fires `auditRoleAssigned`, records an `ADMIN_USER_CREATED` audit row, emits a `USER_CREATED` analytics event (distinctId = new user, not the admin), then calls `enqueueIfPending` for any pending image upload.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/response.ts` | Wraps the result in `generateSuccess` / typed `ResponseReject`. |
| `src/kernel/outbox.ts` | `announceInTransaction` provides the single-transaction commit for user + membership + outbox event. |
| `src/modules/access/service.ts` | `assertCanGrantAudited` (pre-write permission check), `assignRole` (membership write in-transaction), `auditRoleAssigned` (post-commit audit), `VERIFIED_CUSTOMER_ROLE` (default role). |
| `src/kernel/access/tenant.ts` | Supplies `DEPLOYMENT_TENANT_ID` used in the membership grant. |
| `src/modules/users/repository.ts` | `userRepository.create` persists the user document within the transaction session. |
| `src/modules/users/model.ts` | `UserDocument` type for the created entity. |
| `src/modules/users/events.ts` | `USER_SETUP_REQUESTED` — the outbox event name that triggers the setup email. |
| `src/modules/users/analytics.ts` | `usersAnalyticsEvents.USER_CREATED` event name. |
| `src/modules/users/audit.ts` | `usersAuditActions.ADMIN_USER_CREATED` action name. |
| `src/infrastructure/observability/analytics/index.ts` | `emitAnalyticsEvent` / `buildAnalyticsBase` for post-commit analytics. |
| `src/infrastructure/observability/audit.ts` | `recordAudit` for the post-commit audit row. |
| `src/modules/users/services/image.ts` | `enqueueIfPending` — processes a pending image upload if `pendingImageKey` was set. |
| `src/modules/users/services/index.ts` | Re-exports `create` for external consumers. |
| `src/types/auth-context.ts` | `CallerContext`, `CreateUserRequest`, `WithServerImage` type definitions. |
| `src/modules/access/index.ts` | Barrel re-export of the access-service functions used above. |

## Notes

- **Password is never caller-supplied.** The 32-byte hex value is intentionally unguessable and unsurfaced; the owner sets a real password later via `POST /account/reset-confirm`. Do not treat this field as a functional credential.
- **`verifiedAt` is hardcoded to `now`.** The design rationale (see `shared/authorization-roles.yaml`) is that an operator manually typing the email address *is* the vouching act.
- **`imageUrl: null` must become `undefined`.** The schema default applies only to `undefined`; passing `null` would store an explicit `null` instead of leaving the field unset. The code handles this with `data.imageUrl ?? undefined`.
- **Order matters:** permission check → transaction (create + assign + outbox) → audit → analytics → image enqueue. A refused grant produces zero writes and no outbox event; a mid-transaction failure rolls back everything, so no compensating delete is needed.
- **Analytics `distinctId` is the new user's ID**, not the admin's. The funnel tracks who came into existence, not who typed the form.
- The file is typed off `CreateUserRequest` (not a hand-picked `Pick`) to avoid silently dropping fields like `active` if the request shape changes.
