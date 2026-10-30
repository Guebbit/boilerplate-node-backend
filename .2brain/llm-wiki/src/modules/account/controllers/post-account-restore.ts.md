---
source: src/modules/account/controllers/post-account-restore.ts
sha256: 5ee8415ad04d8f864c7dda03a1e1bd5711fabe0662d79c9c21c8ab48f4cd2a0d
generated_at: 2026-10-29T02:29:21.646242+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-account-restore.ts

## Purpose

Controller for the public `POST /account/restore` endpoint. It validates a one-time restore token (delivered via email) and cancels the account's scheduled deletion. The token is the sole credential; the route performs no authentication or session creation.

## Key elements

- **`postAccountRestore`** *(exported function)* — Express route handler. Parses and validates the request body against the `RestoreAccountBody` Zod schema, calls `accountService.restoreAccountByLink`, and returns **204 No Content** on success. Routes any thrown error through `rejectDatabaseError`.

## Relationships

- **`src/modules/account/services/index.ts`** — Calls `accountService.restoreAccountByLink(token, callerContext)`; this is the sole business-logic interaction.
- **`src/infrastructure/http/controller.ts`** — Uses `parseBody` (Zod validation gate) and `refused` (uniform rejection/abort check).
- **`src/infrastructure/http/response.ts`** — Uses `noContentResponse` to emit the 204.
- **`src/infrastructure/http/errors.ts`** — Uses `rejectDatabaseError` as the shared error-serialization path for all write endpoints.
- **`src/infrastructure/http/request.ts`** — Uses `callerContextOf` to extract caller metadata (IP, etc.) for audit/service calls.
- **`src/types/index.ts`** — Imports the `AccountRestoreRequest` type to type the Express request body.
- **`src/modules/account/routes.ts`** — Registers `postAccountRestore` as the handler for `POST /account/restore`.

## Notes

- **No auth middleware.** The endpoint is intentionally public; the restore token in the body is the credential. There is no session or sign-in side-effect.
- **204, not 200.** Success produces a `noContentResponse` (HTTP 204, empty body) — clients should not expect a JSON payload.
- **Error path is shared.** All thrown errors funnel through `rejectDatabaseError` with the `'postAccountRestore'` operation tag, keeping error shape consistent with every other write endpoint.
- **Validation is fail-fast.** If `parseBody` fails, the handler returns immediately with no service call; the Zod schema (`RestoreAccountBody` from `@api/schemas.zod`) enforces the token shape.
