---
source: src/globals.d.ts
source_sha256: c742316ec6e0fbf577b011fffef9ef5035a2e7f989ca4482f28c7c95ff09190e
context_sha256: 5930e651b267ee0d5265d47eff0c614c518302dcedb34a3b70bb5e2f402b4a56
generated_at: 2026-11-22T02:33:28.078145+00:00
model: claude-code:claude-sonnet-5-5
---

# src/globals.d.ts

## Purpose
Ambient type augmentation for Express. It extends the `Request` interface in `express-serve-static-core` with the optional fields that middleware attaches (auth context, request id, locale, upload URLs, and so on). Every handler sees these fields without importing anything at the call site.

## Key elements
The file declares a single module augmentation, `declare module 'express-serve-static-core'`, which adds these optional `Request` fields:

- **Auth and caller**
  - `authContext?: AuthContext`: transport-safe auth DTO, set after the auth middleware runs.
  - `caller?: Caller`: the same caller as an authorization decision sees them, in tenant scope. It is resolved once by the auth guard and set and absent together with `authContext`. Platform-scope questions are never put on the request.
  - `credentialId?: string`: the api-key id, set only on the `sk_...` credential path of `getAuth`. It is mutually exclusive with `authContext`. It feeds `CallerContext.actorCredentialId` for audit and is the key `apiKeyLimiter` uses for rate limiting.
  - `sessionVia?: 'bearer' | 'cookie'`: which credential carried the human session. It is absent for anonymous requests, API-key requests, and SSE streams resolved by `requirePermissionViaCookie`.
  - `sessionIdle?: boolean`: set by `getAuth` when the refused credential was a staff session that idled out.
  - `refusalLogged?: boolean`: set by `noteMiss` so the following 401 is not logged twice.
  - `sessionRecheck?: () => Promise<Resolution<AuthContext | undefined>>`: set by `requirePermissionViaCookie` for SSE streams. It re-answers who the session is for as long as its family lives.
- **Request correlation**
  - `requestId?: string`
  - `clientRequestId?: string`: the caller's own well-formed `x-request-id`, kept for correlation only and never used as the request id.
- **Uploads**
  - `storedImageUrls?` and `storedThumbnailUrls?`: set only when there is no broker, so `quarantineUploadedImages` runs the pipeline inline.
  - `quarantinedImageKeys?`: set only when a broker is configured. The worker digests the images later, keyed by these.
  - `uploadClaimed?: boolean`: set by `claimUpload` when a write takes ownership of the upload.
- **Body and i18n**
  - `rawBody?: Buffer`: the exact request bytes, kept for routes whose callers sign the body. It is set by the JSON parser's `verify` hook in `src/app/security.ts` for the listed paths only.
  - `locale?: string`: negotiated from `Accept-Language` by the locale middleware.
  - `t?: TFunction`: i18next `t` bound to `request.locale`.

## Relationships
- Imports the types `AuthContext`, `Caller`, and `Resolution` from `src/types/auth-context.ts`. These types back `authContext`, `caller`, and `sessionRecheck`.
- Imports `TFunction` from `i18next`, used for `t`.
- The field comments refer to the code that sets or reads them: `getAuth`, the auth guard, `requirePermissionViaCookie`, `noteMiss`, `apiKeyLimiter`, `quarantineUploadedImages`, `claimUpload`, `readUploadedImage`, and the locale middleware. None of these are imported here.

## Notes
- The file is a declaration-only type file. It has no runtime effect and only describes what other modules attach.
- All fields are optional, so handlers must handle their absence.
- Several fields are mutually exclusive or conditional:
  - `credentialId` is absent whenever `authContext` is set.
  - The inline upload fields (`storedImageUrls`, `storedThumbnailUrls`) and `quarantinedImageKeys` depend on whether a broker is configured.
- Read uploaded images through `readUploadedImage` rather than touching the upload fields directly. That keeps controllers from telling a local path from a CDN URL.
- An upload still unclaimed when the response closes with a 4xx or 5xx is deleted by the upload middleware's close hook.
- Do not rebuild signed bodies with `JSON.stringify(request.body)`, because the signature covers the original bytes. Use `rawBody` instead.
