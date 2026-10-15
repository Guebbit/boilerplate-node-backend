---
source: src/modules/account/controllers/post-2fa-confirm.ts
sha256: a24a6d584205b9694713dd453f3a733ac303827a9c95dd2fc9794327c6109099
generated_at: 2026-10-15T09:54:21.298808+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-2fa-confirm.ts

## Purpose

Thin HTTP controller for `POST /account/2fa/methods/{method}/confirm`. It validates the path and body parameters, delegates to `twoFactorService.confirmTwoFactorMethod`, remints the caller's session (since confirming a factor revokes all existing sessions), and returns the service result (including backup codes for a first factor) along with the fresh session credentials.

## Key elements

- **`post2faConfirm`** (exported) — Express handler. Parses path params (`method`) and body (`code`) via Zod, calls the two-factor service, increments the `authTwoFactorEnrollTotal` metric on both success and failure, and on success remints a session with `AMR.otp` appended before sending a `200` response.

## Relationships

- **`../services` (`twoFactorService`)** — the sole domain operation invoked (`confirmTwoFactorMethod`).
- **`../session/session`** — `sessionSnapshotOf` captures the current session *before* the service call (because the call revokes it); `remintSession` issues a new session with the updated proof list.
- **`../domain/session-proof`** — `AMR.otp` and `withProofs` build the new authentication-method list for the reminted session.
- **`../metrics`** — `authTwoFactorEnrollTotal` is incremented with `{ method, status }` on every terminal outcome.
- **`@infrastructure/http/controller`** — `rejectValidation`, `refused`, and `catchAs` handle the three error/response paths.
- **`@infrastructure/http/request`** — `callerContextOf` extracts IP/user-agent for the service call.
- **`@infrastructure/http/response`** — `successResponse` formats the final JSON body.
- **`@infrastructure/i18n`** — `t` localises the success message string.
- **`@types`** — `TwoFactorConfirmed` and `TwoFactorConfirmRequest` shape the response and request types.

## Notes

- The session snapshot is taken **before** calling the service because `confirmTwoFactorMethod` revokes all sessions, including the one this request is authenticated with. Forgetting to snapshot first would leave the caller logged out.
- The response body merges `result.data` (e.g. backup codes) with the newly issued session token via `{ ...result.data, ...issued }`.
- `request.authContext!` uses a non-null assertion — the route is expected to be gated by an auth middleware; if it is reached without one, the handler will throw.
- The metric is incremented on the *body*-validation failure path (using `pathParameters.data.method`) as well as on service-level refusal and success, so the "failure" label covers both schema and business-logic rejections.
