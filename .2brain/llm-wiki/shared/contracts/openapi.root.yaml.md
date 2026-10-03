---
source: shared/contracts/openapi.root.yaml
sha256: 1871d1dea838f9d26b394ca3f7c5ab0cbea0714fed2012d3b4d9f9701590790c
generated_at: 2026-10-01T12:43:20.910104+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/openapi.root.yaml

## Purpose

The root OpenAPI 3.0.3 specification for the Ecommerce Demo API (v2.0.0). It serves as the stable, codegen-oriented contract that module fragments (`src/modules/*/openapi.yaml`) plug into. It defines cross-cutting concerns—global error-code catalogue, app-level responses, shared parameters, security schemes, and tag taxonomy—that individual module files should not duplicate. The bundler (`scripts/contracts/openapi-bundle.ts`) merges this root with every fragment to produce the single spec published for client/server stubs, DTOs, and SDKs.

## Key elements

- **`info.description`** — Documents the `Accept-Language` contract (q-weights, fallback, `Content-Language`, `Vary` header) and explains why the header is deliberately *not* declared per-operation or in `components.parameters`.
- **`x-error-codes`** — A custom extension listing every machine-readable error code (`BAD_REQUEST` through `REAUTH_REQUIRED`) with its HTTP status and description. The bundler collects this plus each module's own `x-error-codes` into the `examples` array of `errors[].code` (never an `enum`, per Zalando guideline #112).
- **`x-app-level-responses`** — Declares five responses (400, 413, 415, 429, 503) emitted by global middlewares (rate limiter, body parser) that no single operation owns. Each entry carries an `appliesTo` scope (`all` or `requestBody`). The bundler injects these into matching operations rather than hand-copying them into every fragment.
- **`tags`** — The canonical tag list (Auth, Cart, Orders, Invoicing, Delivery, Returns, Audit, Webhooks, ApiKeys, etc.) with short descriptions where semantics need disambiguation (e.g. Audit vs. Observability).
- **`components.securitySchemes`** — `bearerAuth` (JWT) and `apiKeyAuth` (opaque `sk_…` credential). The `apiKeyAuth` entry deliberately omits `bearerFormat` and points to `docs/tools/security.md` for the credential format.
- **`components.parameters`** — Shared, reusable parameters:
  - `PageParam`, `PageSizeParam`, `TextParam` — generic pagination/search query params.
  - `AntibotChallengeTokenHeader` (`x-antibot-challenge-token`) — optional; required by the server only when a real antibot provider is configured.
  - `IdempotencyKeyHeader` (`Idempotency-Key`) — optional; enables safe write-retry semantics (409 in-flight, 422 body-mismatch, replay on repeat).
  - `IfMatchHeader` (`If-Match`) — ETag-based optimistic concurrency; the bundler auto-attaches it to PUT/PATCH/DELETE on paths marked `x-versioned`.
- **`servers`** — Localhost and production base URLs.
- **Global `security`** — Present but commented out; authentication is applied per-operation or per-module.

## Relationships

- **`scripts/contracts/openapi-bundle.ts`** — Reads this root file and every `src/modules/*/openapi.yaml` fragment, then merges them: collects all `x-error-codes` into one catalogue, injects `x-app-level-responses` into matching operations, and adds `IfMatchHeader` to `x-versioned` path items. The output is the single spec handed to codegen tools.
- **`shared/contracts/spectral.modules.yaml`** — Spectral linting rules applied to this file and all module fragments during CI, enforcing consistency (tag usage, error-code format, etc.).
- **`shared/contracts/asyncapi.root.yaml`** — Sibling contract for the event-driven (webhook/outbound) side; not imported by this file but published alongside it for the same multi-language codegen pipeline.
- **`src/modules/*/openapi.yaml`** (account, addresses, antibot, api-keys, audit-logs, cart, delivery, feedback, …) — Each declares its own paths, schemas, and module-specific `x-error-codes`, referencing this root's `tags`, `securitySchemes`, and shared `parameters` via `$ref` or by name.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — Implements the runtime behaviour the `IdempotencyKeyHeader` parameter and `IDEMPOTENCY_IN_FLIGHT` / `IDEMPOTENCY_KEY_MISMATCH` error codes describe.
- **`src/infrastructure/http/middlewares/upload.ts`** — Implements the multer-based limits that produce the `LIMIT_PART_COUNT`, `LIMIT_FILE_SIZE`, `LIMIT_FILE_COUNT`, `LIMIT_FIELD_*`, `LIMIT_UNEXPECTED_FILE`, and `MISSING_FIELD_NAME` error codes.
- **`src/modules/api-keys/module.ts`** — Runtime handler for minting/revoking the `sk_…` credentials described by the `apiKeyAuth` scheme.

## Notes

- **`Accept-Language` is intentionally absent from `components.parameters` and from every operation.** Its contract lives in `info.description` only. Clients set it once via an interceptor; declaring it 33+ times would add a redundant argument to every generated function.
- **`x-app-level-responses` is a build-time merge, not a runtime feature.** If you add a new global middleware that can reject a request before routing, add its status to this map and the bundler will wire it in—do not copy the response into each module fragment.
- **`x-error-codes` is additive by design.** New codes are published as `examples` on `errors[].code`, never as an `enum`, so adding a code is not a breaking change for existing clients.
- **Global `security` is commented out.** Authentication is opt-in per operation/module; do not uncomment the block without updating every operation that should remain public (e.g. `GET /locales`, `GET /antibot/config`, ping).
- **`If-Match` is auto-attached, not hand-written.** The bundler reads the path item's `x-versioned` marker. If a new resource needs optimistic concurrency, set `x-versioned` on its path item rather than adding the parameter manually to each operation.
