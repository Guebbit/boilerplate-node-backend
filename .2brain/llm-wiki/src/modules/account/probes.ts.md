---
source: src/modules/account/probes.ts
sha256: 4c317f553de2041706a282439708a440bbd6d395dcba59809f67039fa3ccd267
generated_at: 2026-11-14T18:39:27.494910+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/probes.ts

## Purpose

Declares four API requests that the OpenAPI contract for the account module cannot express on its own (error-triggering states, cross-identity logins, rate-limit exhaustion). The array is consumed by the client-collections bundling pipeline to emit runnable Postman/Insomnia-style probe steps alongside the contract-generated collection.

## Key elements

- **`probes: Probe[]`** (exported const) — the sole export. Four `Probe` objects (type imported from `@guebbit/openapi-runnable-collections`), each with `name`, `why`, `method`, `path`, and either `body` or `headers`:
  - *Non-admin login* — `POST /account/login` with `{{seedUserEmail}}` / `{{seedUserPassword}}` to surface 403s the admin token would never see.
  - *401 with bogus token* — `GET /account` with a hardcoded invalid Bearer token to exercise the 401 error envelope.
  - *409 duplicate signup* — `POST /account/signup` re-using `{{seedAdminEmail}}` to trigger the "already exists" conflict.
  - *Rate-limit probe* — `POST /account/login` with a wrong password; must be sent ≥ `NODE_AUTH_RATE_LIMIT_MAX` (default 10) times to elicit a 429.

## Relationships

- **`src/modules/account/tests/integration/probes.test.ts`** — integration test that asserts each probe's expected status code and response shape against a running server.

## Notes

- Template variables (`{{seedUserEmail}}`, `{{seedAdminEmail}}`, etc.) are **not** resolved in this file; the bundle script (`scripts/contracts/client-collections-bundle.ts`, referenced in the module doc-block) substitutes them at generation time. Do not treat them as live credentials.
- The rate-limit probe is intentionally idempotent-unsafe: a single execution only yields 401. The test file (or the running collection) is responsible for the repeat loop.
- The file is a `@module`—it has no named-function exports; `probes` is the only thing other code imports.
