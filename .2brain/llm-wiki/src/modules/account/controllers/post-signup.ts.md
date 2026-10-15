---
source: src/modules/account/controllers/post-signup.ts
sha256: d3e90cb210be6a76b8ad1850d34e2e1013459a6d87184c72f1bd7c0c231cf778
generated_at: 2026-10-15T09:56:16.593312+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-signup.ts

## Purpose

Thin HTTP adapter for `POST /account/signup`. It extracts the request body, delegates to `accountService.signup`, then shapes the HTTP response (201 or 4xx) and — on genuine success — issues a session cookie and fires the verification email. It exists to keep the Express routing layer free of business logic and to make the "refused by antibot policy" path byte-identical in the response body to a real signup.

## Key elements

- **`postSignup`** (exported) — The single controller handler. Destructures `request.body` with defaults, calls `accountService.signup`, branches on `data.isNew` to distinguish antibot refusal from a created account, then either responds with a forged 201 or issues a real session via `issueSession` and sends the verification email (fire-and-forget).
- **`SIGNUP_LOCATION`** (module-private const) — Always `'/account'`; set as the `Location` header on every 201 so the refused path and the real path share the same header.

## Relationships

- **`src/modules/account/services/index.ts`** — Calls `accountService.signup` for the core logic and `sendVerificationEmail` (fire-and-forget) after a successful creation.
- **`src/modules/account/session/session.ts`** — Calls `issueSession` to set the session cookie on genuine success; the refused path skips this, so the *only* observable difference is the missing `Set-Cookie`.
- **`src/modules/account/domain/session-proof.ts`** — Imports `AMR` to stamp the initial session proof as `{ amr: [AMR.password], provedAt: … }`.
- **`src/modules/account/metrics.ts`** — Increments `authSignupTotal` on every terminal path (`success`, `failure`, `refused`).
- **`src/infrastructure/http/response.ts`** — Uses `createdResponse` for 201s and `rejectResponse` for 4xx errors.
- **`src/infrastructure/http/errors.ts`** — Uses `rejectDatabaseError` in the `.catch` to map unexpected DB failures to a safe 500.
- **`src/infrastructure/http/request.ts`** — Calls `callerContextOf(request)` to pass IP/user-agent context into the service and the email sender.
- **`src/infrastructure/http/middlewares/antibot-log.ts`** — Calls `logAntibotRefusal` on the rung-2 branch so the refusal is auditable.
- **`src/modules/users/index.ts`** — Calls `userService.toUser(data, role)` to shape the response body into the public `User` type.
- **`src/modules/access/index.ts`** — Imports `SIGNUP_DEFAULT_ROLE`; used directly (no membership lookup) because self-service signup can only ever grant that one role by construction.

## Notes

- **`request.body` is typed `| undefined`.** Express 5 leaves `body` unset when no parser matched the content-type; multer also passes through non-multipart bodies untouched. The controller guards with `?? {}` and defaults every field, so an absent body produces the same 422 as an empty body rather than a thrown error.
- **Antibot "rung 2" indistinguishability.** When `data.isNew` is still `true` after `signup`, the address was refused by email policy but *no row was written*. The controller still returns a 201 with a valid `User` body, the same `Location` header, and the same `SIGNUP_DEFAULT_ROLE` — deliberately omitting the session cookie and the verification email. The body is byte-identical; only the missing `Set-Cookie` and the suppressed email differ. This is intentional: rung 2 is off by default, and the 409 for a taken address already leaks existence.
- **No session before verification.** The issued session marks the user as `unverified`; the role model permits browsing and blocks only `cart.self.checkout`, so requiring a second login before the user reaches that state would add friction without security gain.
- **`termsAccepted` defaults to `false`.** A request with no body "accepted nothing," matching the semantics of an explicit empty submission.
