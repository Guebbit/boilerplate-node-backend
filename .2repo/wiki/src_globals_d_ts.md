# src/globals.d.ts

## Purpose

TypeScript declaration file that augments the Express `Request` interface (via `express-serve-static-core` module augmentation) so controllers and middleware can access request-scoped metadata—auth context, locale, translation function, request ID, and stored image URLs—without manual casting. It exists purely for type-safety at compile time and emits no runtime code.

## Key elements

- **`Request.authContext?: AuthContext`** — Transport-safe auth context DTO, populated after auth middleware runs.
- **`Request.requestId?: string`** — Correlation/trace identifier for the request.
- **`Request.storedImageUrls?: string[]`** — URLs of images committed by `storeUploadedImages`; must be read through `resolveImageUrl`, never directly (local path vs. CDN URL are indistinguishable to a controller).
- **`Request.locale?: string`** — Locale negotiated from the `Accept-Language` header by the locale middleware.
- **`Request.t?: TFunction`** — i18next `TFunction` bound to `request.locale`; equivalent to the ambient `t` exported by `@infrastructure/i18n` for anything in the request's async chain.

## Relationships

- **`src/types/auth-context.ts`** — Supplies the `AuthContext` type used to type the `authContext` property on `Request`. This is the only import that feeds into the augmented interface.

## Notes

- All added properties are **optional** and **mutable** (`?`); they are set by their respective middleware and are `undefined` until that middleware has executed.
- `storedImageUrls` is deliberately opaque: the file comment warns that a controller cannot distinguish a local filesystem path from a CDN URL by inspecting the string directly. Always go through `resolveImageUrl`.
- `t` is described as the *explicit* form of the same binding that `@infrastructure/i18n` exposes ambiently—both resolve identically for the current request's async scope. Prefer the ambient import in most code; this request property is the escape hatch when you need the binding tied to a specific `req` object.
