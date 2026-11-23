---
source: orval.config.ts
source_sha256: bdceae38555706e0b0567f48655b430df30f5e28b2fef7ccca507145c01f129d
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T01:40:28.910274+00:00
model: claude-code:claude-sonnet-5-5
---

# orval.config.ts

## Purpose
Orval configuration that generates TypeScript model types and Zod validators from `openapi.yaml`. The project only consumes generated types and Zod schemas (no in-repo HTTP client), so a single `zod` client block covers everything.

## Key elements
- **Default export (`defineConfig`)**: declares one target, `zodSchemas`, with input `./openapi.yaml`.
- **`mode: 'single'`**: all generated Zod code goes into a single output file, set by `target`.
- **`target`**: the output path of the generated Zod schemas, under `./api.generated/` (a generated artifact, not a source file in the repo).
- **`schemas: './api.generated/models'`**: raw model interfaces are emitted here, regardless of client choice.
- **`client: 'zod'`**: generates schemas and types only, with no call functions. Other clients (fetch, axios, react-query, hono, mcp, etc.) are documented in comments as not applicable.
- **`override.zod.strict`**: `{ query: true, body: true, response: true }`. Unknown keys are rejected rather than silently stripped by Zod. Strict response makes the contract test an over-serialization guard, and strict query turns undeclared parameters into a 422.
- **`override.zod.generateEachHttpStatus: true`**: emits one schema per documented status (e.g. `Login200Response`, `Login422Response`), so error responses can be validated too.

## Relationships
No graph neighbors; the file imports only `defineConfig` from the `orval` package. Its comments mention consumers of the generated output (type and validator import aliases, a contract test helper, and a fuzz test suite), but the config does not reference or depend on them directly.

## Notes
- The strict settings rely on the spec's fragments declaring `additionalProperties: false`. Without `strict`, orval emits a plain `zod.object`, which would be weaker than the contract.
- Changing `client` away from `'zod'` would only make sense if something in-repo consumed the generated callers.
- The `hono` client requires Hono, not Express, according to the comments.
