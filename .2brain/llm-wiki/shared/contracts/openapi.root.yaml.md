---
source: shared/contracts/openapi.root.yaml
sha256: 4ac05c217b61e1c43ba1db2b3cb06da42315bc14e9e685d4d357531cbefd0c3d
generated_at: 2026-11-08T03:07:47.003814+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/openapi.root.yaml

## Purpose

Root OpenAPI 3.1.0 document for the Boilerplate API. It carries the global metadata (`info`, `servers`), cross-cutting extensions that apply across all modules (`x-error-codes`, `x-app-level-responses`, `x-image-upload-types`, application-level headers), and the prose contract for i18n, response shape, and error format. Module fragments under `src/modules/*/openapi.yaml` are bundled into this root by `scripts/contracts/openapi-bundle.ts` to produce the final spec used for codegen (client/server stubs, DTOs, SDKs).

## Key elements

- **`info.description`** — The normative prose contract: `Accept-Language` selection rules, `Content-Language` / `Vary` behaviour, staff draft-locale exception, success response shape (`{ items, meta }`, 204, 201 + `Location`), and the RFC 9457 problem-details error envelope. The `Accept-Language` header is deliberately *not* declared per-operation; this paragraph is its contract.
- **`x-error-codes`** — Cross-cutting error codes that belong to no single module (global 400/401/403/404/405/409/412/413/415/422/429/500/503, multer limits, idempotency, re-auth, 2FA). Collected by the bundler from every fragment's own `x-error-codes` and published as `errors[].code` **examples** (never an `enum`), so adding a code is non-breaking.
- **`x-app-level-responses`** — Responses the application middleware answers (400, 413, 415, 429, 500, 503) with an `appliesTo` scope (`all`, `requestBody`, `requestBodyOrBodyless`). Merged into every matching operation by the bundler rather than hand-copied into each fragment.
- **`x-image-upload-types`** — Canonical MIME types (`image/png`, `image/jpeg`, `image/webp`) for `imageUpload` multipart parts. The bundler stamps them onto each multipart body as `encoding.imageUpload.contentType`, then drops this key.
- **`servers`** — Local (`http://localhost:3000`) and production (`https://api.example.com`) URLs.
- **`info.license` / `info.version`** — AGPL-3.0-or-later; version `0.1.0` (SemVer §4 initial development; first stable is 1.0.0).

## Relationships

- **`src/modules/*/openapi.yaml`** (account, addresses, analytics, antibot, api-keys, audit-logs, cart, example, inventory, …) — Each module fragment declares its own operations, paths, and module-specific `x-error-codes`. The bundler merges them into this root, collecting all `x-error-codes` into one catalogue and injecting `x-app-level-responses` and `x-image-upload-types` into the appropriate operations.
- **`shared/contracts/spectral.yaml` / `spectral.modules.yaml`** — Spectral OAS-linter configurations that validate this root and the module fragments against the rules in `shared/rules/`.
- **`shared/rules/*.yaml`** (audit-actions, cookies, defaults, images) — Individual Spectral rule files referenced by the linter configs; they enforce conventions (e.g. image upload shape, cookie usage, default headers) on the documents bundled from this root.

## Notes

- `errors[].code` is published as an **examples** list, not an `enum`. A new code is additive; clients must not treat the list as exhaustive (Zalando API guideline #112).
- `x-app-level-responses` exist to avoid hand-copying the same 400/413/415/429/500/503 into every operation. A hand-copied list "goes stale silently."
- `x-image-upload-types` is an authoring convenience only — it is *removed* from the final bundled spec after the bundler has written `encoding.imageUpload.contentType`.
- The `Accept-Language` parameter is intentionally absent from every operation's `parameters` to keep generated function signatures clean; clients set it once in an interceptor. The `info.description` paragraph is the binding contract for that behaviour.
- Staff draft-locale reads (`GET /products`, `POST /products/search`, `GET /products/{id}`, and the example read) answer `Cache-Control: private, no-store` and are never cached server-side.
