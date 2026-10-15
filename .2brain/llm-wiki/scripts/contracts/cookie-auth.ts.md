---
source: scripts/contracts/cookie-auth.ts
sha256: d225df40eaaf7c13e74fe087b6e2f77ba72f749f183746b9fc66367f0698884f
generated_at: 2026-10-15T09:37:14.961722+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/cookie-auth.ts

## Purpose

Post-bundle OpenAPI transformation step that derives a `cookieAuth` security alternative from every operation already declaring `bearerAuth`, and adds a `403` origin-refusal response to unsafe methods that lack one. Exists so the cookie-auth claim and its 403 are generated mechanically rather than hand-declared per operation.

## Key elements

- **`withCookieAuth(bundled: string): string`** — sole export. Parses a YAML OpenAPI document, augments qualifying operations, and re-serializes.
- **`SAFE_METHODS`** — `get`, `head`, `options`. Operations using these skip the 403 addition.
- **`OPERATION_METHODS`** — all eight HTTP methods valid as path-item keys; iterated to find operations.
- **`takesBearer(security)`** — type guard: true if any security alternative names `bearerAuth`.
- **`SecuredOperation` / `Bundled`** — minimal structural interfaces for the document subset this step reads/writes (`security`, `responses`, `paths`).

## Relationships

- **`scripts/contracts/openapi-bundle.ts`** — this file is a post-bundle step; it consumes the bundled document that the bundle step produces.
- **`tests/unit/scripts/contracts/cookie-auth.test.ts`** — unit tests exercising `withCookieAuth`.

## Notes

- Never overwrites an existing `403` on an operation; the operation's own response is treated as more specific than the generic origin refusal.
- The injected 403 references `#/components/responses/Forbidden`; that component must already exist in the bundled document.
- YAML serialization uses `lineWidth: 0` to prevent rewrapping unrelated description text.
- `isOperation` is effectively a null/object check — actual filtering is done by `takesBearer` on the `security` field.
