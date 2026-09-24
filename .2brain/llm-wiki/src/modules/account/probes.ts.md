---
source: src/modules/account/probes.ts
sha256: 37955893c097b594d7b46ce9bf3730a44fdcc05ae0ea9fdc74066b37d55dea5c
generated_at: 2026-09-23T18:07:32.341522+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/probes.ts

## Purpose

Defines four hand-written API requests (probes) that the OpenAPI contract cannot express on its own — e.g. deliberate 401/409/429 responses and a non-admin login. These are emitted alongside the contract-generated collection to fill testing gaps.

## Key elements

- **`probes: Probe[]`** (the sole export) — an array of four `Probe` objects:
    - _log in as the non-admin_ — `POST /account/login` with `{{seedUserEmail}}`/`{{seedUserPassword}}` to exercise role-scoped 403 paths.
    - _401 with a bogus token_ — `GET /account` with a hardcoded `Bearer not.a.real.token` to hit the unauthenticated error envelope.
    - _409 on duplicate signup_ — `POST /account/signup` reusing `{{seedAdminEmail}}` to trigger the already-exists conflict.
    - _rate limit_ — `POST /account/login` with a wrong password, intended to be sent 10+ times to exhaust `NODE_AUTH_RATE_LIMIT_MAX` and surface the middleware-level 429.

- Each probe's `why` field is human/AI-readable prose explaining _why_ the request exists and what to look for.
- The `Probe` type is imported from `@guebbit/openapi-runnable-collections`.

## Relationships

- **`scripts/contracts/client-collections-bundle.ts`** — the contract-side bundle that owns the probe schema, the emission pipeline, and the registry of valid `{{seedToken}}` values. This file's `why` fields and seed-token usage must stay consistent with what that bundle declares.
- **`src/modules/account/tests/integration/probes.test.ts`** — integration tests that execute these probes against a running server to verify the expected status codes and response envelopes.

## Notes

- The rate-limit probe is intentionally a single request object; the "send 10+ times" behavior lives in the runner/test, not in this file.
- All seeded credentials reference `{{seedAdmin*}}` / `{{seedUser*}}` tokens defined by the contract bundle — renaming a seed token there will silently break these probes (no compile-time check, since they're string literals).
- The bogus Bearer token (`not.a.real.token`) is a placeholder, not a real JWT; any string that fails signature verification will do.
