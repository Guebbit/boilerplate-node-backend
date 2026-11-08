---
source: tests/cross-cutting/request-headers-conformance.test.ts
sha256: 38089f7e2a57e3bc86ad80434fe33d83d1cb3670981d5cfb308d4cdddd630ab4
generated_at: 2026-11-08T09:31:17.564270+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/request-headers-conformance.test.ts

## Purpose

Runs a shared set of YAML-defined cases (referenced as `shared/cases/request-headers.cases.yaml`) against the Node HTTP layer's two header readers — `preconditionOf` and `requestIdMiddleware` — to guarantee they produce the same observable results as their PHP twin.

## Key elements

- **`headerCase`** (zod discriminated union) – Schema describing one test case. Two `kind` variants:
  - `if-match`: supplies an optional `If-Match` header value and expects one of `unconditional | any | tags` (plus an optional `tags` array).
  - `request-id`: supplies an optional `x-request-id` header, a `trustedIngress` flag, and expected `clientRequestId` (`kept`/`dropped`) and `requestId` (`client`/`generated`) outcomes.
- **`requestWith(name, value)`** – Helper that returns a minimal Express `Request` stub whose `.get()` matches a single header name case-insensitively and returns the given value (or `undefined`).
- **`describeCases('request-headers', headerCase, …)`** – The test body. For each loaded YAML case it either:
  - calls `preconditionOf` and asserts the three-way outcome (and exact tag list), or
  - sets `NODE_TRUSTED_INGRESS`, invokes `requestIdMiddleware` with a stubbed `Response`, and asserts `request.clientRequestId`, `request.requestId`, and the `x-request-id` response header.

## Relationships

- **`src/infrastructure/http/preconditions.ts`** – Exports `preconditionOf`, the function exercised by the `if-match` cases.
- **`src/app/request-context.ts`** – Exports `requestIdMiddleware`, the function exercised by the `request-id` cases.
- **`tests/support/cases.ts`** – Provides `caseBase` (shared zod fields) and `describeCases` (the loader/runner that reads the YAML file and drives per-case assertions).
- **`tests/support/environment.ts`** – Provides `setEnvironment`, used to flip `NODE_TRUSTED_INGRESS` per case before calling the middleware.
- **`tests/support/stub.ts`** – Provides `asStub`, used to build the minimal `Request` and `Response` objects without a real HTTP server.

## Notes

- The file is labelled *cross-cutting* because the same YAML cases are consumed by a PHP test; any change to the expected values must keep both sides in lockstep.
- `requestWith` lowercases both the incoming and requested header names, so callers can pass `'If-Match'` while the code queries `'if-match'`.
- For `request-id` cases the test inspects properties *mutated onto* the request object (`clientRequestId`, `requestId`) rather than returning a value, so the stub must be the same object reference passed to the middleware.
- The `if-match` mapping (`undefined → 'unconditional'`, `etags === 'any' → 'any'`, otherwise `'tags'`) is an assertion-side translation; `preconditionOf` itself returns the raw structure.
