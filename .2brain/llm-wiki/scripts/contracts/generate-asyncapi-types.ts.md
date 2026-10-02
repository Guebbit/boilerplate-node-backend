---
source: scripts/contracts/generate-asyncapi-types.ts
sha256: 279a2c6037ab64d8dc9db95f56f288ac9ccf281b9ef8436638f28db00ee10c26
generated_at: 2026-10-01T12:26:47.472148+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-asyncapi-types.ts

## Purpose

Code-generation script that reads the repo's `asyncapi.yaml` contract and emits `src/types/asyncapi.generated.ts` — TypeScript interfaces for event payloads, channel-namespace constant objects, SSE event-name→payload maps, and (in this backend copy) queue-payload Zod validators. It exists so that runtime event types are always derived from the single AsyncAPI source of truth rather than hand-maintained.

## Key elements

- **`resolveOutputPath()`** – Parses the required `--out` CLI flag; exits 1 if missing.
- **`checkOnly`** – Boolean flag (`--check`) that suppresses file writes and exits 1 on content mismatch, used as a CI gate.
- **`toPascalCase()`** – Sanitises arbitrary contract names into valid PascalCase identifiers.
- **`lastRefSegment()`** – Extracts the final path segment from an AsyncAPI `$ref` string.
- **`refToTypeName()`** – Converts a `$ref` to its generated TypeScript type name via `toPascalCase`.
- **`resolveMessagePayloadType()`** – Resolves a message name to its actual payload type (never the possibly-deduped alias), returning `'unknown'` when undeclared.
- **`collectChannelMessageEntries()`** – Filters channels by a predicate and returns sorted `{channelName, messageType}` pairs.
- **`channelProtocols()`** – Resolves a channel's `servers` bindings to their `protocol` values.
- **`channelPayloadSchemaNames()`** – Returns all resolved payload schema names for a channel's messages.
- **`renderLiteralArray()`** – Emits a `readonly string[] as const` export.
- **`renderPayloadMap()`** – Emits a `Record`-style interface mapping event names to payload types.
- **`toConstantKey()`** – Converts a namespaced channel name to a `SCREAMING_SNAKE` object key.
- **Interfaces** – `AsyncApiChannel`, `AsyncApiMessage`, `AsyncApiServer`, `JsonSchema`, `AsyncApiDocument` model the subset of AsyncAPI 3.0 the generator reads.
- **`ROOT` / `INPUT` / `OUTPUT`** – Resolved paths; `INPUT` is always `<repo-root>/asyncapi.yaml`.

## Relationships

This file is a leaf script with no project-internal imports. Its only external dependency is `@asyncapi/modelina` (used for the Modelina TypeScript interface generation). It is invoked via `tsx` from a package.json script or CI step; it has no graph neighbors within the repo.

## Notes

- **Shared but diverged.** A near-twin copy lives in the frontend repo. Both share the channel/message-naming machinery, but the backend copy emits Zod validators for queue payloads while the frontend emits an inlined JSON-Schema map for SSE-frame validation. Keep fixes in lockstep by hand until a shared package extracts the common code.
- **Input asymmetry.** The backend generates from the *whole* contract; the frontend generates from the *public* subset. Only the backend output carries queue-payload types.
- **`x-transport` vendor extension.** SSE channels are identified by `x-transport: 'sse'` rather than by which `servers` they bind to, because in AsyncAPI 3.0 a channel omitting `servers` binds to *every* server and the two become indistinguishable.
- **`Object.hasOwn` guards.** Several lookups use `Object.hasOwn` instead of nullish checks on index access. This is deliberate: `Record<string, T>` tells TypeScript the value is always present, so `no-unnecessary-condition` would reject `?.` guards. The `hasOwn` pattern is the only way to express "this key might not exist" without a lint error.
- **ESM only.** The script uses `import.meta.url` (not `__dirname`) and must be run with `tsx` or an ESM-capable runtime.
- **`--check` is idempotent and non-destructive.** It reads, generates in memory, compares, and exits — safe to run in CI before or after a build step.
