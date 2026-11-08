---
source: tests/cross-cutting/security-headers-conformance.test.ts
sha256: 65701ba9d6c88468dbf3c003fb058f28dc9d6f6377f3c57f7b41bef7928aa628
generated_at: 2026-11-08T09:32:24.565811+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/security-headers-conformance.test.ts

## Purpose

Conformance test that asserts the `installSecurity` Express middleware emits the exact set of security headers defined in the shared PHP twin case file (`shared/cases/security-headers.cases.yaml`). It runs each case against a bare Express app with *only* the security middleware installed, so no route logic can add, override, or hide a header.

## Key elements

- **`headerCase`** – Zod schema (extends `caseBase`) describing a single case: `header` (name to check), `value` (expected value), `absent` (boolean flag meaning the header must not be present).
- **`answerHeaders()`** – Builds a minimal Express app, calls `installSecurity(app)`, registers one GET `/probe` route that returns `{}`, fires a `supertest` request, and resolves with the response `headers` object.
- **`describeCases('security-headers', …)`** – Iterates every YAML case, looks up `headers[one.header.toLowerCase()]`, and asserts either `undefined` (when `absent === true`) or strict equality with `one.value`.

## Relationships

- **`src/app/security.ts`** – Source of `installSecurity`, the middleware whose header output is under test. The test treats it as a black box: it must set (or omit) each header independently of any route.
- **`tests/support/cases.ts`** – Provides `caseBase` (the common Zod base for all cross-cutting cases) and `describeCases` (the runner that loads `shared/cases/security-headers.cases.yaml` and wires each record into a `vitest` `it` block).

## Notes

- The app is intentionally bare (single `/probe` route, no other middleware). If a developer accidentally adds a route that sets its own `Content-Security-Policy` or similar, this test will still pass because it only inspects the *response* headers—so a regression that hides a middleware header behind a route-level `res.removeHeader` would also be caught, but a regression that *adds* a non-security header would not.
- Header lookup is case-insensitive (`toLowerCase()`), matching how `supertest`/Node normalises them in the response object, while the YAML cases may use any casing.
- The case file lives in a shared (`shared/cases/`) directory shared with the PHP implementation; both stacks must produce identical answers for the same case.
