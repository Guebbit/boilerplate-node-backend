---
source: src/modules/account/controllers/put-account.ts
sha256: 5215596f8b3d2c7e55f75f0d398f0175d3b01f99a36448c08766c0cee6308aae
generated_at: 2026-09-23T18:04:37.742065+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/put-account.ts

## Purpose

HTTP controller for `PUT /account`. It lets an authenticated user edit their **own** profile (email, username, locale, image, phone, website, analytics consent) by delegating to `accountService.updateProfile` and handling the uploaded-image cleanup that accompanies a self-service edit. It exists so that a regular user can update their profile without needing the `users.*` permission that the `/users` write routes require.

## Key elements

- **`putAccount`** (exported function) — the sole route handler. Reads the authenticated user's id from `request.authContext`, extracts upload metadata via `readUploadedImage`, destructures scalar fields straight off `request.body`, calls `accountService.updateProfile`, then either sends a `successResponse` (with the user reshaped by `userService.toUser`) or a `rejectResponse`. On failure or database error it also fires `deleteUpload()` to clean up any half-stored image.

## Relationships

| Neighbor                                    | Interaction                                                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/account/services/index.ts`     | Calls `accountService.updateProfile` with the user id, payload, and caller context.                                               |
| `src/modules/users/index.ts` / `service.ts` | Calls `userService.toUser(data, tenant)` to shape the success response into a `User`.                                             |
| `src/infrastructure/http/response.ts`       | Uses `successResponse` and `rejectResponse` for all HTTP replies.                                                                 |
| `src/infrastructure/http/errors.ts`         | Uses `rejectDatabaseError` in the `.catch` branch.                                                                                |
| `src/infrastructure/http/uploads.ts`        | Uses `readUploadedImage` to pull `imageUrl`, `thumbnailUrl`, `pendingImageKey`, and the `deleteUpload` callback from the request. |
| `src/infrastructure/http/request.ts`        | Uses `callerContextOf` to derive the locale/accept-language context passed to the service.                                        |
| `src/infrastructure/i18n/index.ts`          | Uses `t()` for the success message key `account.update.success`.                                                                  |
| `src/types/index.ts`                        | Imports `UpdateAccountRequest`, `UpdateAccountRequestMultipart`, and `User` types.                                                |
| `src/modules/account/routes.ts`             | Wires this handler to the `PUT /account` route (caller side).                                                                     |

## Notes

- **Body is explicitly `| undefined`.** Express 5 leaves `request.body` unset when no body parser matched the request (e.g., an empty PUT). The controller guards with `request.body ?? {}`.
- **No `= ''` default on `imageUrl`.** `updateProfile` treats an _absent_ `imageUrl` as "not sent" and preserves the stored value; an empty string would _clear_ it. Deliberate divergence from the create-path controllers.
- **Fields are read from `request.body` directly, not through a generated validation schema.** `updateProfile` performs its own validation with translated messages; letting a Zod/JSON-Schema layer answer first would surface English error strings.
- **Cleanup on error is fire-and-forget.** `deleteUpload()` is called in both the `!result.success` branch and the `.catch` branch; its own rejection is swallowed (`.catch(() => undefined)`) so it cannot become an unhandled promise rejection after the HTTP response has already been sent.
- **Role is read from the existing `authContext`, not re-fetched.** A profile edit never changes the caller's role, so no second lookup is made (consistent with `get-account.ts`).
