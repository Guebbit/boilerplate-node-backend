---
source: shared/contracts/openapi.root.yaml
sha256: 25e54ba895055b3b1fdb0c467c5ba8e15a8f8c2d7463c337801d86a8ae51ae15
generated_at: 2026-11-14T17:44:55.048389+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/openapi.root.yaml

## Purpose

The root OpenAPI 3.1.0 document for the Boilerplate API. It declares the API's identity, server list, and global conventions (language negotiation, response shape, error envelope) that every module inherits. It also holds the module-agnostic `x-error-codes` catalogue and shared vendor extensions (`x-image-upload-types`) that a bundler merges into the final published spec. Modules under `src/modules/` build on this rather than re-declaring these concerns.

## Key elements

- **`info`** – Title, license (AGPL-3.0-or-later), version `0.1.0` (initial development per SemVer §4), and a long `description` that serves as the normative contract for `Accept-Language` handling, success-response shape, and RFC 9457 error format.
- **`x-error-codes`** – Top-level vendor extension listing every error code that belongs to no single module (HTTP-status defaults, multer limits, idempotency, rate-limit, re-auth, etc.). Each entry carries `scope`, `status`, and a human-readable `description`. A bundler collects this plus every module's own `x-error-codes` into one catalogue in the published document; it is deliberately *not* an `enum` on `errors[].code` so adding a code is additive.
- **`servers`** – Local (`http://localhost:3000`) and Production (`https://api.example.com`) endpoints.
- **`x-image-upload-types`** – Canonical MIME types accepted by every `imageUpload` multipart part. The bundler copies these onto each operation's `encoding.imageUpload.contentType` and then removes the key; `gen:api` reads them back from the encoding.
- **`contact`** – API Team (placeholder name).

## Relationships

- **`src/modules/account/openapi.yaml`, `src/modules/addresses/openapi.yaml`, `src/modules/analytics/openapi.yaml`, `src/modules/antibot/openapi.yaml`, `src/modules/api-keys/openapi.yaml`, `src/modules/audit-logs/openapi.yaml`, `src/modules/cart/openapi.yaml`, `src/modules/example/openapi.yaml`, `src/modules/inventory/openapi.yaml`** – Each is a fragment that the bundler merges under this root. Modules declare their *own* `x-error-codes`; the root provides the shared, cross-cutting ones (idempotency, rate-limiting, multer limits, re-auth).
- **`shared/contracts/spectral.yaml` / `shared/contracts/spectral.modules.yaml`** – Spectral rule sets that lint module fragments and the merged document against the conventions documented in this file's `info.description` (RFC 9457 shape, `x-error-codes` structure, response-envelope rules).
- **`shared/rules/images.yaml`** – Reusable OpenAPI fragment that pairs with `x-image-upload-types` here to keep upload-part typing consistent across operations.
- **`shared/rules/defaults.yaml`, `shared/rules/cookies.yaml`, `shared/rules/audit-actions.yaml`** – Reusable OpenAPI fragments (parameters, responses, schemas) that module specs import; they inherit the global response and error conventions defined in this root.

## Notes

- The `Accept-Language` header is intentionally **not** declared per operation. The paragraph in `info.description` is its contract; generated clients set it once in an interceptor.
- `x-error-codes` entries use `scope: app` to distinguish them from module-scoped codes. A missing `scope` (e.g. `ROLE_MANAGEMENT_REQUIRED`, `IDEMPOTENCY_*`, `REAUTH_REQUIRED`) implies a module-specific code that happens to be declared here for convenience.
- The version is `0.1.0`, not `1.0.0`; the file explicitly notes the first stable release will be `1.0.0`.
- The description block is normative, not just informational—several sentences state hard rules (2xx has no wrapper, lists are objects, 204 has no body) that linting and codegen rely on.
