# src/globals.d.ts

## Purpose

Ambient module declaration that augments Express's `Request` interface so every handler automatically sees the fields middleware attaches (auth, locale, request id, image storage metadata) without needing an explicit import at each call site.

## Key elements

- **`Request.authContext?: AuthContext`** — Transport-safe auth DTO, present after auth middleware runs.
- **`Request.requestId?: string`** — Correlation id for the request.
- **`Request.storedImageUrls?: string[]`** — Final image URLs from an *inline* upload pipeline (no broker). Must be read via `resolveImageUrl`, never accessed raw.
- **`Request.storedThumbnailUrls?: string[]`** — Thumbnails produced in the same inline run.
- **`Request.quarantinedImageKeys?: string[]`** — Quarantine keys when a broker *is* configured; the actual digest happens later in a worker. Read via `resolvePendingImageKey`.
- **`Request.locale?: string`** — Negotiated from `Accept-Language` by the locale middleware.
- **`Request.t?: TFunction`** — Translation function bound to `request.locale`; same binding as the ambient `t` exported by `@infrastructure/i18n`.

## Relationships

- **`src/types/auth-context.ts`** — Provides the `AuthContext` type that `Request.authContext` is typed as. This is a type-only import; the file has no runtime dependency on it.

## Notes

- This file is a *declaration* file (`.d.ts`): it produces no JavaScript. It only widens what TypeScript allows handlers to read off `req`.
- The image fields come in two mutually exclusive shapes depending on broker configuration (inline vs. quarantined). Code should branch on which is present, not assume both.
- `storedImageUrls` and `quarantinedImageKeys` are intentionally opaque; the doc comments direct readers to use `resolveImageUrl` / `resolvePendingImageKey` accessors rather than treating the values as plain paths or URLs.
- `Request.t` is the per-request binding of the i18n function; it is *not* a separate mechanism from `@infrastructure/i18n`'s ambient `t`—they resolve to the same bound function for anything in the request's async chain.
