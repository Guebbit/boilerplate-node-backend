---
source: src/globals.d.ts
sha256: b3dea02dcc34b5400f30e2a706874eda935034cf744bea5dc8b73f438a96c9d5
generated_at: 2026-09-27T14:03:50.447427+00:00
model: ollama:qwen3.8:27b
---

# src/globals.d.ts

## Purpose

Ambient module augmentation that extends Express's `Request` interface with every field the app's middleware chain attaches. Handlers and services can read these fields with full type safety in every file without a per-site import.

## Key elements

- **`authContext?: AuthContext`** — Transport-safe auth DTO, present after the auth middleware runs.
- **`caller?: Caller`** — Tenant-scoped authorization identity, resolved once by the auth guard. Always set together with (or absent together with) `authContext`.
- **`credentialId?: string`** — API-key id for the CREDENTIAL (`sk_…`) auth path. Mutually exclusive with `authContext`; feeds the audit trail and `apiKeyLimiter` budgeting.
- **`requestId?: string`** — Correlation id assigned per request.
- **`storedImageUrls?: string[]` / `storedThumbnailUrls?: string[]`** — Image URLs when the upload pipeline ran inline (no broker). Always read via the `readUploadedImage` helper.
- **`quarantinedImageKeys?: string[]`** — Quarantine keys when a broker is configured and digesting is deferred to a worker. Mutually exclusive with `storedImageUrls`; also read via `readUploadedImage`.
- **`rawBody?: Buffer`** — Exact incoming bytes, set only for routes whose callers sign the payload (configured in `app/security.ts`).
- **`locale?: string`** — Locale negotiated from `Accept-Language` by the locale middleware.
- **`t?: TFunction`** — i18next function bound to `request.locale`; equivalent to the ambient `t` exported by `@infrastructure/i18n`.

## Relationships

- **`src/types/auth-context.ts`** — Source of the `AuthContext` and `Caller` types consumed by the `authContext` and `caller` fields.
- **`@infrastructure/http/middlewares/rate-limit`** (`apiKeyLimiter`) — Reads `credentialId` to key its per-credential budget.
- **`@infrastructure/i18n`** — The ambient `t` it exports resolves to the same binding as `request.t`.
- **`app/security.ts`** — JSON-parser `verify` hook that populates `rawBody` for the signed-path allowlist.

## Notes

- `authContext` and `credentialId` are **mutually exclusive** (session vs. credential auth paths). Code must not assume both are present.
- `caller` is always **tenant-scoped**; platform-scope decisions are resolved inside the guard and never persisted on the request.
- `storedImageUrls` and `quarantinedImageKeys` are **mutually exclusive** (inline pipeline vs. broker/worker path). Both are accessed through `readUploadedImage`, never directly, to abstract local-path vs. CDN-url distinction.
- `rawBody` exists only on a subset of routes; treat it as absent by default.
