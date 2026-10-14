---
source: src/modules/account/controllers/post-signup.ts
sha256: 25f231bbd6b9e85558402b061a224658347f236c5135bab927569990c3d4b5ed
generated_at: 2026-10-14T08:37:36.691741+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-signup.ts

## Purpose

Thin HTTP adapter for `POST /account/signup`. Translates the JSON request into the `accountService.signup` call, then shapes the response (201 with a `User` body + `Location: /account`). Handles the anti-bot "rung 2" refusal path so that a policy-blocked address returns a byte-identical 201 to a genuine signup, and issues a cookie-only session on real success.

## Key elements

- **`postSignup`** – The sole export. Receives an Express `Request<unknown, unknown, SignupRequest | undefined>` and `Response`, destructures the body with empty-string/false defaults, delegates to `accountService.signup`, then branches on success / refusal / failure to emit the appropriate response.
- **`SIGNUP_LOCATION`** – Module-level constant (`'/account'`). Always the same value regardless of outcome, so the `Location` header leaks nothing about whether the address was actually created.

## Relationships

- **`accountService` / `sendVerificationEmail`** (`src/modules/account/services/index.ts`) – Primary business-logic calls. `signup` performs validation + creation; `sendVerificationEmail` is fired-and-forgotten after a real signup.
- **`issueSession`** (`src/modules/account/session/session.ts`) – Mints the session cookie (`amr: [AMR.password]`) on genuine success only; refused signups skip it, which is the sole observable difference.
- **`callerContextOf`** (`src/infrastructure/http/request.ts`) – Extracts IP/user-agent context, passed to both `signup` and `sendVerificationEmail`.
- **`rejectResponse` / `createdResponse`** (`src/infrastructure/http/response.ts`) – Standard 4xx / 201 emitters used across the branch logic.
- **`rejectDatabaseError`** (`src/infrastructure/http/errors.ts`) – Catch-all for unexpected DB failures in the `.catch` handler.
- **`authSignupTotal`** (`src/modules/account/metrics.ts`) – Prometheus counter incremented per outcome: `success`, `failure`, or `refused`.
- **`userService.toUser`** (`src/modules/users/index.ts`) – Maps the Mongoose document into the public `User` shape for the response body.
- **`SIGNUP_DEFAULT_ROLE`** (`src/modules/access/index.ts`) – Passed to `toUser` as the role; used for both real and refused signups to keep bodies identical.
- **`AMR`** (`src/modules/account/domain/session-proof.ts`) – Provides the `AMR.password` enum value for the session's auth-method list.
- **`logAntibotRefusal`** (`src/infrastructure/http/middlewares/antibot-log.ts`) – Structured log entry when rung 2 blocks an address, so the refusal is auditable server-side despite the identical HTTP response.

## Notes

- **Body destructuring with defaults, not validation.** The controller defaults missing fields to `''` / `false` and lets `accountService.signup` perform all real validation (repeat-match, terms). This guarantees every caller of the service gets the same 422.
- **`request.body` can be `undefined`.** Typed as `SignupRequest | undefined` because Express 5 skips the parser on unmatched content-type and multer calls `next()` untouched on non-multipart bodies. The `?? {}` guard handles this.
- **Rung 2 refusal is intentionally indistinguishable.** The refused path returns 201, the same `User` body (with `SIGNUP_DEFAULT_ROLE`), and the same `Location` header. The only differences are the absent `Set-Cookie` and the server-side `logAntibotRefusal` entry. `SIGNUP_DEFAULT_ROLE` is a constant, not a membership lookup, because no document was ever saved.
- **Session is cookie-only.** No token in the body; the frontend bootstraps its access token via `POST /account/refresh`, matching the OAuth-callback flow.
- **Verification email is non-blocking.** `void sendVerificationEmail(...)` fires without awaiting; the 201 does not depend on the queue. The `verified` flag is informational and does not gate any endpoint until `cart.self.checkout`.
- **`data.isNew` is the refusal signal.** A Mongoose document that was never `.save()`-ed keeps `isNew === true`; the controller uses this to detect rung 2 rather than a separate result flag.
