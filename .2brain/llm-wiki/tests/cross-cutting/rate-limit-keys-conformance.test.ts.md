---
source: tests/cross-cutting/rate-limit-keys-conformance.test.ts
sha256: 700456ce872937c895c0b6c910ccd10b651f1b0acf243e6c674a4a8f3e8e5a71
generated_at: 2026-10-29T06:48:56.683281+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/rate-limit-keys-conformance.test.ts

## Purpose

Cross-cutting conformance test that verifies the TypeScript rate-limit key generators produce byte-identical output to their PHP twin, using a shared set of cases defined in `shared/cases/rate-limit-keys.cases.yaml`. This guarantees that rate-limiting budgets partition identically across the two service implementations.

## Key elements

- **`keyCase`** — Zod discriminated-union schema (discriminant: `kind`) describing three case shapes:
  - `address`: an IP string and its expected key (validates express-rate-limit's default `ipKeyGenerator`).
  - `block`: an optional IP and expected key (validates `addressBlockOf`).
  - `identity`: a root/pseudonym key, an IP, an optional body, and expected key (validates `identityOf`).
- **`describeCases('rate-limit-keys', keyCase, 20, …)`** — Entry point (from the shared-case harness) that loads up to 20 YAML cases and asserts each key generator returns the expected string via a `switch` on `one.kind`.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Supplies the two custom functions under test: `addressBlockOf` (block-level key) and `identityOf` (identity-level key). The test is its primary conformance guard.
- **`tests/support/cases.ts`** — Provides `caseBase` (shared Zod fields like case name/description, extended per variant) and `describeCases` (the runner that loads the YAML file and drives per-case assertions).
- **`tests/support/environment.ts`** — Provides `setEnvironment`, used in the `identity` branch to inject `NODE_PSEUDONYM_KEY` before calling `identityOf`.
- **`tests/support/stub.ts`** — Provides `asStub<Request>(…)`, which wraps a plain object into a minimal Express `Request` so the key functions can be called without a live HTTP server.

## Notes

- The `address` case does **not** call a custom function; it asserts against `express-rate-limit`'s built-in `ipKeyGenerator` (IPv6 /56 mask) to pin the default key contract.
- In the `identity` case, `setEnvironment` mutates process state before each assertion — case ordering from the YAML file is therefore significant if cases depend on distinct `NODE_PSEUDONYM_KEY` values.
- The `ip` field is optional in the `block` variant, meaning some block keys are independent of the client address (e.g., a static bucket key).
