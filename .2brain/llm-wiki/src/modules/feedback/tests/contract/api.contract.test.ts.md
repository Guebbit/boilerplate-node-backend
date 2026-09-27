---
source: src/modules/feedback/tests/contract/api.contract.test.ts
sha256: 256c867b653cb23256af76b2612dd09478e300909cd42db26e42319f5f430f3c
generated_at: 2026-09-27T14:54:05.976496+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/contract/api.contract.test.ts

## Purpose

Contract tests for every `/feedback` route, asserting that both success and error responses conform to the OpenAPI spec (`toSatisfyApiSpec()`). Covers the single public write endpoint (`POST /feedback/contact`), two admin-only read/search endpoints (`GET /feedback`, `POST /feedback/search`), and two admin mutation endpoints (`PUT`/`PATCH /feedback/{id}`). Also guards that the public response leaks no admin fields and that admin routes reject unauthenticated callers.

## Key elements

- **`CONTACT_PAYLOAD`** — fixed test payload (name, email, subject, message) used for every submission.
- **`createFeedbackRequest()`** — helper that `POST`s to `/feedback/contact` and returns the new record's `id`; throws on non-201. Records are created this way (no fixture builder) so the asserted payload is the app's real output.
- **`describe('POST /feedback/contact')`** — valid submission, initial `new` status, optional `name`, malformed email, missing `message`, and the 5000-char `message` length limit.
- **`describe('GET /feedback')`** — admin list (populated and empty), out-of-range pagination (`pageSize=500`, `page=0`), and invalid `status` enum value.
- **`describe('POST /feedback/search')`** — body-based filter, same pagination and enum-error parity with the query form.
- **`describe('PUT /feedback/{id}')`** — full replace: status+notes set, omitted optional field cleared, missing required `status` → 422, bad enum → 422, unknown id → 404.
- **`describe('PATCH /feedback/{id}')`** — partial update: omitted field preserved, explicit `null` clears, empty-string `adminNotes` rejected, unknown id → 404.

## Relationships

- **`tests/support/contract.ts`** (`@tests/contract`) — registers the `toSatisfyApiSpec()` custom matcher used in every assertion.
- **`tests/support/http.ts`** (`@tests/http`) — provides `api()` (a superagent-style HTTP client pointed at the test server) and `authenticateAs()` (returns a bearer token for the given role).
- **`tests/support/ids.ts`** (`@tests/ids`) — supplies `MISSING_ID`, a guaranteed-nonexistent identifier used in 404 tests.
- **`tests/support/setup-test-db.ts`** (`@tests/setup-test-db`) — `setupTestDb()` initialises a clean database per test run; called once at module top level.

## Notes

- **PUT vs PATCH semantics are explicitly tested:** PUT omits → field cleared (RFC 9110 §9.3.4); PATCH omits → field preserved, only explicit `null` clears. `adminNotes: ''` is rejected as 422, never treated as null.
- **Pagination bounds are pinned end-to-end** on both `GET /feedback?pageSize=500` and `POST /feedback/search` with the same body values, ensuring the two "spellings" of one search cannot disagree.
- The 5000-character message limit is enforced by the generated schema (originating in `openapi.yaml`); the test pins it rather than re-declaring the constant.
- The file is a side-effect module (no named exports); `setupTestDb()` runs at import time before any `describe` block executes.
