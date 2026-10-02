---
source: orval.config.ts
sha256: 46b9e3515a726ea070ae7899754b90da536ae50ea5e03401d9e3958c58d24d42
generated_at: 2026-10-01T12:19:04.825250+00:00
model: ollama:qwen3.8:27b
---

# orval.config.ts

## Purpose
Orval build configuration that generates typed TypeScript models and Zod validators from `openapi.yaml`. It produces only the `zod` client flavor (schema/type definitions) because the project consumes generated types and validators but has no in-repo HTTP-client caller.

## Key elements
- **`zodSchemas` block** — the sole Orval entry; points `input` at `./openapi.yaml`.
- **`output.mode: 'single'`** — all generated operations land in one file rather than being split by tag.
- **`output.target: './api/schemas.zod.ts'`** — where Zod validators are emitted (aliased as `@api/schemas.zod`).
- **`output.schemas: './api/models'`** — where raw model interfaces/types are emitted (aliased as `@api/models`).
- **`output.client: 'zod'`** — restricts generation to schemas/types only; no `fetch`, `axios`, `react-query`, `hono`, or `mcp` code is produced.
- **`override.zod.strict: { body: true, response: true }`** — makes every generated Zod object `strict()`, so unknown keys are *rejected* rather than silently stripped.
- **`override.zod.generateEachHttpStatus: true`** — emits a separate schema per documented HTTP status (e.g. `Login200Response`, `Login422Response`) instead of only the success branch.

## Relationships
No graph neighbors are recorded for this file. It is a leaf configuration consumed by the Orval CLI; its outputs (`./api/schemas.zod.ts`, `./api/models/*`) are the only coupling point to the rest of the codebase.

## Notes
- `strict` is load-bearing: without it, generated validators are *weaker* than the OpenAPI contract (Zod silently strips unknown keys instead of rejecting them). The contract-test suite in `tests/support/contract.ts` relies on this strictness as an over-serialization guard.
- `generateEachHttpStatus` is required by both `tests/support/contract.ts` and the fuzz suite (`tests/fuzz/endpoints.fuzz.test.ts`), which need to validate **error** responses (401, 422) against their declared shapes, not just 2xx.
- The extensive inline comments document why each option was chosen and what the alternatives (`fetch`, `react-query`, `hono`, `mcp`, `tags-split`, etc.) would imply — they serve as a decision log for anyone considering a mode change.
