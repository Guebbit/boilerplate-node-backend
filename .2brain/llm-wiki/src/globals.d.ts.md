---
source: src/globals.d.ts
sha256: 7baa3122d3ca0447bb741d06f33bc28015f384fe821357f8371547bfff4b6f82
generated_at: 2026-10-15T09:49:24.436341+00:00
model: ollama:qwen3.8:27b
---

# src/globals.d.ts

## Purpose

Ambient module augmentation that extends Express's `Request` interface so every handler can access the fields middleware actually attaches (auth context, request tracking, locale, upload state) without an explicit import at each call site. It exists purely as a type declaration — no runtime code.

## Key elements

- **Module augmentation of `express-serve-static-core` → `Request`** — the sole declaration in the file; all fields below are added to this interface.
- **`authContext?: AuthContext`** — transport-safe auth DTO, set after auth middleware. Mutually exclusive with `credentialId`.
- **`caller?: Caller`** — resolved caller in TENANT scope, set alongside `authContext`.
- **`credentialId?: string`** — the API-key id (set only on the `sk_…` credential path); used by `apiKeyLimiter` for rate-limit budgeting.
- **`sessionVia?: 'bearer' | 'cookie'`** — which credential channel carried the human session.
- **`sessionIdle?: boolean`** — flag set when `getAuth` refused a staff session that idled out.
- **`sessionRecheck?: () => Promise<Resolution<AuthContext | undefined>>`** — callback (set by `requirePermissionViaCookie` for SSE) to re-resolve the session while the family lives.
- **`requestId?` / `clientRequestId?: string`** — server-assigned vs. caller-supplied correlation ids.
- **`storedImageUrls?` / `storedThumbnailUrls?` / `quarantinedImageKeys?: string[]`** — upload pipeline outputs (inline or broker-deferred). All read via `readUploadedImage`, not directly.
- **`uploadClaimed?: boolean`** — set by `claimUpload`; unclaimed uploads on 4xx/5xx are deleted by the middleware's close hook.
- **`rawBody?: Buffer`** — exact request bytes for signature verification (set by the JSON parser's `verify` hook in `app/security.ts`).
- **`locale?: string`** — negotiated from `Accept-Language` by the locale middleware.
- **`t?: TFunction`** — `i18next` translate function bound to `request.locale`.

## Relationships

- **`src/types/auth-context.ts`** — provides the `AuthContext`, `Caller`, and `Resolution` types imported here. This file is the consumer that projects those types onto the Express request shape; no code in `auth-context.ts` imports this file.

## Notes

- This is an *ambient* augmentation (`declare module`), not a value module. It must be included in the TS compilation (via `tsconfig` `include` or a triple-slash reference) but produces no output.
- `credentialId` and `authContext` are **mutually exclusive** — a request is either a credential (API key) or a session, never both.
- `storedImageUrls` and `quarantinedImageKeys` are also mutually exclusive (inline vs. broker path).
- `rawBody` is deliberately the raw bytes, **not** `JSON.stringify(request.body)`; signatures cover bytes.
- `t` duplicates the ambient `t` exported by `@infrastructure/i18n`; the explicit form exists for handlers that want to see it on the request type without importing the helper.
