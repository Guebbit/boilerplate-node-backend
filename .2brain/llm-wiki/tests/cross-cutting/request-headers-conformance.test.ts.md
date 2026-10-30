---
source: tests/cross-cutting/request-headers-conformance.test.ts
sha256: 9c8b42dcb40ed80d509c8f0b8756e28031a71c3d3eafbd9985fd68b027341d31
generated_at: 2026-10-29T06:49:28.917430+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/request-headers-conformance.test.ts

## Purpose

Cross-cutting conformance test that verifies the TypeScript header readers (`preconditionOf`, `requestIdMiddleware`) produce results identical to their PHP twin. Cases are sourced from a shared YAML file (`shared/cases/request-headers.cases.yaml`) so both services validate against the same fixtures.

## Key elements

- **`headerCase`** (zod discriminated union) — Schema defining two case shapes:
  - `if-match` cases: supply an optional `If-Match` header value and the expected precondition kind (`unconditional` / `any` / `tags`) plus expected tag list.
  - `request-id` cases: supply an optional `x-request-id` header, a `trustedIngress` flag, and the expected outcomes for client-id retention, ID source, and the response header.
- **`requestWith(name, value)`** — Builds a minimal `Express Request` stub whose `get()` returns `value` only for the named header (case-insensitive); all other header lookups return `undefined`.
- **`describeCases('request-headers', headerCase, 20, …)`** — Drives iteration over the YAML case file (up to 20 cases) and runs the appropriate assertion block per `kind`.

## Relationships

- **`src/infrastructure/http/preconditions.ts`** — Imports `preconditionOf`; the test calls it with a stubbed request to exercise `If-Match` parsing.
- **`src/app/request-context.ts`** — Imports `requestIdMiddleware`; the test invokes it with a stubbed request/response to exercise `x-request-id` handling and trusted-ingress logic.
- **`tests/support/cases.ts`** — Provides `caseBase` (shared zod fields: `id`, `description`, etc.) and `describeCases` (loads the YAML file and iterates cases as subtests).
- **`tests/support/environment.ts`** — Provides `setEnvironment` to flip `NODE_TRUSTED_INGRESS` per request-id case before calling the middleware.
- **`tests/support/stub.ts`** — Provides `asStub` to create the minimal `Request` and `Response` objects (the response stub captures `setHeader` calls into a plain record).

## Notes

- The test is intentionally "cross-cutting": it is the single source of truth for header-parsing semantics shared with the PHP service. Changing expectations here signals a contract change for both stacks.
- `requestWith` lowercases both the probe and the target header name, so header casing in the YAML fixtures does not matter.
- For `request-id` cases the test asserts **both** the mutated request object (`requestId`, `clientRequestId`) **and** the value written to the response header (`x-request-id`)—the middleware is expected to echo the final ID back to the client.
- `trustedIngress` is set via `setEnvironment` immediately before each middleware call; ensure any parallel or shared-environment test does not race on this variable.
