---
source: src/modules/account/controllers/post-2fa-confirm.ts
sha256: b4a86eaa82639d21493dc748fd1b3073ffba7eb8816feb39959aef5d9dac00df
generated_at: 2026-09-23T18:01:25.290210+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-2fa-confirm.ts

## Purpose

Thin HTTP adapter for `POST /account/2fa/methods/{method}/confirm`. Validates path and body parameters, delegates to `twoFactorService.confirmTwoFactorMethod`, and translates the service result into a standard HTTP response. Exists to keep Express routing concerns (parsing, status codes, i18n) separate from domain logic.

## Key elements

- **`post2faConfirm(request, response)`** — The sole export. An Express handler that:
  - Reads `id` from `request.authContext` (set upstream by auth middleware).
  - Safely parses `request.params` with `ConfirmTwoFactorMethodParams` and `request.body` with `ConfirmTwoFactorMethodBody` (both from `@api/schemas.zod`).
  - Calls `twoFactorService.confirmTwoFactorMethod(id, method, code, callerContext)`.
  - On success: increments `authTwoFactorEnrollTotal` (`status: 'success'`) and returns `200` with a `TwoFactorConfirmed` payload and an i18n message.
  - On service-level failure: increments the metric (`status: 'failure'`) and calls `rejectResponse` with the service's status and errors.
  - On validation failure: increments the metric (body only) and calls `rejectValidation`.
  - On uncaught exception: routes to `rejectDatabaseError`.

## Relationships

- **`src/modules/account/services/index.ts`** — Source of `twoFactorService.confirmTwoFactorMethod`, the domain operation this controller wraps.
- **`src/modules/account/routes.ts`** — Registers `post2faConfirm` on the route (implied by the module doc-comment naming the endpoint).
- **`src/modules/account/metrics.ts`** — Exports `authTwoFactorEnrollTotal`; incremented on both success and failure paths.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` and `rejectResponse` helpers for consistent response shaping.
- **`src/infrastructure/http/controller.ts`** — Provides `rejectValidation` for 4xx validation failures.
- **`src/infrastructure/http/errors.ts`** — Provides `rejectDatabaseError` for the catch-all handler.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)` to build the caller context passed into the service.
- **`src/infrastructure/i18n/index.ts`** / **`src/infrastructure/i18n/context.ts`** — Provide the `t()` translation function used for the success message.
- **`src/types/index.ts`** — Defines `TwoFactorConfirmed` and `TwoFactorConfirmRequest` types used in the handler signature.

## Notes

- `request.authContext!` uses a non-null assertion; the controller **assumes** an auth middleware has already populated it. No defensive check is present.
- The `method` value (e.g. `"totp"`, `"email"`) is extracted from the **path parameter**, not the body — the body only carries the verification `code`.
- Metrics are incremented on body-validation failure, but **not** on path-parameter validation failure (the method string may not yet be trusted at that point).
- Success returns HTTP **200**, not 201, despite being a state-changing confirm action.
- The i18n key for success is `'account.two-factor.method-added'`; the response also includes `backupCodes` when this is the account's first factor (per the service contract, not enforced here).
