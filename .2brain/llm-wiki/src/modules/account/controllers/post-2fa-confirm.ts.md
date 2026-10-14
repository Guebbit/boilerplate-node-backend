---
source: src/modules/account/controllers/post-2fa-confirm.ts
sha256: aa1450d832f044d10b4a45e10b1ca0465ad186da383dbb0af0444bcab26b48b6
generated_at: 2026-10-14T08:33:01.695801+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-2fa-confirm.ts

## Purpose

Thin HTTP adapter for `POST /account/2fa/methods/{method}/confirm`. Validates the incoming code and method, delegates to `twoFactorService.confirmTwoFactorMethod`, then re-establishes the caller's session (which the confirm operation revokes) and returns the confirmation payload.

## Key elements

- **`post2faConfirm`** (exported) — Express controller handler. Parses path params and body via Zod schemas, calls the domain service, remints the session on success, and emits a `successResponse` with an i18n message. On any validation or service failure it returns a structured error and records a failure metric.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides `rejectValidation`, `refused`, and `catchAs` helpers used for error paths.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf` to extract IP/user-agent context passed into the service call.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` for the 200 reply.
- **`src/infrastructure/i18n/index.ts`** — provides `t()` for the human-readable success message.
- **`src/modules/account/services/index.ts`** — exports `twoFactorService`, whose `confirmTwoFactorMethod` is the core domain operation.
- **`src/modules/account/session/session.ts`** — provides `sessionSnapshotOf` (captures the current session before it is revoked) and `remintSession` (re-creates the session with updated AMR proofs after confirm).
- **`src/modules/account/domain/session-proof.ts`** — provides `AMR.otp` and `withProofs` to stamp the new proof onto the reminted session.
- **`src/modules/account/metrics.ts`** — exports `authTwoFactorEnrollTotal` counter, incremented on both success and failure.
- **`src/types/index.ts`** — supplies `TwoFactorConfirmRequest` (validated body type) and `TwoFactorConfirmed` (response data type).

## Notes

- The session is **snapshotted before** the service call because `confirmTwoFactorMethod` revokes every session for the account, including the one this request is riding on. `remintSession` then reconstructs it using the captured snapshot plus the new `AMR.otp` proof.
- `request.authContext!` uses a non-null assertion; the route is expected to sit behind auth middleware that populates `authContext`.
- The `method` metric label is taken from the **path parameter** (not the body), and is only available after path-param parsing succeeds — the body-failure metric therefore uses the already-parsed `pathParameters.data.method`.
- The controller is intentionally "thin": all business logic (code verification, backup-code generation, session invalidation) lives in `twoFactorService`.
