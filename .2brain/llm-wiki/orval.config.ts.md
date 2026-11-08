---
source: orval.config.ts
sha256: 5d0a191693d072ef00eb3265f262589dad6c2eac3224665c14d0096451f0aa75
generated_at: 2026-11-08T02:26:19.002234+00:00
model: ollama:qwen3.8:27b
---

# orval.config.ts

## Purpose

Configures Orval to generate TypeScript model types and Zod validators from `openapi.yaml`. The project is a backend that only consumes generated types (`@api/models`) and validators (`@api/schemas.zod`) — it does not use any HTTP-client or data-fetching hooks, so the `zod` client is the sole generation target.

## Key elements

- **`zodSchemas`** (default export via `defineConfig`) — the single config block; input is `./openapi.yaml`.
- **`output.mode: 'single'`** — all generated operation schemas land in one file rather than being split by tag.
- **`output.target: './api/schemas.zod.ts'`** — where the Zod validator module is written.
- **`output.schemas: './api/models'`** — directory for raw TypeScript model interfaces.
- **`output.client: 'zod'`** — generates types + validators only; no `fetch`/`axios`/`react-query` call functions.
- **`override.zod.strict`** (`{ query, body, response: true }`) — forces Zod `.strict()` on all three surfaces so unknown keys are *rejected* rather than silently stripped.
- **`override.zod.generateEachHttpStatus: true`** — emits one schema per documented status code (e.g. `Login200Response`, `Login422Response`) instead of a single success-only schema per operation.

## Relationships

No graph neighbors.

## Notes

- **`strict` is load-bearing.** Without it, Orval emits plain `zod.object({...})`, which Zod treats as *strip* mode: unknown keys are silently discarded. That makes the generated validator *weaker* than the OpenAPI contract and defeats the over-serialization guard in `tests/support/contract.ts`.
- **`generateEachHttpStatus` is load-bearing.** The contract-test harness and the fuzz suite (`tests/fuzz/endpoints.fuzz.test.ts`) validate *error* responses (401, 422) against their own declared shapes. Without this flag only the single success branch receives a schema.
- The `client` field is effectively documentation here: the only valid value for this project's needs is `'zod'`. Switching to `'hono'` (the other backend-oriented option) would pull in the Hono framework, which this repo does not use.
