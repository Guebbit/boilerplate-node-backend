---
source: src/modules/account/controllers/post-signup.ts
sha256: 8fd729a8a05868cbc0a645d9440bbf76c4d756f2e54d9e2607231aad3c00745f
generated_at: 2026-11-08T04:07:52.204971+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-signup.ts

## Purpose

Thin Express controller for `POST /account/signup`. Destructures the JSON body with safe defaults, delegates to `accountService.signup`, then formats the 201/4xx response and (on success) issues a session cookie. It contains no business logic itself — validation, persistence, and policy decisions live in the service.

## Key elements

- **`SIGNUP_LOCATION`** — constant `'/account'`. Used as the `Location` header on every 201 (real or antibot-refused) so the header never reveals a user id.
- **`postSignup(request, response)`** — the sole export. Handles:
  - Body destructuring with empty-string defaults (absent body → same 422 as empty fields, not a throw).
  - Calls `accountService.signup(input, callerContext)`.
  - On success where `data.isNew` is still `true` (antibot "rung 2" refusal): logs the refusal, returns a byte-identical 201 + `Location: /account`, but skips `issueSession` and the verification email.
  - On genuine success: fires the verification email fire-and-forget, issues a cookie-only session via `issueSession`, then returns `201 Created` with an `Account` body (role is always `null`).
  - On failure / DB error: increments the failure metric and delegates to `rejectResponse` or `rejectDatabaseError`.

## Relationships

- **`src/modules/account/services/index.ts`** — calls `accountService.signup` and `accountService.sendVerificationEmail`.
- **`src/modules/account/session/session.ts`** — calls `issueSession` to set the auth cookie on successful signup.
- **`src/modules/account/domain/session-proof.ts`** — imports `AMR.password` to build the proof object passed to `issueSession`.
- **`src/modules/account/metrics.ts`** — increments `authSignupTotal` on every outcome (`success`, `failure`, `refused`).
- **`src/infrastructure/http/response.ts`** — uses `createdResponse` and `rejectResponse` for all outgoing replies.
- **`src/infrastructure/http/errors.ts`** — uses `rejectDatabaseError` in the `.catch` path.
- **`src/infrastructure/http/request.ts`** — uses `callerContextOf(request)` to pass caller metadata to the service.
- **`src/infrastructure/adapters/logger.ts`** — logs an error if the verification email fails to queue.
- **`src/infrastructure/http/middlewares/antibot-log.ts`** — calls `logAntibotRefusal` when rung 2 rejects the address.
- **`src/modules/users/index.ts`** / **`src/modules/users/services/index.ts`** — calls `userService.toAccount(data, null)` to shape the response body.
- **`src/types/index.ts`** — imports the `Account` and `SignupRequest` types.
- **`src/modules/account/routes.ts`** — expected consumer that wires `postSignup` to the `POST /account/signup` route.

## Notes

- **Antibot indistinguishability:** When rung 2 refuses an address, the response is deliberately identical to a real signup (same 201, same `Location`, same JSON body). The *only* observable difference is the absence of `Set-Cookie`. This is the design intent; do not "fix" it by adding a distinguishing header.
- **`data.isNew` check:** Mongoose leaves `isNew === true` on an unsaved document. The controller relies on this to detect the antibot refusal path — it is *not* a general "was the account persisted?" flag.
- **Express 5 / body-parser quirk:** `request.body` is typed `SignupRequest | undefined` because Express 5 may leave it unset when no parser matches the content-type. The `?? {}` guard handles this.
- **Verification email is fire-and-forget:** a `.catch` only logs; the 201 is returned regardless. Do not make this await the queue.
- **No role in response:** self-service signup grants no role, so `userService.toAccount(data, null)` always passes `null` for the role argument. This is intentional and matches the antibot-refusal shape.
