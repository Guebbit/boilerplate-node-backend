---
source: src/modules/account/probes.ts
sha256: 37955893c097b594d7b46ce9bf3730a44fdcc05ae0ea9fdc74066b37d55dea5c
generated_at: 2026-11-08T04:14:17.978994+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/probes.ts

## Purpose

Declares four HTTP "probe" requests for the account module that the OpenAPI contract cannot express on its own (role-scoped login, explicit 401, duplicate-signup 409, rate-limit 429). These probes are injected into the generated Postman/OpenAPI client collection so developers can hit edge-case responses that no single contract operation covers.

## Key elements

- **`probes: Probe[]`** — the sole export. An array of four `Probe` objects (type from `@guebbit/openapi-runnable-collections`), each with `name`, `why`, `method`, `path`, and optional `body`/`headers`:
  - Non-admin login (`POST /account/login`) — verifies role scoping with the seeded non-admin credentials.
  - Bogus-token 401 (`GET /account`) — confirms the API returns 401 (not 500) for an unverifiable bearer token.
  - Duplicate-signup 409 (`POST /account/signup`) — re-registers the seeded admin email to trigger the conflict path.
  - Rate-limit 429 (`POST /account/login`) — intentionally wrong password; must be sent 10+ times to exhaust `NODE_AUTH_RATE_LIMIT_MAX` and surface the middleware 429.

## Relationships

- **`src/modules/account/tests/integration/probes.test.ts`** — integration test that exercises each probe (verifies expected status codes, error envelopes, and rate-limit behavior).
- **`scripts/contracts/client-collections-bundle.ts`** *(referenced in the module header, not a listed graph neighbor)* — consumes the `probes` array and owns probe semantics: what a probe is for, where probes are emitted in the generated collection, and how `{{seedToken}}` placeholders are resolved.

## Notes

- The `{{seedUserEmail}}`, `{{seedAdminEmail}}`, etc. placeholders are **not** resolved here; the bundle script substitutes them at generation time.
- The rate-limit probe is not a single-request test: it only produces a 429 after ≥ 10 consecutive sends. Running it in isolation yields 401, not 429.
- The 409 probe assumes the seeded admin already exists (i.e., seed data has been loaded) before the request fires.
- The module is intentionally a data file with no logic; all behavior lives in the API server and the bundle script.
