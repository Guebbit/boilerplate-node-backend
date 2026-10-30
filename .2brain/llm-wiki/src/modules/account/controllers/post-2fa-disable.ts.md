---
source: src/modules/account/controllers/post-2fa-disable.ts
sha256: 53561dc45902d47635d38acbdbe744f232e9f6be46f60b4ee2dd0c9a9e4d2144
generated_at: 2026-10-29T02:28:31.145345+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-2fa-disable.ts

## Purpose

HTTP handler for `POST /account/2fa/disable`. Validates the request body (code or backup code), delegates to `twoFactorService.disableTwoFactor`, and remints the caller's session — because disabling all factors revokes every session, including the one carrying this request.

## Key elements

- **`post2faDisable(request, response)`** — the sole export. Parses the body against `DisableTwoFactorBody` (Zod), calls the service, then re-establishes the session via `remintSession` with an `AMR.otp` proof before returning the new `AuthTokens`.
- **`sessionSnapshotOf` → `remintSession`** — snapshot is captured *before* the disable call so the remint has a baseline to work from once the original session is gone.
- **`authTwoFactorDisableTotal`** — incremented with `{ method: 'all', status: 'success' | 'failure' }` on every outcome (parse failure, service refusal, or success).
- **`withProofs(amr, AMR.otp)`** — merges the existing AMR claims with an `otp` proof so the reminted session retains a valid auth-method record.

## Relationships

- **`src/modules/account/services/index.ts`** — consumes `twoFactorService.disableTwoFactor(id, code, callerContext)`.
- **`src/modules/account/session/session.ts`** — calls `sessionSnapshotOf` (pre-op) and `remintSession` (post-op) to survive the session wipe.
- **`src/modules/account/domain/session-proof.ts`** — imports `AMR` and `withProofs` to augment the session's proof claims.
- **`src/modules/account/metrics.ts`** — imports `authTwoFactorDisableTotal` counter.
- **`src/infrastructure/http/controller.ts`** — uses `parseBody`, `refused`, `catchAs` for validation, error mapping, and error handling.
- **`src/infrastructure/http/request.ts`** — uses `callerContextOf` to extract IP/UA context for the service call.
- **`src/infrastructure/http/response.ts`** — uses `successResponse` for the final 200 reply.
- **`src/modules/account/routes.ts`** — registers this handler and applies the route guard that enforces fresh critical auth before the handler runs.
- **`src/types/index.ts`** — supplies the `AuthTokens` and `TwoFactorCodeRequest` types used in the handler signature.

## Notes

- The route guard (in `routes.ts`) handles *fresh critical auth*; this handler additionally requires a valid code or backup code in the body — two independent proofs to prevent a stolen-but-fresh session from disabling 2FA.
- The `request.authContext!` non-null assertion is safe only because the route guard populates it; do not reuse this handler without that guard.
- `method: 'all'` in the metric label is a fixed string, not derived from the request — likely a placeholder for future per-method breakdowns.
