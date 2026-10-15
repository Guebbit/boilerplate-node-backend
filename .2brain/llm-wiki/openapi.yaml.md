---
source: openapi.yaml
sha256: 6e64b6d8f769a2ec05c278fabff95af25337291d4988b267d9cfdd46a8eec4f6
generated_at: 2026-10-15T09:33:23.952772+00:00
model: ollama:qwen3.8:27b
---

# openapi.yaml

## Purpose

The bundled, canonical OpenAPI 3.1.0 contract for the Boilerplate API. It is the single source of truth consumed by code generators (client/server stubs, DTOs, SDKs) and by property-based test suites. The file is **generated** by `npm run contracts:bundle` from `shared/contracts/openapi.root.yaml` plus per-module files under `src/modules/*/openapi.yaml`; it is never edited by hand.

## Key elements

- **`openapi: 3.1.0` / `info`** — Declares spec version, project title, AGPL-3.0 license, and a long description block that serves as the contract for the `Accept-Language` header (applied globally, not per-operation).
- **`servers`** — Two endpoints: `http://localhost:3000` (local) and `https://api.example.com` (production).
- **`tags`** — 24 domain tags (System, Locales, Observability, Audit, Antibot, Analytics, Auth, Account, Users, Feedback, Products, Cart, Wishlist, Orders, Payments, Invoicing, Delivery, Returns, Stats, Inventory, Webhooks, ApiKeys, Examples, Notifications), each with a one-line description.
- **`paths`** — All endpoint definitions. Visible entries include:
  - `GET /` — public health ping (`getHealth`).
  - `GET /livez` — process liveness (orchestrator/HEALTHCHECK).
  - `GET /readyz` — readiness probe for load balancers (DB reachability + boot/drain state).
  - `GET /.well-known/security.txt` — RFC 9116 disclosure contact, 404 if deployment hasn't opted in.
  - `GET /locales`, `POST /locales`, `GET /locales/apps` — locale capability discovery and admin language registration.
  - *(file is truncated; additional paths follow the same pattern.)*
- **`components`** *(implied by `$ref`s)* — Shared schemas (`HealthPingEnvelope`, `LocaleCapabilitiesEnvelope`, `LanguageEnvelope`, etc.), response objects (`TooManyRequests`, `ServiceUnavailable`, `BadRequest`, `Unauthorized`, `Forbidden`, `Conflict`, `PayloadTooLarge`, `UnsupportedMediaType`, `ValidationError`, `InternalError`), headers (`Location`), and security schemes (`bearerAuth`, `cookieAuth`, `apiKeyAuth`).
- **`x-module`** extension — Annotates each operation with the owning module (e.g. `locales`), enabling per-module tooling.

## Relationships

- **`github/workflows/schemathesis.yml`** — CI workflow that loads this spec and runs Schemathesis property-based tests against a running instance of the API, verifying that actual responses conform to the declared schemas, response codes, and examples.

## Notes

- **Do not edit.** The header comment is explicit; all changes must go through the source files (`openapi.root.yaml` or a module's `openapi.yaml`) and be re-bundled.
- **`Accept-Language` is deliberately absent from every operation's `parameters`.** The description block in `info` is its binding contract; clients must set the header once in an interceptor. Adding it per-operation would pollute every generated function signature.
- **Three distinct health endpoints** exist on purpose: `/` (client-facing ping), `/livez` (process up, no I/O), `/readyz` (DB reachable + not draining). They map to different orchestrator concerns and must not be merged.
- **`security: []`** on public endpoints means "no auth required"; `security: [{} | bearerAuth | cookieAuth | apiKeyAuth]` on others means "any one of these satisfies the requirement."
- The **Examples** tag is explicitly marked "safe to delete" — it is a template module, not a production concern.
- Response codes are consistently `429` and `503` via shared `$ref`s, keeping error handling uniform across all operations.
