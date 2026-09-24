---
source: src/modules/account/controllers/delete-account-confirm.ts
sha256: a4c4d0b448ffa2170171fc47296a4363c5369094f77abfb1312dd874509d33d6
generated_at: 2026-09-23T17:59:04.576611+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-account-confirm.ts

## Purpose

Controller for the `DELETE /account/delete-confirm` endpoint. It validates and spends a one-time account-deletion token, then hard-deletes the account. After a successful delete it clears session cookies and returns a localized success message.

## Key elements

- **`ACCOUNT_DELETE_TOKEN_TYPE`** – Module-level constant (`'delete'`) identifying the token type used in lookup.
- **`deleteAccountConfirm`** (exported) – The request handler. Performs a three-step token gate (`findLiveToken` → `spendLiveToken` → `removeOwnAccount`), then destroys the refresh and "logged" cookies and sends a `200` success response. All token-refusal paths return an identical `422` with the `account.delete.token-not-found` i18n string, regardless of whether the token is missing or already spent.
- **`refuseToken`** (inner helper) – Centralises the uniform 422 rejection so no response shape leaks *why* the token was rejected.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@infrastructure/http/controller` | `parseBody` validates the request body against the `ConfirmAccountDeleteBody` Zod schema before any logic runs. |
| `@infrastructure/http/response` | `successResponse` / `rejectResponse` shape every HTTP reply from this handler. |
| `@infrastructure/http/errors` | `rejectDatabaseError` is the sole `.catch` handler, mapping known DB failures to specific statuses instead of a blanket 500. |
| `@infrastructure/http/request` | `callerContextOf(request)` extracts caller metadata forwarded to `accountService.removeOwnAccount`. |
| `@infrastructure/i18n` | `t()` supplies every user-facing string (success, token-not-found). |
| `@modules/account/services` | `accountService` provides `findLiveToken`, `spendLiveToken`, and `removeOwnAccount`. |
| `@modules/account/session/cookies` | `destroyRefreshCookie` / `destroyLoggedCookie` clear the client's session on successful deletion. |
| `@modules/account/routes` | Registers this handler on the `DELETE /account/delete-confirm` route. |
| `@types` | `AccountDeleteConfirmRequest` types the Express request body parameter. |
| `@modules/account/tests/unit/delete-account.test.ts` | Unit-tests the controller's token flow and error paths. |

## Notes

- **Two-step token spend is intentional.** `findLiveToken` checks existence; `spendLiveToken` is the atomic "mark-as-used" step that guards against concurrent double-deletes. Both must succeed before the account is removed.
- **Uniform refusal is a security choice.** Whether the token doesn't exist or was already consumed, the response is byte-identical (`422` + `token-not-found`). See the cross-reference to `services/tokens.ts` in the inline comment.
- **Goodbye email is sent by the service, not the controller.** `removeOwnAccount` is the last layer that can read the email address before the document is destroyed; the controller does no mail logic.
- **No explicit `next()` call.** The handler always resolves (or rejects into the `.catch`) on its own; it never delegates to Express' `next`.
