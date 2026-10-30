---
source: shared/contracts/openapi.root.yaml
sha256: 02f88c9e461fc3da0ef7ae3824f8560a18ca475c7e2546417e54e54ff3269d81
generated_at: 2026-10-29T01:47:30.087043+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/openapi.root.yaml

## Purpose

Root OpenAPI 3.1.0 document for the "Boilerplate API". It defines the global contract surface that every module fragment inherits: the API's i18n and response-shape conventions, the shared error-code catalogue, app-level error responses that no single module owns, server URLs, and the base security scheme. Module fragments (e.g. `src/modules/*/openapi.yaml`) are merged into this document by the bundler to produce the final published spec.

## Key elements

- **`info.description`** — The normative prose contract for language negotiation (`Accept-Language`, `Content-Language`, `Vary: Accept-Language`, draft-language preview for staff), success response shape (bare resource, `{items, meta}` paging, `204`, `201 + Location`), and error shape (RFC 9457 `application/problem+json` with the `errors[].code` extension). Serves as the de-facto spec for behaviour that is *not* declared per-operation (notably the `Accept-Language` header).
- **`x-error-codes`** — Flat map of error codes that belong to no single module (HTTP-status-derived defaults, cross-cutting checks, multer upload limits, idempotency-key errors, 2FA/reauth codes). The bundler collects this map plus every module's own `x-error-codes` into one catalogue and publishes it as the `examples` for `errors[].code` (deliberately not an `enum`, per Zalando guideline #112).
- **`x-app-level-responses`** — Declares the 400 / 413 / 415 / 429 / 500 / 503 responses that the application layer answers before or instead of any route. Each entry carries an `appliesTo` scope (`all`, `requestBody`, `requestBodyOrBodyless`) so the bundler knows which operations to inject it into. Declared once here rather than hand-copied into every module fragment.
- **`servers`** — Local (`http://localhost:3000`) and production (`https://api.example.com`) base URLs.
- **`components.securitySchemes.bearerAuth`** — HTTP bearer scheme; intentionally omits `bearerFormat` because the credential shape depends on deployment session mode.
- **`tags`** — Global tag list (currently `System`).
- **`security`** — Commented out by default; uncommenting would require authentication on every operation.

## Relationships

- **`scripts/contracts/openapi-bundle.ts`** — Consumes this file as the root document. Reads `x-app-level-responses` and merges them into matching operations in each module fragment; also aggregates every fragment's `x-error-codes` (including this file's) into the final `errors[].code` examples list.
- **`src/modules/*/openapi.yaml`** (account, addresses, antibot, api-keys, audit-logs, cart, delivery, feedback) — Sibling fragments that are bundled into this document. They declare their own `x-error-codes` and operation-level responses; the bundler merges them here without modifying this file.
- **`shared/contracts/spectral.modules.yaml`** — Spectral lint rules that validate this document and every module fragment for schema compliance.
- **`shared/contracts/asyncapi.root.yaml`** — Sibling root for the event-driven (AsyncAPI) contract; parallel structure, separate concern.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — Implements the behaviour behind the `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_IN_FLIGHT`, and `IDEMPOTENCY_KEY_MISMATCH` codes declared in `x-error-codes`.
- **`src/infrastructure/http/middlewares/upload.ts`** — Implements the behaviour behind the `LIMIT_*` and `MISSING_FIELD_NAME` codes (multer limits) declared in `x-error-codes`.

## Notes

- **`Accept-Language` is intentionally absent from per-operation parameters.** The `info.description` paragraph is its contract. Clients set it once in an interceptor; declaring it on every operation would add a redundant parameter to every generated function.
- **`x-app-level-responses` is the single source of truth for app-level errors.** Do not re-declare 400/413/415/429/500/503 in a module fragment's responses; the bundler injects them. Duplicating them creates a "published claim with no guard behind it" that goes stale silently.
- **Error codes are published as `examples`, not `enum`.** Adding a new code is additive and non-breaking (Zalando API guideline #112). Never change an existing code's `status` or `description` in a minor version.
- **`x-error-codes` here holds only cross-cutting codes.** Module-specific codes live in each module's own `openapi.yaml` under its own `x-error-codes`. The bundler merges them; there is no import mechanism between fragments.
- **Version `0.1.0` signals pre-1.0 alpha.** Per SemVer §4, breaking changes are permitted until `1.0.0`.
- The `security` block is commented out. When enabling it, every operation inherits the requirement unless it opts out with an empty `security: []`.
