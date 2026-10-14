---
source: src/modules/account/controllers/post-2fa-setup.ts
sha256: 0c07c2e264de1997539da73305a0ca5a31abdc8b18cae9d1daefde0a29e9022d
generated_at: 2026-10-14T08:33:28.830785+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-2fa-setup.ts

## Purpose

HTTP controller for `POST /account/2fa/methods/{method}/setup`. It validates incoming params and an optional body, then delegates to `twoFactorService.setupTwoFactorMethod` to start (or restart) enrollment of a single 2FA method. Exists as a thin adapter between the Express route and the service layer.

## Key elements

- **`post2faSetup(request, response)`** — the sole export. Reads `id` from `request.authContext`, validates `request.params` against `SetupTwoFactorMethodParams` and `request.body` (optional) against `SetupTwoFactorMethodBody` via Zod `safeParse`, then calls `twoFactorService.setupTwoFactorMethod`. On success sends a `TwoFactorSetup` payload; on failure sends the service's status/errors; on unexpected throw falls through to `catchAs`.

## Relationships

- **`src/modules/account/routes.ts`** — registers `post2faSetup` on the `POST /account/2fa/methods/:method/setup` route and applies the "fresh critical auth" guard before this controller runs.
- **`src/modules/account/services/index.ts`** — provides `twoFactorService`, whose `setupTwoFactorMethod` method performs the actual enrollment logic.
- **`src/infrastructure/http/controller.ts`** — supplies `rejectValidation` and `catchAs` used for validation-failure and error-handling responses.
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf`, extracted from the request and forwarded to the service.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` and `rejectResponse` for writing the JSON reply.
- **`src/types/index.ts`** — exports the `TwoFactorSetup` type used to type the success response body.

## Notes

- The request body is **optional**: the account's *first* 2FA factor sends none, so `request.body ?? {}` is passed to the Zod schema.
- Security contract (documented in the JSDoc): once *any* factor is already armed, a valid code from one of them is required to add or restart another. This blocks an attacker with a stolen session from disarming an existing factor.
- `request.authContext!` uses a non-null assertion — the route guard is expected to have populated it; if it hasn't, this will throw at runtime rather than fail gracefully.
- The handler returns the promise chain (`.then/.catch`) rather than using `async/await`; callers (Express 4) rely on the returned promise being handled, not on response-send timing.
