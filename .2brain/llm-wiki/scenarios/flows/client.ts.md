---
source: scenarios/flows/client.ts
source_sha256: 0abe9a6fb8bf5f42af1c96fc05c2d3f72cf90a0b8a676516a04ff90ec0b202e5
context_sha256: 9d2478f1a8f586d9556acdd37981ac1a44efa74719f1adb1fd85168dbce445d9
generated_at: 2026-11-22T01:43:13.809507+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/flows/client.ts

## Purpose
The HTTP caller that the scenario flow runner uses to drive the app. It holds one base URL and one bearer token, and it reads each response's status and body so flows don't repeat that code. It uses the runtime's `fetch` rather than supertest because it runs during a container boot (`db:bootstrap` → `scenario:apply`), where devDependencies may be missing.

## Key elements
- `signIn(baseUrl, email, password, totpSecret?)` is the main export. It logs in through the real `POST /account/login` with `transport: 'bearer'` and returns a `Caller`. It throws `ScenarioFlowError` unless login answers 200 with a token. It accepts either `token` (jwt mode) or `sessionToken` (cookie mode).
- `Caller` is the interface for a signed-in actor:
  - `email` names the actor in error messages.
  - `call<T>(method, path, body?)` throws unless the response is 2xx. `T` is an unchecked claim about the body.
  - `attempt(method, path, body?)` returns the outcome whatever it was, for refusals the flows expect.
- `Attempt` is the response shape: `status`, `data`, `errorCode` (the first `errors[].code`) and `errorMessages` (all `errors[].message` values). `data` is set only for a successful JSON body. It is `undefined` for a 204, a refusal or a non-JSON body.
- `ScenarioFlowError` is the runner's only error type, and it isn't exported. Its message includes who made the request, the method, the path, the status, the error code and the error messages (or the body if there are none).
- `send` is the only place `fetch` is called.
- `readAttempt` parses a response into an `Attempt`.
- `answerChallenge` handles the MFA second step. If the login response has `mfaRequired: true` and a `totpSecret` was supplied, it generates a code with `otplib` and posts it to `POST /account/login/2fa`.

## Relationships
The file's imports are only `node:crypto` and `otplib`; it imports none of the graph neighbors. The listed neighbors (`scenarios/flows/actions.ts`, `scenarios/flows/shop-history.ts`, `scenarios/shop-modules.ts`, `scenarios/locales.ts`, `scripts/docs/generate-role-matrix.ts`) are related through the dependency graph, but nothing in this file shows how they use it.

## Notes
- Every non-GET request gets a fresh `idempotency-key` (a random UUID). Routes that must not be retried, such as refund, ship and stock, refuse a write without one. Routes that take no key ignore it.
- For a `FormData` body, `send` drops the `content-type` header so fetch can set the multipart boundary. Any other body is sent as JSON.
- Logging in through the real endpoint, not a hand-signed token, makes the session fresh. Checkout and the payment routes require this through `requireFreshAuth('critical')`.
- Without a `totpSecret`, an MFA challenge is not answered. The login then fails because the response has no token.
- Only the 2xx check in `call` is verified. The generic `T` is not validated.
