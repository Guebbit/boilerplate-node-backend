---
source: tests/cross-cutting/rate-limit-keys-conformance.test.ts
sha256: add71fa19bc58a5d16770cf06b3a55ebba4de85581cd6b862be8d165bd168a1e
generated_at: 2026-11-08T09:30:42.447152+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/rate-limit-keys-conformance.test.ts

## Purpose

Conformance test that verifies the TypeScript rate-limit key generators (`addressBlockOf`, `identityOf`, and the `express-rate-limit` default `ipKeyGenerator`) produce byte-identical keys to the PHP twin, using a shared YAML case file (`shared/cases/rate-limit-keys.cases.yaml`). It exists to prevent the two implementations from drifting apart.

## Key elements

- **`keyCase`** – A Zod discriminated union (on `kind`) defining the three case shapes:
  - `address`: raw IP string → expected key (tests `ipKeyGenerator`).
  - `block`: optional IP → expected key (tests `addressBlockOf`).
  - `identity`: root pseudonym key, IP, optional body → expected key (tests `identityOf`).
- **`describeCases('rate-limit-keys', keyCase, …)`** – Loads the shared YAML cases and runs the assertion block for each. The inner `switch` dispatches on `one.kind` and asserts the generated key equals the expected `one.key`.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** – Source of the functions under test: `addressBlockOf` and `identityOf`.
- **`tests/support/cases.ts`** – Provides `caseBase` (the shared Zod base schema) and `describeCases` (the YAML-driven test runner).
- **`tests/support/environment.ts`** – `setEnvironment` is called to inject `NODE_PSEUDONYM_KEY` before each `identity` assertion.
- **`tests/support/stub.ts`** – `asStub<Request>` builds a minimal Express `Request` object so the key functions can be called without a live server.

## Notes

- The `address` case does **not** test a function from `rate-limit.ts`; it pins the well-known IPv6 /56 behavior of `ipKeyGenerator` from `express-rate-limit`, acting as a baseline the PHP twin must also match.
- The `identity` case mutates the environment (`setEnvironment`) inside the assertion loop. Cases are assumed to be independent; if a future case relies on a previously set `NODE_PSEUDONYM_KEY` it will silently pass/fail incorrectly.
- The `block` case allows `ip` to be `undefined`, exercising the fallback path in `addressBlockOf`.
