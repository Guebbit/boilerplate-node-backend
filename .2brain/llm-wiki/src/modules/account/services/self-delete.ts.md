---
source: src/modules/account/services/self-delete.ts
sha256: 635a8f6160a08c5cb495582705e5ea76fbd65d7de242951d2b43fec91c32f6b5
generated_at: 2026-10-14T08:53:32.416379+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/self-delete.ts

## Purpose
Performs a hard (irreversible) deletion of the caller's own account after the one-time confirmation link has been spent. It exists as a thin wrapper around `userService.remove` so that audit and analytics events carry the deleted user's identity as the actor — distinct from the admin-initiated `DELETE /users/:id` path that also calls `remove` internally.

## Key elements
- **`removeOwnAccount(user, context)`** – The sole export. Accepts the already-fetched `UserDocument` and `CallerContext`, then:
  1. Captures `email`, `locale`, `_id`, and the greeting name *before* the write (the document no longer exists after the delete).
  2. Resolves the caller's role via `isUnrestrictedCaller` (membership store, not the document) so the audit record is accurate even if the erasure cascade has already revoked the membership.
  3. Calls `userService.remove(user, true)` (hard-delete flag).
  4. On success: records an `AUTH_ACCOUNT_DELETE_COMPLETED` audit event, emits an `ACCOUNT_DELETED` analytics event, and fires a "goodbye" email (`deleteConfirmEmail`) at `normal` priority.

## Relationships
- **`../emails`** – Pulls `deleteConfirmEmail`, `greetableName`, and `recipientLocale` to compose and address the post-deletion farewell mail.
- **`./mail`** – Uses `sendAccountMail` to dispatch that email.
- **`@modules/users`** – Calls `userService.remove` and consumes the `UserDocument` type.
- **`../roles`** – `isUnrestrictedCaller` determines whether the deleted user held an admin role (written into the audit `actorRole`).
- **`../analytics` / `../audit`** – Supplies the concrete event-name and action-name constants (`accountAnalyticsEvents.ACCOUNT_DELETED`, `accountAuditActions.AUTH_ACCOUNT_DELETE_COMPLETED`).
- **`@infrastructure/observability/analytics` & `audit`** – Generic `emitAnalyticsEvent` / `recordAudit` sinks.
- **`@types`** – Provides the `CallerContext` type (request-level locale, IP, etc.).

## Notes
- Events are emitted *here*, not inside `userService.remove`, specifically to avoid double-firing when the admin `removeById` path calls `remove` as its last step. The admin path already reports `ADMIN_USER_ERASED` / `ADMIN_USER_SOFT_DELETED` with the admin as actor.
- All display data (name, locale, email) is snapshotted **before** `remove` resolves; any code that reads the document after the write will find nothing.
- The goodbye email uses the recipient's stored locale first, falling back to the request locale — the same two-tier pattern as `passwordResetChange`.
- Mail priority is `normal` (not high/critical): it is informational, not a code or link the user is blocked on.
