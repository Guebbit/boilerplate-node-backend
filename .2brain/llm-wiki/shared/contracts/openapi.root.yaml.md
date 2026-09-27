---
source: shared/contracts/openapi.root.yaml
sha256: 8ce17fa441e26016b0faf01a3fe938c8a2a0e774a5c491586e52c7bee0291083
generated_at: 2026-09-27T14:01:42.200671+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/openapi.root.yaml

## Purpose

Root OpenAPI 3.0.3 document for the Ecommerce Demo API (v2.0.0). It is the shared "base" that module-level `openapi.yaml` fragments are merged into by the bundler script, providing the global metadata (`info`, `servers`, `tags`), shared `components` (security schemes, reusable parameters, canonical responses), and the `x-app-level-responses` extension. The contract is explicitly codegen-oriented: it drives client/server stubs, DTOs, and SDKs across multiple projects and languages.

## Key elements

- **`info.description`** — Documents the `Accept-Language` i18n contract (q-weights, fallback, `Content-Language`, `Vary`) as a prose-level agreement rather than per-operation headers.
- **`x-app-level-responses`** — Custom extension listing application-level error responses (400, 413, 415, 429, 503) with an `appliesTo` field (`all` | `requestBody`). The bundler script merges these into every matching operation automatically so module fragments never redeclare them.
- **`tags`** — Canonical tag list for every API group (Auth, Antibot, Account, Products, Cart, Orders, Audit, Webhooks, ApiKeys, etc.) with descriptions.
- **`components.securitySchemes`** — `bearerAuth` (JWT) and `apiKeyAuth` (opaque `sk_…` credential). The `apiKeyAuth` entry deliberately omits `bearerFormat` to avoid implying a JWT structure.
- **`components.parameters`** — Reusable parameter definitions: pagination (`PageParam`, `PageSizeParam`), `IdParam` (batch read, `minItems: 1`, `maxItems: 100`), `HardDeleteParam`, `IdempotencyKeyHeader`, `AntibotChallengeTokenHeader`, path/query ID params, and `TextParam`.
- **`components.responses`** — Canonical response definitions (`Success`, `BadRequest`, `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `ValidationError`, `PayloadTooLarge`, `UnsupportedMediaType`, …) that module fragments reference via `$ref`.

## Relationships

- **`scripts/contracts/openapi-bundle.ts`** — Consumes this file as the root document and merges every module fragment into it, injecting `x-app-level-responses` into matching operations. This file is its primary input.
- **Module `openapi.yaml` files** (e.g. `src/modules/account/openapi.yaml`, `src/modules/cart/openapi.yaml`, `src/modules/delivery/openapi.yaml`, `src/modules/feedback/openapi.yaml`, `src/modules/antibot/openapi.yaml`, `src/modules/addresses/openapi.yaml`, `src/modules/audit-logs/openapi.yaml`, `src/modules/api-keys/openapi.yaml`) — Each defines operations and module-specific schemas that are layered on top of this root. They reference `components` defined here (parameters, responses, security schemes) via relative or root-relative `$ref`.
- **`shared/contracts/spectral.modules.yaml`** — Spectral lint rules that validate this file and the module fragments for contract conformance.
- **`shared/contracts/asyncapi.root.yaml`** — Sibling root contract for the async (event) side of the API; structurally parallel but a separate protocol document.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — Implements the runtime behavior described by `IdempotencyKeyHeader`; the parameter's description references this middleware for authoritative semantics.
- **`src/modules/api-keys/module.ts`** — Implements the `POST /api-keys` endpoint that mints the `sk_…` credentials described in the `apiKeyAuth` security scheme.

## Notes

- **`Accept-Language` is intentionally not a declared parameter.** It is documented as prose in `info.description` to avoid adding a redundant argument to every generated function. Clients are expected to set it once via an interceptor.
- **`x-app-level-responses` is an extension, not standard OpenAPI.** Only the bundler script understands and applies it. A tool that reads this file without the bundler will see the `x-` key and ignore it.
- **`IdParam` is an array with `explode: true`**, so `?id=a&id=b` is the intended multi-ID read pattern. `minItems: 1` exists to prevent an empty array from being interpreted as "no filter" (full-table read). `maxItems: 100` caps batch size at one page.
- **`HardDeleteParam` is query-only** in this file. The description notes that the same flag can also appear in a path segment (`/hard`) or a request body; where multiple sources are present, any `true` wins. The contract-level declaration exists so a new domain cannot offer only a subset of the three spellings.
- **The `security` block is commented out.** Authentication is applied per-operation by module fragments rather than globally at this level.
- **`PayloadTooLarge` and `UnsupportedMediaType`** are declared here because the body-parser middleware rejects before any route runs; individual operations cannot sensibly own those responses.
