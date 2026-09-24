---
source: src/modules/account/controllers/post-reset-request.ts
sha256: 5a6951fd31dbfab491b3860ea6f814ec8c8035deefb0f868b89c15ce62452fa8
generated_at: 2026-09-23T18:03:49.667025+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-reset-request.ts

## Purpose
HTTP controller for `POST /account/reset-request`. It is a thin adapter that validates the request body, delegates to `accountService.requestPasswordReset`, and returns the same 200 response regardless of whether the email belongs to a real account — the sole purpose being to prevent user enumeration.

## Key elements

- **`postResetRequest`** (exported) — The only export. Express controller function that:
  - Validates `request.body` against the `RequestPasswordResetBody` Zod schema via `parseBody`.
  - Extracts caller identity through `callerContextOf(request)`.
  - Calls `accountService.requestPasswordReset(email, context)`, catching any rejection and coercing to `false` (fail-closed).
  - Increments the `authPasswordResetTotal` Prometheus counter (`success` / `failure`).
  - Emits an audit record unconditionally via `recordAudit`.
  - Responds with `successResponse(200)` and the i18n string `account.reset.email-sent`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/controller.ts` | Supplies `parseBody` for schema-validated body extraction. |
| `src/infrastructure/http/request.ts` | Supplies `callerContextOf` to build the audit/context object. |
| `src/infrastructure/http/response.ts` | Supplies `successResponse` helper for the 200 reply. |
| `src/infrastructure/i18n/index.ts` | Supplies `t()` for the localized success message. |
| `src/infrastructure/i18n/context.ts` | Part of the i18n resolution chain used by `t`. |
| `src/infrastructure/observability/audit.ts` | Supplies `recordAudit` to emit the audit event. |
| `src/modules/account/audit.ts` | Supplies `accountAuditActions.AUTH_PASSWORD_RESET_REQUESTED` enum value. |
| `src/modules/account/metrics.ts` | Supplies `authPasswordResetTotal` counter. |
| `src/modules/account/services/index.ts` | Supplies `accountService.requestPasswordReset` — the sole business-logic call. |
| `src/modules/account/routes.ts` | Registers `postResetRequest` on the `POST /account/reset-request` route. |
| `src/types/index.ts` | Provides the `PasswordResetRequest` body type used in the Express handler signature. |

## Notes

- **Audit is unconditional by design.** It fires in the `.then` block *after* the `.catch(() => false)`, so it records even when the email does not match an account. Moving it into the service would let a missing-account path skip the record and leak existence.
- **Fail-closed catch.** Any exception from `requestPasswordReset` (DB down, mail provider error, etc.) is swallowed and treated as `sent = false`. The client still receives the identical 200 + "email-sent" message.
- **Actor is always `anonymous`.** This is a pre-authentication endpoint; no session or token is expected.
- **Token isolation.** The password-reset token is minted and published entirely inside the service. This file only ever sees a boolean (`sent`), so a token leak through the controller layer is impossible.
- **No status-code variation.** Both success and failure produce HTTP 200 with the same body. Do not "improve" this to return 404/422 for invalid emails.
