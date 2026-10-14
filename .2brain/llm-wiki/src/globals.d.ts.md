---
source: src/globals.d.ts
sha256: eb66f062eb8ff734031ef5bba2fc61f2956160e08b4f9f11b144bd26a1e48109
generated_at: 2026-10-14T07:40:11.878641+00:00
model: ollama:qwen3.8:27b
---

# src/globals.d.ts

## Purpose

Ambient module augmentation of Express's `Request` interface (via `express-serve-static-core`) so that every route handler sees the fields attached by middleware—auth context, request IDs, locale, uploaded-image metadata—without needing an explicit import at each call site.

## Key elements

- **`authContext?: AuthContext`** – Transport-safe auth DTO, set after the auth middleware runs.
- **`caller?: Caller`** – TENANT-scoped caller identity resolved once by the auth guard; set alongside `authContext`.
- **`credentialId?: string`** – API-key id for the CREDENTIAL auth path; mutually exclusive with `authContext`. Used by `apiKeyLimiter` for budgeting.
- **`sessionVia?: 'bearer' | 'cookie'`** – Which credential carried the human session; absent for anonymous, API-key, and SSE-cookie requests.
- **`requestId?: string`** / **`clientRequestId?: string`** – Server-generated id and the caller's `x-request-id` (for correlation only).
- **`storedImageUrls?: string[]`** / **`storedThumbnailUrls?: string[]`** – Inline-pipeline upload results (no broker). Read via `readUploadedImage`.
- **`quarantinedImageKeys?: string[]`** – Broker-pipeline upload keys for async digest. Read via `readUploadedImage`.
- **`uploadClaimed?: boolean`** – Set by `claimUpload`; unclaimed uploads are deleted on 4xx/5xx close.
- **`rawBody?: Buffer`** – Exact request bytes for signature verification; set by the `verify` hook in `app/security.ts` for specific paths.
- **`locale?: string`** / **`t?: TFunction`** – Negotiated locale and the bound translate function from i18next.

## Relationships

- **`src/types/auth-context.ts`** – Source of the `AuthContext` and `Caller` types used by the `authContext` and `caller` fields. This file is purely a type-level dependency (no runtime import).
- **`i18next`** – Provides the `TFunction` type for the `t` field.

## Notes

- `authContext` and `credentialId` are **mutually exclusive**—they correspond to two different `getAuth` branches (session vs. `sk_...` API key). Code should not expect both to be present.
- `storedImageUrls` vs. `quarantinedImageKeys` are also mutually exclusive (inline pipeline vs. broker pipeline); both are accessed through `readUploadedImage` to keep local-path vs. CDN-url distinction opaque to controllers.
- `rawBody` is only populated for a whitelist of paths defined in `app/security.ts`; do not assume it exists on every request.
- All fields are optional—the interface only declares *possibility*, not presence. Middleware decides when each is set.
