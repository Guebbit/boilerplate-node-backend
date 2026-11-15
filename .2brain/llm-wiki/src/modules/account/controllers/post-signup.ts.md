---
source: src/modules/account/controllers/post-signup.ts
sha256: afac0b50a3b56a9e619298caec2634473b1c4d82e3cd96779dcd70291ada9a41
generated_at: 2026-11-14T18:34:36.666574+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-signup.ts

## Purpose

Thin HTTP adapter that handles `POST /account/signup`. It forwards the raw request body to `accountService.signup`, then branches on the result to emit either a rejection, a disguised antibot refusal, or a real 201 with a session cookie and a fire-and-forget verification email. The controller intentionally performs no field-level validation itself; all parsing and business rules live in the service.

## Key elements

- **`postSignup`** (exported) — The sole controller handler. Accepts `Request<unknown, unknown, SignupRequest | undefined>` and a `Response`. Returns `Promise<void>`.
- **`SIGNUP_LOCATION`** (module-private const) — Fixed string `'/account'`, passed as the third argument to `createdResponse` on every 201 path. Deliberately identical for real and refused signups so the value cannot leak whether an account was created.
- **`proof`** (local) — Session-proof object `{ amr: [AMR.password], provedAt: Date.now() }` passed to `issueSession`.

## Relationships

- **`src/modules/account/services/index.ts`** — Imports `accountService` and calls its `signup` method with the raw body and caller context; on a successful result, calls `sendVerificationEmail` (fire-and-forget). All validation and persistence logic lives in this module.
- **`src/infrastructure/http/response.ts`** — Uses `rejectResponse` for failure paths and `createdResponse<Account>` for 201 responses.
- **`src/infrastructure/http/errors.ts`** — Imports `rejectDatabaseError` as the catch-all for unexpected exceptions in the promise chain.
- **`src/infrastructure/http/request.ts`** — Imports `callerContextOf` to extract request metadata passed into the service and the email sender.
- **`src/infrastructure/adapters/logger.ts`** — Imports `logger` to record a structured error if the verification-email queue call rejects.
- **`src/infrastructure/http/middlewares/antibot-log.ts`** — Imports `logAntibotRefusal` to record rung-2 (email-policy) refusals for operational auditing.
- **`src/modules/account/session/session.ts`** — Imports `issueSession` to set the session cookie on a successful signup.
- **`src/modules/account/domain/session-proof.ts`** — Imports `AMR` (specifically the `password` member) to stamp the authentication method into the session proof.
- **`src/modules/account/metrics.ts`** — Imports `authSignupTotal` Prometheus counter, incremented with `status: 'success' | 'failure' | 'refused'`.
- **`src/modules/users/friends/account.ts`** — Imports `accountUserService` and calls its `toAccount` method to map the Mongoose document to the wire `Account` shape (role is always `null` for a fresh signup).
- **`src/types/index.ts`** — Provides the `Account` and `SignupRequest` type imports used in the handler signature and response generics.
- **`src/modules/account/routes.ts`** — Expected consumer that binds `postSignup` to the `POST /account/signup` route (referenced as a graph neighbor; no import is present in this file).

## Notes

- **Body is typed `unknown` on purpose.** The controller passes it through as `request.body ?? {}` without parsing. The service validates against its own schema and enforces cross-field rules (password match, terms acceptance). Do not add schema validation here.
- **`request.body` can be `undefined`.** Express 5 leaves it unset when no parser matches the `Content-Type`; multer also calls `next()` untouched on non-multipart bodies. The `?? {}` guard converts this into a normal 422 rather than a throw.
- **Antibot (rung-2) refusal is intentionally indistinguishable.** The 201 body, status code, and the `SIGNUP_LOCATION` value are byte-identical to a real signup. The only observable difference is the absence of a `Set-Cookie` header. The verification email is also skipped. Do not "fix" this asymmetry without re-evaluating the security intent.
- **Verification email is fire-and-forget.** A rejection is logged but does not affect the 201 response or the session. The 201 never waits on the email queue.
- **No access token in the body.** `issueSession` sets cookies only; the frontend mints its own access token via `POST /account/refresh`. This keeps the refused-signup body shape identical to the real one.
- **`Document#isNew` is the refusal signal.** When the service returns an unsaved Mongoose document, the controller treats it as an antibot refusal. This relies on the service contract, not on a separate flag.
