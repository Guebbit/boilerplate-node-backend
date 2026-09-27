---
source: src/modules/account/controllers/post-2fa-confirm.ts
sha256: ef0e003cdfc43d0e812b929cec9a2e62ac65496a87e408f3bc7fa7972affe1d5
generated_at: 2026-09-27T14:23:58.169611+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-2fa-confirm.ts

## Purpose

Thin HTTP adapter for `POST /account/2fa/methods/{method}/confirm`. Validates the path parameter (`method`) and body (`code`) via Zod, delegates to `twoFactorService.confirmTwoFactorMethod`, records a Prometheus metric, and returns a `TwoFactorConfirmed` payload (which includes backup codes when this was the account's first factor).

## Key elements

- **`post2faConfirm`** (exported handler) — Express handler accepting typed `Request`/`Response`. Reads `id` from `request.authContext`, validates params and body, calls the service, and maps the result to an HTTP response.
- **Zod validation** — `ConfirmTwoFactorMethodParams` (path) and `ConfirmTwoFactorMethodBody` (body) from `@api/schemas.zod`; failures short-circuit via `rejectValidation`.
- **Metric increment** — `authTwoFactorEnrollTotal` is incremented with `{ method, status: 'success' | 'failure' }` on every terminal path (validation failure, service refusal, or success).
- **Response helpers** — `successResponse` (200), `refused` (service-level rejection → 4xx), and `catchAs` (unexpected error → 500 with logging tag `'post2faConfirm'`).
- **i18n message** — Success body carries the translation key `account.two-factor.method-added` via `t()`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/services/index.ts` | Consumes `twoFactorService.confirmTwoFactorMethod(id, method, code, callerCtx)`. |
| `src/modules/account/metrics.ts` | Increments `authTwoFactorEnrollTotal` on success and failure. |
| `src/modules/account/routes.ts` | Registers this handler on the `/account/2fa/methods/:method/confirm` route. |
| `src/infrastructure/http/controller.ts` | Imports `rejectValidation`, `refused`, `catchAs`. |
| `src/infrastructure/http/request.ts` | Imports `callerContextOf` to pass request context into the service. |
| `src/infrastructure/http/response.ts` | Imports `successResponse` for the 200 reply. |
| `src/infrastructure/i18n/index.ts` (re-exports `context.ts`) | Imports `t` for the localized success message. |
| `src/types/index.ts` | Imports `TwoFactorConfirmed` and `TwoFactorConfirmRequest` types. |

## Notes

- `request.authContext!` uses a non-null assertion; the route is expected to be behind an auth middleware that always populates it. A missing auth context will throw at runtime rather than produce a 401 here.
- The success status code is **200**, not 201, even though this "adds" a method.
- The `method` value used in the metric label is taken from the **validated path param**, not re-read from the body, ensuring a single source of truth.
- Validation failures on the *body* still record a `failure` metric (using the already-validated path param), but a path-param validation failure does **not** (it returns before the metric line).
