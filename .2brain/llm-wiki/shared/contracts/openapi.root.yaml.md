---
source: shared/contracts/openapi.root.yaml
sha256: 9f4f6dd58faea83b7d40af15e0725b555f443dc5fecaa54c206eaf91bd0ca5c5
generated_at: 2026-10-15T09:49:13.587143+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/openapi.root.yaml

## Purpose

Root OpenAPI 3.1.0 document that defines the global contract surface shared across all module fragments: the API's identity, the universal error-code catalogue (`x-error-codes`), the app-level responses injected by cross-cutting middlewares (`x-app-level-responses`), common security schemes, and shared parameters. Module-level `openapi.yaml` files are merged into this root by the bundler to produce the single published spec.

## Key elements

- **`info`** — API title, AGPL-3.0 license, version `0.1.0` (pre-1.0 development per SemVer §4), and a multi-paragraph description covering language negotiation (`Accept-Language` / `Content-Language` / `Vary`) and codegen intent.
- **`x-error-codes`** — A flat map of ~25 error codes (e.g. `VALIDATION_ERROR`, `OUTRANKED`, `IDEMPOTENCY_KEY_MISMATCH`, `RATE_LIMITED`, multer `LIMIT_*` codes) that belong to no single module. Collected by the bundler into `errors[].code` examples (not an enum) so new codes are additive.
- **`x-app-level-responses`** — Declares the four responses (400, 413, 415, 429, 503) that the global body-parser and rate-limiter middlewares can produce on *any* operation, tagged with `appliesTo: all | requestBody`. Merged into every matching operation by the bundler rather than hand-copied per module.
- **`components.securitySchemes`** — Four schemes: `bearerAuth` (session JWT / opaque session id / API key), `apiKeyAuth` (opaque `sk_…` M2M credential), `cookieAuth` (`__Host-session` HttpOnly cookie), `metricsBearer` (static Prometheus scrape token).
- **`components.parameters`** — Reusable query params (`PageParam`, `PageSizeParam`, `TextParam`) and `AntibotChallengeTokenHeader` (optional anti-bot token, required only when a provider is active).
- **`servers`** — Two declared targets: `http://localhost:3000` (Local) and `https://api.example.com` (Production).
- **`tags`** — A single `System` tag for public endpoints (ping, liveness).

## Relationships

- **`scripts/contracts/openapi-bundle.ts`** — Reads this file as the merge base, combines every module's `openapi.yaml` fragment into it, collects all `x-error-codes` into one catalogue, and injects `x-app-level-responses` into each operation. The output is the published spec.
- **Module `openapi.yaml` files** (account, addresses, antibot, api-keys, audit-logs, cart, delivery, feedback, …) — Each declares its own paths, schemas, and module-specific `x-error-codes`; none of them redeclare the global schemes, parameters, or app-level responses defined here.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — Produces the `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_IN_FLIGHT`, and `IDEMPOTENCY_KEY_MISMATCH` codes catalogued in `x-error-codes`.
- **`src/infrastructure/http/middlewares/upload.ts`** — Produces the multer `LIMIT_*` and `MISSING_FIELD_NAME` codes catalogued in `x-error-codes`.
- **`shared/contracts/spectral.modules.yaml`** — Spectral lint rules applied to the merged spec (this file and all fragments) during CI.
- **`shared/contracts/asyncapi.root.yaml`** — Sibling root for the async/event side of the contract; independent of this file but published alongside it.

## Notes

- `Accept-Language` is **deliberately not declared** as a parameter or header on any operation. Its contract is stated entirely in `info.description`. Do not add it to individual operations or to `components.parameters` — the bundler and codegen treat that paragraph as the single source of truth.
- `x-error-codes` is published as `examples` on `errors[].code`, **not** as an `enum`. This is intentional (Zalando API guideline #112): adding a new code must never be a breaking response change.
- `x-app-level-responses` exists to avoid hand-copying the same four/five responses into every module fragment. If you add a new global middleware that can reject any request, add its status here rather than in each module.
- `bearerAuth` and `apiKeyAuth` are both `type: http, scheme: bearer` but are **distinct schemes** in the spec; operations opt into one or the other. Do not collapse them.
- The `AntibotChallengeTokenHeader` parameter is `required: false` at the contract level; the server enforces it only when `NODE_ANTIBOT_PROVIDER` is set to a real provider. Codegen should emit it as optional.
