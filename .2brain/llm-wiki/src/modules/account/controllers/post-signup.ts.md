---
source: src/modules/account/controllers/post-signup.ts
generated_at: 2026-11-22T03:27:27.022901+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-signup.ts

## Purpose
Express controller for `POST /account/signup`. It is a thin HTTP adapter over `accountService.signup`. It accepts JSON only, with no image upload, because an unregistered caller writes nothing to the store. On success it also signs the new user in by issuing session cookies.

## Key elements
- `postSignup(request, response)`: the exported handler.
  - It passes `request.body ?? {}` unparsed to `accountService.signup(body, callerContextOf(request))`. Validation, including the unknown-field and repeat-password/terms rules, lives in the service. A missing body therefore gets the same 422 as empty fields.
  - It builds a session proof `{ amr: [AMR.password], provedAt: Date.now() }` for the first session.
- `SIGNUP_LOCATION = '/account'`: the location value sent with every 201. It is the same for everyone, because the caller's account is `/account` and never an id.

Outcome branches:
- **Service failure:** increments `authSignupTotal{status:'failure'}` and calls `rejectResponse(response, result.status, result.errors)`.
- **`data.isNew` is true** (rung 2 email policy refused the address, so nothing was saved):
  - It calls `logAntibotRefusal('email-policy', ...)` and increments `authSignupTotal{status:'refused'}`.
  - It answers a normal-looking 201 with `accountUserService.toAccount(data, null)`, and sends no verification email.
- **Real signup:**
  - It increments `authSignupTotal{status:'success'}`.
  - It fires `accountService.sendVerificationEmail` without awaiting it. A failure is only logged through `logger.error`.
  - It calls `issueSession(request, response, data.id, proof)` and then sends a 201 with the `Account` body.
- **Rejection or exception:** the final `.catch` increments the failure counter and calls `rejectDatabaseError(response, 'signup', error)`.

## Relationships
- `../services` (`accountService`): performs the signup and queues the verification email.
- `../session/session` (`issueSession`) and `../domain/session-proof` (`AMR`): create the first session cookies and record the password proof.
- `src/modules/users/friends/account.ts` (`accountUserService.toAccount`): maps the user document to the `Account` response. The role is passed as `null`.
- `@infrastructure/http/response` (`rejectResponse`, `createdResponse`) and `@infrastructure/http/errors` (`rejectDatabaseError`): shape the HTTP responses.
- `@infrastructure/http/request` (`callerContextOf`): extracts the caller context for the service calls.
- `@infrastructure/http/middlewares/antibot-log` (`logAntibotRefusal`): logs a refused address.
- `../metrics` (`authSignupTotal`) and `@infrastructure/adapters/logger`: metrics and error logging.
- `@types`: supplies the `Account` and `SignupRequest` types.
- `../routes`: the route file that mounts this handler.

## Notes
- **Indistinguishable refusal:** a refused address returns the same 201 body and `Location` as a real signup. The only difference is that no `Set-Cookie` is sent. The comments acknowledge that the 409 for an address already in use already leaks existence, and that rung 2 is off by default.
- **Cookies only:** the body stays `Account`. The frontend's `POST /account/refresh` bootstrap mints the access token, as it does after the OAuth callback.
- **Session role:** the user is signed in as `unverified`. Verification is informational and does not block the account.
- **Express 5 body:** `request.body` can be unset when no parser matched the content-type, hence the `| undefined` type and the `?? {}` fallback.
- **`isNew` check:** `Document#isNew` stays true until `.save()`. That is how the handler tells a refused signup from a real one.
