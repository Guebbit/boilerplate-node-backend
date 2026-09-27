---
source: src/modules/account/controllers/post-signup.ts
sha256: 8b05c30bf6259d7c0c58d21708ebb72cdbbef4988e43b8630e382778dfa41bc5
generated_at: 2026-09-27T14:26:28.660236+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-signup.ts

## Purpose
Thin HTTP adapter for `POST /account/signup`. It extracts and defaults the request body, reads any uploaded image metadata, delegates validation and registration to `accountService.signup`, then handles the three distinct outcome paths (genuine 201, rung-2 antibot refusal that must be byte-identical to a real 201, and failure) including uploaded-image cleanup, session issuance, and metrics on every path.

## Key elements
- **`postSignup`** — The sole export; the Express route handler. Destructures body fields with deliberate defaults (`''` for strings, `false` for `termsAccepted`, `undefined` for `analyticsConsent`), calls `readUploadedImage`, passes the assembled input to `accountService.signup`, and branches on `result.success` / `data.isNew` to determine whether a real account was created, a rung-2 refusal fabricated, or a hard failure occurred.

## Relationships
- **`src/modules/account/services/index.ts`** — Calls `accountService.signup` (core registration logic) and `sendVerificationEmail` (fire-and-forget email queue).
- **`src/infrastructure/http/response.ts`** — Emits all HTTP responses via `successResponse` (201) and `rejectResponse` (4xx).
- **`src/infrastructure/http/uploads.ts`** — `readUploadedImage` extracts `imageUrl`, `thumbnailUrl`, `pendingImageKey`, and the `deleteUpload` cleanup callback from the raw request.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` supplies locale/geo context to `signup` and `sendVerificationEmail`.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseError` formats unexpected thrown errors into a safe 500.
- **`src/modules/account/session/session.ts`** — `issueSession` sets the session cookie on a successful (non-rung-2) signup.
- **`src/modules/access/index.ts`** — `SIGNUP_DEFAULT_ROLE` is stamped onto the response `User` object rather than read from a persisted membership.
- **`src/modules/users/index.ts`** — `userService.toUser` serialises the Mongoose document into the API `User` shape.
- **`src/modules/account/metrics.ts`** — `authSignupTotal` Prometheus counter incremented with `status: 'success' | 'failure' | 'refused'`.
- **`src/infrastructure/http/middlewares/antibot-log.ts`** — `logAntibotRefusal` records the rung-2 refusal for audit.
- **`src/types/index.ts`** — `SignupRequest`, `SignupRequestMultipart`, and `User` type the request body and response payload.

## Notes
- **Rung-2 indistinguishability**: When `data.isNew` is true (Mongoose doc never `.save()`-d), the handler fabricates a 201 that is byte-identical in body to a real signup. The only differentiator is the absence of `Set-Cookie` headers (no `issueSession` call). `SIGNUP_DEFAULT_ROLE` is hardcoded rather than looked up because no membership row exists.
- **No controller-level schema validation is intentional**: `accountService.signup` validates via `zodUserSchema` with translated error messages. Parsing here first would let Zod's English messages leak (asserted by `tests/integration/locale.test.ts`).
- **`imageUrl` is coalesced to `undefined`, not `''`**: `ImageUrl` has `minLength: 1`, so an empty string would fail; `undefined` is the `.optional()` "absent" signal.
- **Uploaded-image cleanup runs on every non-success path** and is always `.catch(() => undefined)`-wrapped to avoid unhandled rejections after the response has already been sent.
- **Session is cookies-only**; the access token is minted later by the frontend's `GET /account/refresh`, keeping the signup response body identical to the OAuth callback shape.
