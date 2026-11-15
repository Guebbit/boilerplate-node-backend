---
source: src/modules/users/services/create.ts
sha256: e4f475f23ee42c372bbc5bfe739f84a5f7c67e08d2f540a47c04372b5ea623c9
generated_at: 2026-11-14T22:27:19.034430+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/create.ts

## Purpose

Admin-side user creation endpoint service. It atomically creates a user document, grants a role (if specified), and enqueues a setup-password event—all in a single transaction—then records audit and analytics side-effects. It exists as the privileged alternative to the self-service `accountService.signup` flow.

## Key elements

- **`create(data, context)`** — The sole export. Accepts a `WithServerImage<CreateUserRequest>` and a `CallerContext`; returns `Promise<ResponseSuccess<UserDocument> | ResponseReject>`.
  - Generates a random 32-byte hex password (never surfaced to anyone) so the account is unusable until the owner sets their own via the reset-confirm link.
  - If `data.role` is present, calls the access service's refusal check **before** any write; a refusal short-circuits to a rejection envelope.
  - Within `announceInTransaction`: writes the user via the repository, optionally assigns the role, and enqueues a `USER_SETUP_REQUESTED` outbox event—all or nothing.
  - Post-commit: audits the role assignment (if any), records an `ADMIN_USER_CREATED` audit entry, emits a `USER_CREATED` analytics event (no user id—consent is the admin's), and calls `enqueueIfPending` for image processing.
  - Returns `generateSuccess(user, 201)`.

## Relationships

- **`src/kernel/outbox.ts`** — Imports `announceInTransaction`, which wraps the user write, role assignment, and event emission in a single MongoDB transaction with the outbox.
- **`src/modules/access/index.ts`** — Imports `accessService`, used for the pre-write role-grant refusal check, the in-transaction role assignment, and the post-commit role-assignment audit.
- **`src/modules/access/services/index.ts`** — Part of the access module chain that `@modules/access` resolves through; supplies the concrete service methods invoked above.
- **`src/kernel/access/tenant.ts`** — Imports `DEPLOYMENT_TENANT_ID`, the tenant scope passed to role-assignment calls.
- **`src/modules/users/repository.ts`** — Imports `userRepository`; its `create` method performs the actual document insert within the transaction session.
- **`src/modules/users/model.ts`** — Imports the `UserDocument` type, the shape returned in the success envelope.
- **`src/modules/users/events.ts`** — Imports `USER_SETUP_REQUESTED`, the outbox event name emitted inside the transaction.
- **`src/modules/users/audit.ts`** — Imports `usersAuditActions`; the `ADMIN_USER_CREATED` action constant is used in the post-commit audit record.
- **`src/modules/users/analytics.ts`** — Imports `usersAnalyticsEvents`; the `USER_CREATED` event constant is used in the analytics emission.
- **`src/modules/users/services/image.ts`** — Imports `enqueueIfPending`, called last to kick off avatar processing if an image was supplied.
- **`src/modules/users/services/role-refusal.ts`** — Imports `roleRefusalReject`, which builds the rejection envelope when a role grant is denied.
- **`src/infrastructure/http/response.ts`** — Imports `generateSuccess` and the `ResponseSuccess`/`ResponseReject` types that shape the return envelope.
- **`src/infrastructure/observability/audit.ts`** — Imports `recordAudit`, which writes the `ADMIN_USER_CREATED` audit row post-commit.
- **`src/infrastructure/observability/analytics/index.ts`** — Imports `emitAnalyticsEvent` and `buildAnalyticsBase` for the analytics emission.
- **`src/modules/users/services/index.ts`** — Barrel that re-exports `create` for consumers of the users services module.

## Notes

- The password is deliberately random and never transmitted. The user must go through `POST /account/password/reset/confirm` (triggered by the `USER_SETUP_REQUESTED` event) to set their own. This is a security property, not a bug.
- `verifiedAt` is hardcoded to `new Date()` at creation time—an admin typing the address *is* the verification. Do not treat this as a data-entry mistake.
- The spread `...data` is typed off `CreateUserRequest` (not a hand-picked `Pick`) specifically to avoid silently dropping fields like `active`. If you add a field to the request type, it flows into the insert automatically.
- `imageUrl: data.imageUrl ?? undefined` is intentional: `null` means "no image" at the DB level, while `undefined` lets the schema default apply. The `??` normalises the wire-level `null`.
- Analytics deliberately omit the target user id; including a pseudonymous user id would make it personal data, and consent belongs to that data subject, not the admin.
- Role-refusal audit happens **before** the transaction (so no user row exists); the successful grant audit happens **after** commit. This ordering is a deliberate invariant.
