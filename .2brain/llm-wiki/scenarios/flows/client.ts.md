---
source: scenarios/flows/client.ts
sha256: c99a40cc5e8d868345cef7f0e59b4061b9f8726aeb1925214d5bb5982a2de28a
generated_at: 2026-10-29T01:22:51.823659+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/client.ts

## Purpose

A minimal HTTP client that scenario flows use to drive the running application over HTTP during container bootstrap (`scenario:apply`). It wraps `fetch` (not `supertest`, which may be absent when `devDependencies` are not installed), handles TOTP two-factor login, and presents two call styles — `call` (throws on non-2xx) and `attempt` (returns the raw outcome) — so flows can assert both success and expected refusals.

## Key elements

- **`Attempt`** (exported interface) — Normalised response shape: `status`, `data` (success body or `undefined`), `errorCode`, and `errorMessages` extracted from the API's problem-details `errors[]` array.
- **`Caller`** (exported interface) — A signed-in actor. Exposes `call` (throws `ScenarioFlowError` on non-2xx, returns typed `data`) and `attempt` (always resolves, returns the full `Attempt`).
- **`signIn`** (exported function) — Signs in via `POST /account/login` (then `POST /account/login/2fa` when the account requires TOTP), extracts the bearer token, and returns a `Caller`.
- **`ScenarioFlowError`** (internal class) — Error whose message names the actor, method, path, status, `errorCode`, and either the error messages or the raw body, so a failure deep into a multi-hundred-request seed is diagnosable without a stack trace.
- **`send`** (internal) — The single `fetch` call site. Serialises JSON bodies, strips the `content-type` header for `FormData` (multipart uploads), and delegates response parsing to `readAttempt`.
- **`readAttempt`** (internal) — Parses a `Response` into an `Attempt`; handles non-JSON bodies (204, plain text) by yielding `data: undefined`.
- **`answerChallenge`** (internal) — If the login response signals `mfaRequired`, generates a TOTP code from the account's base32 secret via `otplib.generate` and posts it to `/account/login/2fa`.
- **`Method`** (type) — `'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'`.
- **`Problem`** (internal interface) — The subset of RFC 7807 problem-details members this file reads (`errors[].code`, `errors[].message`).

## Relationships

- **`scenarios/flows/actions.ts`**, **`scenarios/flows/shop-history.ts`**, **`scenarios/shop-modules.ts`** — Import `signIn` and the `Caller`/`Attempt` types to perform their respective HTTP sequences against the running app.
- **`scenarios/locales.ts`** — Consumed by the same flow layer; the flows it supports also drive the app through this client.
- **`scripts/docs/generate-role-matrix.ts`** — Documents or derives the actor/role matrix that these flows exercise; shares the actor-identity convention (`email`) this client embeds in error messages.
- **`src/modules/cart/tests/integration/checkout-rate-limit.test.ts`** — Exercises the same bearer-token auth path that `signIn` produces; its assertions mirror the `Attempt` error-code/message convention defined here.

## Notes

- Deliberately uses the runtime `fetch` rather than `supertest` so it works in bootstrap contexts where `devDependencies` are absent.
- Login is always through the real `POST /account/login` endpoint (never a hand-signed JWT) so the resulting session satisfies `requireFreshAuth('critical')` on checkout and payment routes.
- The login response may carry the token under `token` (jwt mode) or `sessionToken` (cookie mode with `transport: bearer`); `signIn` checks both.
- `data` on `Attempt` is `undefined` for three distinct cases: a 204 no-content, a non-JSON body, and any non-ok status. Consumers must check `status` before treating `data` as meaningful.
- `PATCH` exists in the `Method` union specifically for the products module's update shape, even though no flow in this file issues a PATCH directly.
