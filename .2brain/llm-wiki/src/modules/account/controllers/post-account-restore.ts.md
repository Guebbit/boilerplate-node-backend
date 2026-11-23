---
source: src/modules/account/controllers/post-account-restore.ts
source_sha256: 5ee8415ad04d8f864c7dda03a1e1bd5711fabe0662d79c9c21c8ab48f4cd2a0d
context_sha256: 8154b383e73dbe0c85897843b8fb786d0eb11a6f23f40ccf7327f11a3d109be4
generated_at: 2026-11-22T03:24:01.582294+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-account-restore.ts

## Purpose
Express controller for `POST /account/restore`. It consumes the one-time restore token from a mailed link and cancels the account's scheduled deletion. The route is public because the token is the credential. It does not sign the user in.

## Key elements
- `postAccountRestore(request, response)`: the exported handler, which does the following:
  1. Validates `request.body` with `parseBody(RestoreAccountBody, ...)`. If validation fails, it returns early, since `parseBody` has already handled the response.
  2. Calls `accountService.restoreAccountByLink(body.token, callerContextOf(request))`.
  3. If `refused(response, result)` is true, it stops. Otherwise it sends `noContentResponse(response)`.
  4. On a rejected promise, it calls `rejectDatabaseError(response, 'postAccountRestore', error)`.

## Relationships
- `src/infrastructure/http/controller.ts`: supplies `parseBody` (body validation) and `refused` (turns a refused service result into a response).
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `noContentResponse` sends the success response.
- `src/infrastructure/http/errors.ts`: `rejectDatabaseError` handles thrown or rejected errors. A comment says it is the same interpreter every other write path uses.
- `src/modules/account/services/index.ts`: exports `accountService`, whose `restoreAccountByLink` method this handler calls to perform the restore.
- `src/types/index.ts`: provides the `AccountRestoreRequest` type for the request body.
- `src/modules/account/routes.ts`: the route file that wires this handler to the endpoint. This file does not itself register the route.
- `src/infrastructure/adapters/logger.ts`: no direct use is visible in this file.

## Notes
- `RestoreAccountBody` is imported from `@api/schemas.zod`.
- A successful restore returns an empty (no content) response.
- Business refusals come back as a service `result` handled by `refused`. Only thrown or rejected errors go through `rejectDatabaseError`.
