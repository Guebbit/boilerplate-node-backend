---
source: scripts/contracts/generate-asyncapi-types.ts
sha256: d0c102547078b08be29d9a4f81789ad08cfd7df8e32d543ce1be45b6a1fda14b
generated_at: 2026-10-15T09:37:39.447394+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-asyncapi-types.ts

## Purpose

Generates the backend repo's TypeScript realtime contract types (payload interfaces, message aliases, per-namespace channel constants, SSE event maps, and queue-payload Zod validators) from the bundled `asyncapi.yaml`. It exists so that a contract change forces a regeneration rather than letting stale hand-written types ship. The `--check` flag turns it into a CI gate: writes nothing, exits 1 if the on-disk file would differ.

## Key elements

- **`AsyncApiDocument`, `AsyncApiChannel`, `AsyncApiMessage`, `AsyncApiServer`, `JsonSchema`** — narrow structural interfaces describing the subset of the AsyncAPI 3.0 spec this script actually reads (channels, messages, servers, payload schemas, and the `x-transport` vendor extension).
- **`toPascalCase` / `lastRefSegment` / `refToTypeName`** — name-resolution utilities that turn `$ref` strings into generated TypeScript identifiers.
- **`resolveMessagePayloadType`** — resolves a message key to its *payload* type name (not the message alias, which Modelina may dedupe away). Uses `Object.hasOwn` as the presence guard.
- **`collectChannelMessageEntries`** — filters channels by a data-driven predicate (transport or server binding) and returns sorted `{ channelName, messageType }` pairs.
- **`channelProtocols` / `channelPayloadSchemaNames`** — resolve a channel's reachable server protocols and payload schema names, respectively.
- **`renderLiteralArray` / `renderPayloadMap` / `toConstantKey`** — emit TypeScript source for `as const` string arrays, typed event→payload map interfaces, and SCREAMING_SNAKE namespace keys.
- **`TypeScriptGenerator`** (from `@asyncapi/modelina`) — builds the payload interfaces directly from the spec text.
- **`ROOT`, `INPUT`, `OUTPUT`** — resolved paths for the bundled contract, the script's own location (ESM via `import.meta.url`), and the `--out` target.

## Relationships

- **`scripts/cli.ts`** — imports `requiredPath` to parse and validate the `--out` CLI argument against the repo root.
- **`scripts/contracts/generated-file.ts`** — imports `writeOrCheck`, which handles both the write-to-disk path and the `--check` compare-and-exit-1 path, so this script never calls `fs.writeFileSync` directly.

## Notes

- **Diverged twin.** The frontend repo keeps a parallel copy of this script that also emits an inlined JSON-Schema map for runtime SSE-frame validation; this backend copy emits queue-payload Zod validators instead. Both share the input format and channel/message-naming logic. A fix to either half must be mirrored in the other by hand until the generator is extracted into a shared package.
- **Input scope differs per repo.** This backend copy generates from the *whole* contract (hence queue payloads); the frontend copy uses only the public subset.
- **`Object.hasOwn` guards.** `Record<string, T>` typing makes a plain index access "always present" to TypeScript, and `no-unnecessary-condition` would flag `?.` or truthiness checks. The script therefore uses `Object.hasOwn` explicitly wherever a key might be absent.
- **Channel selection is data-driven, not name-driven.** Whether a channel is SSE vs. queue is decided by its declared transport (`x-transport` extension) or its `servers` binding — never by a name prefix — so renaming a channel does not silently change classification.
- **ESM.** The script runs under `tsx` as ESM; `ROOT` is derived from `import.meta.url`, not `__dirname`.
