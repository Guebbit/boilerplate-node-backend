# src/modules/account/controllers/post-signup.ts

## Purpose

Thin HTTP adapter for `POST /account/signup`. It extracts form fields and the uploaded-image payload from the Express request, delegates to `accountService.signup`, and owns the cross-cutting concerns that must run on **both** the success and failure paths: uploaded-image cleanup, metrics increment, and the fire-and-forget verification email.

## Key elements

- **`postSignup(request, response)`** — the sole export. Destructures `email`, `username`, `password`, `passwordConfirm` from `request.body`, calls `readUploadedImage` for the image trio (`imageUrl`, `thumbnailUrl`, `pendingImageKey`, `deleteUpload`), then chains `accountService.signup`:
  - **Success path:** increments `authSignupTotal` with `status: 'success'`, fires `sendVerificationEmail` via `void` (non-blocking), and returns `201` with the created document.
  - **Failure path (`!result.success`):** calls `deleteUpload()`, increments the metric as `'failure'`, and sends `rejectResponse`.
  - **Catch path (DB errors):** increments the metric as `'failure'`, sends `rejectDatabaseError`, then calls `deleteUpload()`.

## Relationships

- **`src/modules/account/services/index.ts`** — imports `accountService` (the business logic) and `sendVerificationEmail` (triggered after a successful signup).
- **`src/modules/account/routes.ts`** — the route definition that wires this controller to the `/signup` path.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` and `rejectResponse` used to shape the HTTP reply.
- **`src/infrastructure/http/errors.ts`** — provides `rejectDatabaseError` for the `catch` path.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf`, passed into both `signup` and `sendVerificationEmail`.
- **`src/infrastructure/adapters/image-store.ts`** — provides `readUploadedImage` to extract image URLs and the `deleteUpload` cleanup closure from the request.
- **`src/types/index.ts`** — supplies the `SignupRequest` / `SignupRequestMultipart` body types for the Express `Request` generic.
- **`src/modules/account/metrics.ts`** — supplies the `authSignupTotal` Prometheus counter.

## Notes

- **No Zod validation at this layer.** The body is read raw; `accountService.signup` validates via `zodUserSchema`, whose error messages are locale-translated. Validating here with the generated schema would preempt the translated messages (asserted by `tests/integration/locale.test.ts`).
- **`imageUrl` defaults to `''`.** `zodUserSchema` expects a string, so a missing image becomes an empty string rather than `undefined`/`null`.
- **Verification email is fire-and-forget.** `void sendVerificationEmail(...)` means the `201` is returned immediately; the account is usable regardless of whether the email is queued.
- **`deleteUpload()` is called on every non-success path** (business-logic failure *and* thrown/caught DB error). It is **not** called on success — the uploaded file is retained.
- The `201` body is the in-memory Mongoose document; the schema's `toJSON` transform strips the hashed password before it reaches the response.
