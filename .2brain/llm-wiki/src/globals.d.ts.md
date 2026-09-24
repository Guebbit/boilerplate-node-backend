---
source: src/globals.d.ts
sha256: 339bb622b024a83d78a36a457d97112f3f9b7817d89edf177fbc1fbefe84cd02
generated_at: 2026-09-23T17:36:59.115970+00:00
model: ollama:qwen3.8:27b
---

# src/globals.d.ts

## Purpose

Ambient TypeScript declaration that augments Express's `Request` interface with the fields the app's middleware actually attaches (auth context, request id, locale, uploaded image metadata, raw body, etc.). This lets every handler type-check those properties without an explicit `import` at each call site.

## Key elements

- **`authContext?: AuthContext`** – Transport-safe auth DTO, present after the auth middleware runs.
- **`caller?: Caller`** – Caller resolved in TENANT scope by the auth guard; set together with `authContext`, absent together.
- **`credentialId?: string`** – API-key id, set only on the credential path (`sk_…` branch of `getAuth`); mutually exclusive with `authContext`.
- **`requestId?: string`** – Per-request correlation id.
- **`storedImageUrls?: string[]` / `storedThumbnailUrls?: string[]`** – Image and thumbnail URLs set when the digest pipeline ran inline (no broker). Read via `readUploadedImage`, not directly.
- **`quarantinedImageKeys?: string[]`** – Quarantine keys set when a broker _is_ configured; digest happens later in a worker. Mutually exclusive with `storedImageUrls`.
- **`rawBody?: Buffer`** – Original request bytes, preserved for signature verification. Set only by the `verify` hook in `app/security.ts` and only on the paths listed there.
- **`paymentConfirmDeclined?: boolean`** – Distinguishes a genuine `PAYMENT_DECLINED` 409 from the `PAYMENT_ORDER_NOT_PAYABLE` race so the decline-budget limiter spends correctly.
- **`locale?: string`** – Locale negotiated from `Accept-Language`.
- **`t?: TFunction`** – i18next `t` bound to `request.locale`; same binding the ambient `t` from `@infrastructure/i18n` resolves to on the request's async chain.

## Relationships

- **`src/types/auth-context.ts`** – Source of the `AuthContext` and `Caller` types referenced in the augmentation. The file imports them as type-only imports to shape `Request.authContext` and `Request.caller`.

## Notes

- The file is purely ambient (a `declare module` block); it produces no runtime code.
- `authContext` and `credentialId` are **mutually exclusive** by design—two distinct auth paths (session vs. API key).
- `storedImageUrls` and `quarantinedImageKeys` are likewise mutually exclusive (inline vs. broker-backed digest).
- Controllers should not read `storedImageUrls` / `quarantinedImageKeys` directly; go through `readUploadedImage` to avoid leaking local paths vs. CDN URLs.
- `rawBody` exists because `JSON.stringify(request.body)` does not reproduce the exact signed bytes; only a small set of routes populate it.
