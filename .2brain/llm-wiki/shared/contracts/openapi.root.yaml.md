---
source: shared/contracts/openapi.root.yaml
sha256: 5d5040de10bf4bae4dd23a6e16af2157496c1d60f5ed161ec90b05d3fb63b9c5
generated_at: 2026-09-23T17:34:04.826471+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/openapi.root.yaml

## Purpose

The root OpenAPI 3.0.3 document for the Ecommerce Demo API. It declares the API-level metadata (title, servers, tags, shared parameters, shared responses, security schemes) and a custom `x-app-level-responses` extension that middlewares can trigger on any route. Module-level endpoint fragments (`src/modules/*/openapi.yaml`) are merged into this document by the bundling script to produce a single, codegen-ready spec for client/server stubs, DTOs, and SDKs across multiple languages.

## Key elements

- **`info.description`** — Carries the `Accept-Language` contract. The header is deliberately *not* declared per-operation or in `components.parameters`; the description paragraph is its normative spec (fallback behaviour, `Content-Language`, `Vary: Accept-Language`).
- **`x-app-level-responses`** — A custom extension mapping HTTP statuses (400, 413, 415, 429) to the shared response object and an `appliesTo` scope (`all` or `requestBody`). Consumed by the bundler, not by a runtime validator.
- **`components.securitySchemes`** — Two schemes: `bearerAuth` (JWT) and `apiKeyAuth` (opaque `sk_…` credential; deliberately no `bearerFormat`).
- **`components.parameters`** — Reusable parameter objects: pagination (`PageParam`, `PageSizeParam`), text filter, batch `IdParam` (array, 1–100 items), path/query ID variants, `HardDeleteParam`, `IdempotencyKeyHeader`, `AntibotChallengeTokenHeader`.
- **`components.responses`** — Named response objects (`Success`, `BadRequest`, `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `ValidationError`, `PayloadTooLarge`, `UnsupportedMediaType`, …) referencing shared error/response schemas.
- **`tags`** — Logical grouping for every module (Auth, Antibot, Account, Cart, Delivery, Feedback, ApiKeys, Observability, Webhooks, etc.).

## Relationships

- **`scripts/contracts/openapi-bundle.ts`** — Reads this file, iterates over merged module fragments, and injects the matching `x-app-level-responses` entries into each operation's `responses` map based on the `appliesTo` scope. Without this script the extension is inert.
- **`src/modules/*/openapi.yaml`** (account, addresses, antibot, api-keys, audit-logs, cart, delivery, feedback, …) — Endpoint fragments that are merged into this root document. They reference `components` defined here (parameters, responses, security schemes) via relative `$ref`s resolved at bundle time.
- **`shared/contracts/spectral.modules.yaml`** — Spectral lint rules that validate this document and the merged fragments for structural consistency (naming, required fields, response coverage).
- **`src/infrastructure/http/middlewares/idempotency.ts`** — Implements the replay/dedup semantics described in the `IdempotencyKeyHeader` parameter (same key + body → replay; same key + different body → 422; in-flight → 409).
- **`src/infrastructure/http/middlewares/upload.ts`** — Governs multipart body limits; the `413` and `415` app-level responses here cover the parser-level refusals it performs before any route executes.
- **`shared/contracts/asyncapi.root.yaml`** — Sibling contract for the event/stream side of the platform; together they form the full API surface, but they are independent documents.
- **`src/modules/api-keys/module.ts`** — Runtime logic behind `POST /api-keys`; the `apiKeyAuth` scheme here documents the credential shape that module mints.

## Notes

- **`Accept-Language` is documented, not declared.** It is intentionally absent from `components.parameters` and from every operation to avoid repeating it 33× and generating a redundant argument in every client method. The paragraph in `info.description` is the contract.
- **`x-app-level-responses` is not standard OpenAPI.** Only the bundling script interprets it. A naive `openapi` consumer (e.g. some generators) will ignore it; do not assume downstream tools see those four statuses unless the bundle step runs.
- **`apiKeyAuth` has no `bearerFormat`.** This is deliberate: the `sk_` credential is opaque, not JWT-structured. Adding `bearerFormat: JWT` would be a false claim.
- **`IdParam` is an array.** A single `?id=X` still works (one-element array), but `minItems: 1` prevents an empty array from being silently treated as "no filter" (i.e. a full-table export).
- **`security` at the root level is commented out.** Per-operation security is the norm; a global lock is available but off by default.
- **`BadRequest` ≠ `ValidationError`.** `BadRequest` (400) covers structural/auth-level failures (e.g. unverifiable webhook signature); `ValidationError` (422) covers well-formed requests whose field values are wrong. Do not conflate them when adding new endpoints.
