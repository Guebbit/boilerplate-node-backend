---
source: src/modules/account/controllers/delete-2fa-method.ts
sha256: 9292b53843d3fe6a2723460da363cd20f3805230eca2626d11c518b043bb812d
generated_at: 2026-09-27T14:22:18.552586+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-2fa-method.ts

## Purpose

Thin HTTP controller for `DELETE /account/2fa/methods/{method}`. Validates the path parameter and request body, delegates to `twoFactorService.removeTwoFactorMethod`, records a metric, and formats the response. It exists to keep route registration (in `routes.ts`) separate from the HTTP-protocol concerns of this single endpoint.

## Key elements

- **`delete2faMethod`** (exported) — The controller function. Parses `method` from the URL and `code` from the body via Zod schemas (`RemoveTwoFactorMethodParams`, `RemoveTwoFactorMethodBody`), then calls `twoFactorService.removeTwoFactorMethod(id, method, code, callerContext)`.
- **Input validation** — Path params and body are each `safeParse`-d; failures short-circuit with `rejectValidation`.
- **Metric recording** — `authTwoFactorDisableTotal.inc({ method, status })` is incremented on every outcome (validation failure, service refusal, or success).
- **Response handling** — Success returns a 200 with i18n message `account.two-factor.method-removed`; refusals and unexpected errors are handled by `refused` / `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `rejectValidation`, `refused`, and `catchAs` for consistent error/status handling.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, which extracts IP/user-agent context passed into the service call.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for the 200 response shape.
- **`src/infrastructure/i18n/index.ts`** — Provides the `t()` translation function used for the success message.
- **`src/infrastructure/i18n/context.ts`** — Backs the i18n context (locale) that `t()` resolves against.
- **`src/modules/account/metrics.ts`** — Source of `authTwoFactorDisableTotal`, the Prometheus counter incremented here.
- **`src/modules/account/services/index.ts`** — Exports `twoFactorService`, whose `removeTwoFactorMethod` performs the actual factor removal.
- **`src/types/index.ts`** — Defines `TwoFactorCodeRequest` (the typed `req.body` shape).
- **`src/modules/account/routes.ts`** — Registers this controller on the `DELETE /account/2fa/methods/:method` route.

## Notes

- The metric `authTwoFactorDisableTotal` is **shared** with the full 2FA-disable endpoint; the `method` label is the only differentiator. Validation failures also increment it, using the `method` extracted from path params (which succeeded by that point).
- `request.authContext!` uses a non-null assertion — the auth middleware is expected to have populated it before this controller runs.
- The `method` value comes from the **path parameter**, not the body; the body only carries the verification `code`.
