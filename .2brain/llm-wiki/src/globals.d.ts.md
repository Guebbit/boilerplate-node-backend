---
source: src/globals.d.ts
sha256: 7baa3122d3ca0447bb741d06f33bc28015f384fe821357f8371547bfff4b6f82
generated_at: 2026-11-08T03:16:18.256974+00:00
model: ollama:qwen3.8:27b
---

# src/globals.d.ts

## Purpose

Ambient module augmentation of Express's `Request` interface (via `express-serve-static-core`). It gives every route handler in the app a typed view of the fields that middleware attaches at runtime—auth context, request ids, upload state, locale, translation—without requiring an explicit `import` at each call site.

## Key elements

- **`declare module 'express-serve-static-core' → interface Request`** — the sole export. Adds the following optional properties:
  - `authContext` / `caller` — auth guard's DTO and tenant-scoped caller; set together, mutually exclusive with `credentialId`.
  - `credentialId` — api-key id on the CREDENTIAL path; feeds the audit trail and `apiKeyLimiter`.
  - `sessionVia`, `sessionIdle`, `sessionRecheck` — session provenance, idle flag, and (for SSE) a re-resolution callback.
  - `requestId`, `clientRequestId` — server-generated id vs. caller-supplied `x-request-id`.
  - `storedImageUrls`, `storedThumbnailUrls` — inline (no-broker) upload results; read via `readUploadedImage`.
  - `quarantinedImageKeys` — broker-path keys for later digest; also read via `readUploadedImage`.
  - `uploadClaimed` — ownership flag; unclaimed uploads are deleted on 4xx/5xx close.
  - `rawBody` — original bytes for signature verification; set only on paths listed in `app/security.ts`.
  - `locale`, `t` — negotiated locale and the bound `TFunction`.

## Relationships

- **`src/types/auth-context.ts`** — provides the `AuthContext`, `Caller`, and `Resolution<T>` types consumed by `authContext`, `caller`, and `sessionRecheck` on the augmented `Request`.
- **`i18next`** — provides the `TFunction` type for the `t` property.

## Notes

- `authContext` and `credentialId` are **mutually exclusive**: the Bearer/session path sets the former, the `sk_…` api-key path sets the latter. Checking one implies the other is absent.
- `storedImageUrls` and `quarantinedImageKeys` are also mutually exclusive (inline pipeline vs. broker/worker path). Both are read only through `readUploadedImage`, never directly.
- `rawBody` is populated solely by the JSON parser's `verify` hook in `app/security.ts` and only for a fixed set of signing routes; do not assume it exists on every request.
- `sessionRecheck` exists specifically so an SSE stream can re-identify the session while the original cookie may have been cleared; it is absent on non-SSE paths.
- Because this is an *ambient* declaration (`.d.ts` + `declare module`), no runtime code is emitted. It is purely a type-level contract that keeps middleware and handlers in sync.
