---
source: src/modules/account/controllers/delete-2fa-method.ts
sha256: ac0f7b30d4f39ec03f53e3ffe02a61c05785d1f873f88231e1e6fa5c91417e3d
generated_at: 2026-09-23T17:58:39.767966+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-2fa-method.ts

## Purpose

Thin HTTP adapter for `DELETE /account/2fa/methods/{method}`. Validates the path parameter and request body (which must include a valid 2FA code), then delegates to `twoFactorService.removeTwoFactorMethod`. Enforces the same dual-credential requirement (fresh auth session + one-time code) as full 2FA disable to prevent a stolen session from peeling off factors one at a time.

## Key elements

- **`delete2faMethod(request, response)`** — Exported controller. Parses path params via `RemoveTwoFactorMethodParams` and body via `RemoveTwoFactorMethodBody` (both Zod schemas). On success calls `twoFactorService.removeTwoFactorMethod(id, method, code, callerContext)`, then responds 200 with an i18n message or maps the service result to an HTTP error.
- **Metrics** — Increments `authTwoFactorDisableTotal` (labeled by `method` and `status: 'success' | 'failure'`) on every outcome, including early body-validation failures.
- **Error handling** — Uses `rejectValidation` for schema failures, `rejectResponse` for service-level errors, and `rejectDatabaseError` as a catch-all for unexpected throws.

## Relationships

- **`src/modules/account/services/index.ts`** — Source of `twoFactorService`; this controller is its sole HTTP caller for `removeTwoFactorMethod`.
- **`src/modules/account/metrics.ts`** — Provides `authTwoFactorDisableTotal`, the Prometheus counter incremented here on every request outcome.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` / `rejectResponse` helpers used for all HTTP replies.
- **`src/infrastructure/http/controller.ts`** — Provides `rejectValidation` for Zod parse failures.
- **`src/infrastructure/http/errors.ts`** — Provides `rejectDatabaseError` as the async error catch-all.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)`, forwarded as the 4th argument to the service.
- **`src/infrastructure/i18n/index.ts`** — Provides the `t()` function used to render the success message (`account.two-factor.method-removed`).
- **`src/types/index.ts`** — Provides the `TwoFactorCodeRequest` type that shapes the expected request body.
- **`src/modules/account/routes.ts`** — Registers this handler on the `DELETE /account/2fa/methods/:method` route (upstream auth middleware populates `request.authContext` before it reaches this controller).

## Notes

- Uses a `.then()/.catch()` promise chain rather than `async/await`; the function signature is synchronous but returns a `Promise`.
- `request.authContext!` uses a non-null assertion — the route's auth middleware is expected to have already set it.
- The success response is **200** with a JSON body containing the i18n message, not a 204.
- On body validation failure the failure metric is still incremented before the early return, so the metric counts *all* attempts, not just service-level rejections.
