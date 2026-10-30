---
source: tests/support/body-of.ts
sha256: 59b19673fe99c84ba7bd68cf08685626e4d61f8973baa887ccf0a720a750c1ff
generated_at: 2026-10-29T07:06:19.195116+00:00
model: ollama:qwen3.8:27b
---

# tests/support/body-of.ts

## Purpose

A single test helper that pairs a supertest response with its per-status Zod schema (from `@api/schemas.zod`): it asserts the HTTP status matches the one encoded in the schema's name, parses the body through the schema, and returns the result typed by `zod.infer`. This lets journey tests read response fields with full type safety while catching contract drift at compile time.

## Key elements

- **`STATUS_BY_SCHEMA`** (module-private) — A `ReadonlyMap<unknown, number>` built at import time. For every export in `@api/schemas.zod`, it extracts the three-digit status from the schema name (e.g. `Login200Response` → `200`) and maps the schema object to that number.
- **`bodyOf(response, schema)`** (exported) — The only public function. Accepts a `{ status, body }` supertest-like object and a Zod schema. Throws if the schema is not a per-status response schema, if the status differs, or if the body fails `schema.parse`. Otherwise returns the parsed, fully-typed body.

## Relationships

- **Journey integration tests** (`a-receiver-that-stays-down.test.ts`, `bought-returned-refunded.test.ts`, `the-hold-that-was-never-paid.test.ts`, `the-provider-disagrees.test.ts`, `an-accounts-whole-security-life.test.ts`, `an-integrator-start-to-finish.test.ts`, `quiet-for-three-years.test.ts`, `social-login-with-a-second-factor.test.ts`) — Each imports `bodyOf` to assert API responses at individual journey steps, tying the test to the schema contract.
- **`tests/unit/support/body-of.test.ts`** — Unit-tests the helper itself (status-mismatch errors, parse failures, type inference).
- **`@api/schemas.zod`** — The sole external source of schemas; the helper's behavior is entirely driven by that package's export naming convention.

## Notes

- Status identification relies entirely on the **naming convention** `*<DDD>Response`. If a schema export does not match the regex `(\d{3})Response$`, it is silently excluded from `STATUS_BY_SCHEMA`, and passing it to `bodyOf` throws at runtime rather than at compile time.
- The map is keyed by the **schema object identity** (not by name), so it is not safe to spread or clone the schema before passing it in.
- `bodyOf` does **not** import or depend on `altcha.ts` or `journey-orders.ts`; those appear as graph neighbors because journey tests that also import `bodyOf` share the same test file, not because of a direct import.
