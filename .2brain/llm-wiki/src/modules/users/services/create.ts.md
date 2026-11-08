---
source: src/modules/users/services/create.ts
sha256: 1894071b55c451d139cef5e38ba21ee484a2fdd89119ad82e9d4062a002253b1
generated_at: 2026-11-08T08:48:53.248693+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/create.ts

## Purpose

Admin-side user creation service. An operator creates a user account (no self-service email confirmation), optionally assigns a staff role, and triggers a one-time password-setup email — all committed in a single MongoDB transaction.

## Key elements

- **`create(data, context)`** — the sole export. Orchestrates role-refusal check → transactional user insert + role assignment + outbox event → post-commit audit/analytics → image-queue enqueue. Returns `Promise<ResponseSuccess<UserDocument> | ResponseReject>`.

## Relationships

- **`@kernel/outbox`** (`announceInTransaction`) — wraps the user insert, role assignment, and `USER_SETUP_REQUESTED` event in one ACID unit; the event is the only way the setup email is dispatched.
- **`@modules/access` / `accessService`** — `grantRefusalAudited` gates the role before any write; `assignRole` persists the grant inside the transaction; `auditRoleAssigned` records it post-commit.
- **`./role-refusal`** (`roleRefusalReject`) — formats the early-return `ResponseReject` when the caller lacks permission for the requested role.
- **`../repository`** (`userRepository.create`) — persists the `UserDocument` within the session.
- **`../events`** (`USER_SETUP_REQUESTED`) — outbox event name that downstream consumers turn into a password-reset link email.
- **`./image`** (`enqueueIfPending`) — posts the user to the image-processing queue if an image was attached.
- **`@infrastructure/observability/audit`** / **`../audit`** (`recordAudit`, `usersAuditActions`) — logs `ADMIN_USER_CREATED`.
- **`@infrastructure/observability/analytics`** / **`../analytics`** (`emitAnalyticsEvent`, `buildAnalyticsBase`, `usersAnalyticsEvents`) — emits `USER_CREATED` with `admin_created: true`.
- **`@infrastructure/http/response`** (`generateSuccess`) — wraps the final 201 envelope.
- **`@kernel/access/tenant`** (`DEPLOYMENT_TENANT_ID`) — the fixed tenant scope for role grants.
- **`../model`** (`UserDocument`) — the shape returned to the caller.

## Notes

- **Password is always random** (`randomBytes(32).toString('hex')`). It is never communicated; the owner must self-serve via the `USER_SETUP_REQUESTED` reset link. This is deliberate — a credential belongs to its owner.
- **`verifiedAt` is set to `now` unconditionally.** The act of an admin typing the address serves as the verification vouch; no separate confirmation step exists on this path.
- **Role refusal is checked before any write.** A denied grant produces an audit row but no user document, no outbox event, and no partial state.
- **`imageUrl: data.imageUrl ?? undefined`** — the `??` matters because the schema default applies to `undefined` only; an explicit `null` would be stored as "no image" rather than triggering the default.
- **Analytics event carries no `targetId`.** Consent for personal data is the data subject's, not the admin's, so the user's pseudonymous id is intentionally omitted.
- **Post-commit side effects** (role audit, user audit, analytics, image enqueue) run in the `.then` chain after the transaction resolves, so a failure there does not roll back the account.
