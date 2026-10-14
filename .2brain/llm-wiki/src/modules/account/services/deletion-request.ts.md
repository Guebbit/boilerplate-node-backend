---
source: src/modules/account/services/deletion-request.ts
sha256: d7089c55a40c683a4d0c5ae11b2645f974f6c0eb2fbfea35b88b62027e1f1a43
generated_at: 2026-10-14T08:46:48.203433+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/deletion-request.ts

## Purpose

Handles the *request* to delete an account: it issues a short-lived confirmation token, sends the user a deletion-confirmation email containing that token, and logs the event. It deliberately does **not** perform the deletion — that is `./self-delete`, which the recipient invokes by spending the token link.

## Key elements

- **`requestAccountDeletion(user, context): Promise<void>`** — The sole export. Orchestrates three side-effects in sequence:
  1. Issues a `ACCOUNT_DELETE_TOKEN_TYPE` token (1-hour TTL) via `issueToken`.
  2. Records an `AUTH_ACCOUNT_DELETE_REQUESTED` audit entry via `recordAudit`.
  3. Renders a fully-localised email with `deleteRequestEmail` and fires it through `sendAccountMail` (fire-and-forget, `void`).
- The token value is passed only into the email body and never returned to the caller.

## Relationships

| Neighbor | Interaction |
|---|---|
| `../emails` | Calls `deleteRequestEmail`, `greetableName`, `recipientLocale` to build the mail content. |
| `./mail` | Calls `sendAccountMail` to enqueue the rendered email. |
| `../token-types` | Passes `ACCOUNT_DELETE_TOKEN_TYPE` to `issueToken`. |
| `./tokens` | Calls `issueToken` to create the confirmation token. |
| `@modules/users` | Consumes the `UserDocument` type (user id, locale, email, name). |
| `@types` / `auth-context` | Consumes the `CallerContext` type (locale, audit metadata). |
| `@infrastructure/observability/audit` | Calls `recordAudit` for the audit log. |
| `../audit` | Reads the `accountAuditActions` enum for the action constant. |
| `./index` (services barrel) | Re-exports `requestAccountDeletion` for consumers of the services module. |

## Notes

- **Token is file-scoped by design.** Returning it would hand a live delete credential to an upper layer; the only consumer is the email body.
- **Wraps `issueToken` rather than emitting inside it.** `issueToken` is shared with `sendVerificationEmail`, which must stay audit-silent; the audit call is therefore lifted here.
- **Locale resolution:** `recipientLocale(user.locale, context)` uses the *user's* locale first and the request context's locale only as fallback. The email is fully rendered before queuing, so the send worker needs no locale.
- **Fire-and-forget send:** `void sendAccountMail(...)` means a delivery failure does not reject the caller's promise; the token is already issued and audited.
- **TTL:** 3 600 000 ms (1 hour) is the token lifetime, hard-coded at the call site.
