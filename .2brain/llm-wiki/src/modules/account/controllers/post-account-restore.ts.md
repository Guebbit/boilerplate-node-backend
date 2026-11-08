---
source: src/modules/account/controllers/post-account-restore.ts
sha256: 5ee8415ad04d8f864c7dda03a1e1bd5711fabe0662d79c9c21c8ab48f4cd2a0d
generated_at: 2026-11-08T04:04:22.122306+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-account-restore.ts

## Purpose

Handler for `POST /account/restore`. Validates a one-time restore token supplied in the request body and cancels the account's scheduled deletion. The endpoint is public — the token itself is the credential, and the operation does **not** create a session or sign anyone in.

## Key elements

- **`postAccountRestore(request, response)`** — The sole export. Parses the body against the `RestoreAccountBody` Zod schema, then calls `accountService.restoreAccountByLink(token, callerContext)`. On success sends `204 No Content`; on a service-level refusal delegates to `refused`; on thrown errors delegates to `rejectDatabaseError`.

## Relationships

- **`@modules/account/services/index.ts`** — Consumes `accountService.restoreAccountByLink`, the only business-logic call in the handler.
- **`@infrastructure/http/controller.ts`** — Provides `parseBody` (Zod validation + 422 on failure) and `refused` (short-circuits to a 4xx when the service signals a policy rejection).
- **`@infrastructure/http/errors.ts`** — `rejectDatabaseError` is the shared error formatter for all write-path controllers, ensuring consistent status codes and logging.
- **`@infrastructure/http/request.ts`** — `callerContextOf` extracts caller metadata (IP, user-agent, etc.) to pass into the service call.
- **`@infrastructure/http/response.ts`** — `noContentResponse` sends the `204` reply.
- **`@types/index.ts`** — Supplies the `AccountRestoreRequest` type that narrows `Request`'s body parameter.
- **`@modules/account/routes.ts`** — Registers this handler at the `POST /account/restore` path.

## Notes

- The endpoint requires **no authentication middleware**; the token in the body is the sole proof of authorization.
- Success is `204 No Content`, not `200` — clients should not expect a response body.
- The `refused` check is a *service-level* rejection (e.g., token already spent, deletion already executed) distinct from a validation failure caught by `parseBody`.
- Error handling is intentionally minimal: any thrown error is funneled through `rejectDatabaseError`, which is the project-wide convention for write-path controllers.
