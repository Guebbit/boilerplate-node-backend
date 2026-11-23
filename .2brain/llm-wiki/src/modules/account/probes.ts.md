---
source: src/modules/account/probes.ts
source_sha256: 4c317f553de2041706a282439708a440bbd6d395dcba59809f67039fa3ccd267
context_sha256: 8b0a7a8581c986895cedf448ba8edb4127475ba5e584106f59f144636aba3335
generated_at: 2026-11-22T03:33:47.928884+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/probes.ts

## Purpose
Declares the account module's "probes": requests the OpenAPI contract cannot itself express (error states, alternate identities, rate limiting). The file's header says `scripts/contracts/client-collections-bundle.ts` owns the rest: what a probe is for, where these are emitted, and which `{{seedToken}}` values a probe may use.

## Key elements
- `probes: Probe[]` — the only export. It holds four entries, and the `Probe` type comes from `@guebbit/openapi-runnable-collections`. Each entry has a `name`, a `why` explanation, `method`, `path`, and optionally `body` or `headers`.
  - **Log in as the non-admin**: `POST /account/login` with `{{seedUserEmail}}` / `{{seedUserPassword}}`. Generated logins are all the admin's, so this is the way to see the 403s and check role scoping.
  - **401 with a bogus token**: `GET /account` with `Authorization: Bearer not.a.real.token`. This shows the real 401 error envelope and checks that the API answers 401, not 500.
  - **409 on a signup that already exists**: `POST /account/signup` re-registering the seeded admin's email (username `root`, `{{seedAdminEmail}}`, `{{seedAdminPassword}}`, `termsAccepted: true`).
  - **Rate limit (send repeatedly)**: `POST /account/login` with the admin email and the password `wrong-on-purpose`.

## Relationships
- `src/modules/account/tests/integration/probes.test.ts` is the integration test for this file. Its contents are not shown here.

## Notes
- The rate-limit probe only produces a 429 when sent repeatedly. A single send returns 401. The `why` text says the budget is `NODE_AUTH_RATE_LIMIT_MAX` (10 by default) and counts failed attempts, so send it 10 or more times.
- Credentials and emails come from `{{seed*}}` placeholders (`seedUserEmail`, `seedUserPassword`, `seedAdminEmail`, `seedAdminPassword`). They are not literals. The header refers to the bundle script for which tokens are allowed.
- The `why` field is human-readable documentation attached to each probe.
