---
source: src/modules/account/controllers/delete-2fa-method.ts
sha256: b2b4e1a4876b115166068dae97aa6ca8edc5e6541b379f8e2e40bfb936fc2f73
generated_at: 2026-10-14T08:28:56.933830+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-2fa-method.ts

## Purpose

HTTP adapter for `DELETE /account/2fa/methods/{method}`. Validates a two-factor code, delegates to `twoFactorService.removeTwoFactorMethod`, and then remints the caller's session (which was revoked by the removal) so the user stays logged in. Requires both a fresh critical-auth session *and* a valid one-time code to prevent a hijacked session from stripping factors individually.

## Key elements

- **`delete2faMethod`** *(exported const, function)* — The sole export. Accepts Express `Request`/`Response`; the request's generic params expose `method: string` and the body is `TwoFactorCodeRequest`.
  - Validates path param via `RemoveTwoFactorMethodParams.safeParse` and body via `RemoveTwoFactorMethodBody.safeParse` (Zod schemas from `@api/schemas.zod`).
  - Calls `sessionSnapshotOf(request, id)` **before** the service call to capture the current session state.
  - Calls `twoFactorService.removeTwoFactorMethod(id, method, code, callerContextOf(request))`.
  - On success: increments `authTwoFactorDisableTotal{method, status='success'}`, then `remintSession` with `withProofs(amr, AMR.otp)` to restore the caller's session.
  - On refusal/failure: increments the same metric with `status='failure'` and returns a `refused` response.
  - Wraps the whole chain in `.catch(catchAs(response, 'delete2faMethod'))`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `infrastructure/http/controller.ts` | Source of `rejectValidation`, `refused`, `catchAs` — standard guard/error helpers. |
| `infrastructure/http/request.ts` | `callerContextOf(request)` extracts caller metadata passed to the service. |
| `infrastructure/http/response.ts` | `successResponse` formats the 200 reply. |
| `infrastructure/i18n/` | `t('account.two-factor.method-removed')` localises the success message. |
| `modules/account/services/index.ts` | `twoFactorService.removeTwoFactorMethod` performs the actual factor removal. |
| `modules/account/session/session.ts` | `sessionSnapshotOf` captures pre-deletion session; `remintSession` re-establishes it afterward. |
| `modules/account/domain/session-proof.ts` | `AMR.otp` enum value and `withProofs` helper used when reminting. |
| `modules/account/metrics.ts` | `authTwoFactorDisableTotal` Prometheus counter, tagged by `method` and `status`. |
| `modules/account/routes.ts` | Registers `delete2faMethod` on the `DELETE /account/2fa/methods/:method` route. |
| `types/index.ts` | `TwoFactorCodeRequest` — the expected body shape (contains the one-time code). |

## Notes

- **Snapshot-before-mutation is load-bearing.** Removing a factor revokes *all* sessions, including the one handling this request. `sessionSnapshotOf` is called first so `remintSession` can restore the caller; reversing the order would 401 the user.
- The metric name (`authTwoFactorDisableTotal`) is shared with the full-disable endpoint; distinguish by the `method` label.
- `request.authContext!` is asserted non-null upstream (by route-level auth middleware); this file does not guard against it being absent.
- The body schema (`RemoveTwoFactorMethodBody`) is expected to contain at least the verification `code`; the exact field names live in `@api/schemas.zod`.
