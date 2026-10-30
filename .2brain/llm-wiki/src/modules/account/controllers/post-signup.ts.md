---
source: src/modules/account/controllers/post-signup.ts
sha256: 8fd729a8a05868cbc0a645d9440bbf76c4d756f2e54d9e2607231aad3c00745f
generated_at: 2026-10-29T02:32:39.962667+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-signup.ts

## Purpose

HTTP controller for `POST /account/signup`. It is a thin adapter that destructures the JSON body, delegates all business logic to `accountService.signup`, then maps the result onto one of three HTTP responses: a validation failure (422), an antibot-rung-2 refusal (201, body-identical to success), or a genuine registration (201 + session cookies). No images or file uploads are handled here.

## Key elements

- **`postSignup(request, response)`** — The sole export. Reads `request.body` (typed `SignupRequest | undefined`), defaults every field to `''`/`false` so a missing body yields the same 422 as empty fields, calls `accountService.signup`, then branches on the result.
- **`SIGNUP_LOCATION`** — Constant `'/account'`. Used as the `Location` header on every 201 so the header never reveals a user id.
- **Antibot (rung-2) branch** — Detected via `data.isNew` (Mongoose document still unsaved). Logs via `logAntibotRefusal`, increments `authSignupTotal{status='refused'}`, and returns a 201 whose body is byte-identical to a real signup (no `Set-Cookie` is the only differentiator).
- **Success path** — Increments `authSignupTotal{status='success'}`, fires `accountService.sendVerificationEmail` as fire-and-forget (errors logged, never re-thrown), then calls `issueSession` to set session cookies before responding 201.
- **`proof`** — Built inline as `{ amr: [AMR.password], provedAt: Date.now() }` and passed to `issueSession`; establishes that the new account's authentication proof is its password.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/services/index.ts` | Calls `accountService.signup` and `accountService.sendVerificationEmail`. |
| `src/modules/account/session/session.ts` | Calls `issueSession(request, response, data.id, proof)` on success. |
| `src/modules/account/metrics.ts` | Increments `authSignupTotal` with `status` label (`success` / `failure` / `refused`). |
| `src/modules/account/domain/session-proof.ts` | Imports `AMR.password` for the session proof object. |
| `src/modules/users/index.ts` | Calls `userService.toAccount(data, null)` to shape the response body (role is always `null`). |
| `src/infrastructure/http/response.ts` | Uses `rejectResponse` (422) and `createdResponse<Account>` (201). |
| `src/infrastructure/http/errors.ts` | Calls `rejectDatabaseError` in the `.catch` handler. |
| `src/infrastructure/http/request.ts` | Calls `callerContextOf(request)` to derive client context passed to the service. |
| `src/infrastructure/http/middlewares/antibot-log.ts` | Calls `logAntibotRefusal` in the rung-2 branch. |
| `src/infrastructure/adapters/logger.ts` | Logs the verification-email queuing failure. |
| `src/types/index.ts` | Consumes `Account` and `SignupRequest` type definitions. |
| `src/modules/account/routes.ts` | Imports `postSignup` and mounts it on the `POST /account/signup` route. |

## Notes

- **Indistinguishability by design.** The antibot-refusal 201 is intentionally byte-identical to a real signup 201 in the response body; the only leak is the absence of `Set-Cookie` headers. The `Location` header is the same constant for both. Rung 2 is off by default.
- **`request.body` is `| undefined`.** Express 5 leaves `body` unset when no parser matched the content-type, and multer calls `next()` untouched on non-multipart bodies. The controller destructures with a `?? {}` guard and defaults every field so the failure mode is a uniform 422, not a throw.
- **No access token in the response.** The session is cookie-only. The frontend obtains its access token via `POST /account/refresh` after receiving the 201, mirroring the OAuth-callback flow.
- **`data.isNew` is the antibot signal.** Mongoose leaves `isNew` true until `.save()` succeeds. A `true` value in the controller means rung 2 refused the address and no account was persisted.
- **Role is always `null`.** Self-service signup grants no role; `userService.toAccount(data, null)` is called with `null` in both the success and refusal branches.
