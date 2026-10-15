---
source: src/modules/account/services/self-delete.ts
sha256: 7f53fcd537d46c0e95ab9036ae1cd4ad199588e4c3bd025b080e90f042fe4be9
generated_at: 2026-10-15T10:02:47.534111+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/self-delete.ts

## Purpose
Hard-deletes the caller's own account after a one-time confirmation token has been redeemed. This is the self-service "delete my account" flow, distinct from an admin-initiated user deletion.

## Key elements

- **`removeOwnAccount(user, context)`** — Core delete. Calls `userService.remove(user, true)` (hard delete), then—only on success—records an audit event, emits an analytics event, and sends a goodbye email. Reads `email`, `locale`, `_id`, and the greetable name **before** the write, because the document no longer exists after the delete resolves. Determines `actorRole` via `isUnrestrictedCaller` from the membership store (not the document, whose membership may already be cascaded away).
- **`confirmAccountDeletion(token, context)`** — HTTP handler for `DELETE /account/delete-confirm`. Redeems the `ACCOUNT_DELETE_TOKEN_TYPE` token via `redeemLiveToken`; on success delegates to `removeOwnAccount` and returns `generateSuccess(…, 200, t('account.delete.success'))`. On a missing/expired/used token, calls `refuseLink` to produce a 422.

## Relationships

| Neighbor | Interaction |
|---|---|
| `modules/users/index.ts` | Consumes `userService.remove` and the `UserDocument` type. |
| `modules/account/emails.ts` | Builds the goodbye email via `deleteConfirmEmail`, resolves the name with `greetableName`, and picks the locale with `recipientLocale`. |
| `modules/account/services/mail.ts` | Delivers the goodbye mail through `sendAccountMail` at `'normal'` priority. |
| `modules/account/services/tokens.ts` | Redeems the one-time token (`redeemLiveToken`) and produces the 422 on failure (`refuseLink`). |
| `modules/account/token-types.ts` | Supplies the `ACCOUNT_DELETE_TOKEN_TYPE` constant. |
| `modules/account/roles.ts` | Queries `isUnrestrictedCaller` to stamp the correct `actorRole` in audit. |
| `modules/account/analytics.ts` | Provides the `ACCOUNT_DELETED` event name. |
| `modules/account/audit.ts` | Provides the `AUTH_ACCOUNT_DELETE_COMPLETED` action name. |
| `infrastructure/observability/audit.ts` | Calls `recordAudit` for the audit log entry. |
| `infrastructure/observability/analytics/index.ts` | Calls `emitAnalyticsEvent` + `buildAnalyticsBase`. |
| `infrastructure/http/response.ts` | Uses `generateSuccess` and the `ResponseSuccess`/`ResponseReject` types for the HTTP shape. |
| `infrastructure/i18n/index.ts` | Calls `t('account.delete.success')` for the response message. |
| `modules/account/services/index.ts` | Re-exports the two functions so other services/routes can import them from the barrel. |

## Notes

- **Events are emitted here, not inside `userService.remove`.** `remove` is also the final step of the admin `DELETE /users/:id` path, which reports its own `ADMIN_USER_ERASED` / `ADMIN_USER_SOFT_DELETED` events with the *admin's* actor identity. Emitting inside `remove` would double-count and misattribute the actor. The comment in the source calls this out explicitly.
- **Read-before-write is mandatory.** The goodbye email needs `email`, `locale`, and a display name. All are captured from the `UserDocument` *before* `remove` runs, because a hard delete leaves nothing to read. The role is similarly read from the membership store before the cascade can revoke it.
- **Locale fallback order:** the recipient's stored `locale` is primary; the request context locale is only a fallback (same rationale as in `completePasswordReset`).
- **Mail priority is `'normal'`.** This is a farewell, not a time-sensitive link or code, so it is deliberately not elevated.
