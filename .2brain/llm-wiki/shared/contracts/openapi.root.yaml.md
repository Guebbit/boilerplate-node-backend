---
source: shared/contracts/openapi.root.yaml
sha256: 62a1b95a83c7d02a745b4cf536b41bb225058473f0e27e21646f5521936e53e2
generated_at: 2026-10-14T07:36:05.241139+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/openapi.root.yaml

## Purpose

The root OpenAPI 3.1.0 document that defines the API's global metadata, shared security schemes, cross-module error-code catalogue, and application-level responses that apply to every operation. Module-specific `openapi.yaml` fragments (one per `src/modules/*` directory) are merged into this document by the bundler to produce the final published contract. It exists so that multi-project, multi-language codegen targets (client stubs, DTOs, SDKs) have a single, stable schema source.

## Key elements

- **`info`** — Title ("Boilerplate API"), version `0.1.0` (alpha per SemVer), AGPL-3.0-or-later license, and a prose description that doubles as the contract for `Accept-Language` handling (applies to all operations, never declared per-operation).
- **`x-error-codes`** — A custom extension listing every cross-module error code (`BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `OUTRANKED`, `NOT_FOUND`, `CONFLICT`, `PRECONDITION_FAILED`, `VALIDATION_ERROR`, `REQUEST_ERROR`, `INVALID_REQUEST`, `INTERNAL_ERROR`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, multer `LIMIT_*` codes, `MISSING_FIELD_NAME`, `SERVICE_UNAVAILABLE`, `RATE_LIMITED`, `IDEMPOTENCY_*`, `REAUTH_REQUIRED`). The bundler collects these (plus each module's own `x-error-codes`) and publishes them as `examples` on `errors[].code` — intentionally not an `enum` so adding a code is non-breaking.
- **`x-app-level-responses`** — Declares the five statuses (400, 413, 415, 429, 503) that middleware in front of every route can return. Each entry carries an `appliesTo` scope (`all` or `requestBody`). The bundler merges these into every matching operation rather than hand-copying them into fragments.
- **`components.securitySchemes`** — Four schemes: `bearerAuth` (JWT or `ses_…` session id), `apiKeyAuth` (opaque `sk_…` key), `cookieAuth` (`__Host-session` cookie, used for SSE or cookie-mode auth), and `metricsBearer` (static Prometheus scrape token).
- **`components.parameters`** — Reusable parameters: `PageParam`, `PageSizeParam`, `TextParam`, and `AntibotChallengeTokenHeader` (the `x-antibot-challenge-token` header, optional at contract level, required server-side once an antibot provider is configured).
- **`servers`** — Local (`http://localhost:3000`) and production (`https://api.example.com`).
- **`tags`** — A single `System` tag for public health-check endpoints.

## Relationships

- **`scripts/contracts/openapi-bundle.ts`** — Consumes this file and every module `openapi.yaml` fragment. Merges `x-error-codes` from all fragments into one catalogue and injects `x-app-level-responses` into each operation per its `appliesTo` scope.
- **`src/modules/*/openapi.yaml`** (account, addresses, antibot, api-keys, audit-logs, cart, delivery, feedback, …) — The per-module fragments that the bundler combines with this root document. Each may declare its own `x-error-codes`; the antibot module references the `AntibotChallengeTokenHeader` parameter defined here; the api-keys module references `apiKeyAuth`.
- **`shared/contracts/spectral.modules.yaml`** — Spectral linting rules applied to this file and all module fragments during contract validation.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — Implements the runtime behavior behind the three `IDEMPOTENCY_*` codes declared here.
- **`src/infrastructure/http/middlewares/upload.ts`** — Implements the runtime behavior behind the multer `LIMIT_*` and `MISSING_FIELD_NAME` codes declared here.
- **`shared/contracts/asyncapi.root.yaml`** — Sibling root document for the async (message-broker) side of the API; shares the same module directory structure but a different protocol spec.

## Notes

- `Accept-Language` is deliberately **not** declared as a parameter on any operation or in `components.parameters`. The paragraph in `info.description` is its contract. Do not add it per-operation; clients set it once via an interceptor.
- `errors[].code` is published as `examples`, not `enum`. Adding a new code to any `x-error-codes` block is additive and non-breaking (Zalando guideline #112).
- `bearerFormat` is intentionally omitted on all bearer schemes — the credential shape varies by deployment session mode, and declaring `JWT` would be a false claim for cookie-mode or API-key credentials.
- `OUTRANKED` (403) is a domain-specific code distinct from `FORBIDDEN`: the caller has the permission but the target person ranks at or above them. The four money-moving steps (manual payment, refund, return approval, return receipt) refuse the caller's *own* order with plain `FORBIDDEN`.
- The `antibot` parameter is `required: false` at the contract level; the server enforces it once `NODE_ANTIBOT_PROVIDER` is set to a real provider.
