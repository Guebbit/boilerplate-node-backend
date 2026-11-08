---
source: scripts/contracts/generate-asyncapi-types.ts
sha256: 59415df60e9bfd8bcf3377dcd90facf091b115e7edb38ba1304d2f22cd1be3f8
generated_at: 2026-11-08T02:41:21.199425+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-asyncapi-types.ts

## Purpose

Backend code-generation script that reads `asyncapi.yaml` and emits `src/types/asyncapi.generated.ts` containing payload interfaces, message aliases, per-namespace channel constants/unions, SSE event-name/payload maps, and queue-payload Zod validators. It is the backend half of a two-repo shared generator (the frontend copy additionally inlines a JSON-Schema map for runtime SSE-frame validation). Supports `--check` mode for CI gating without writing.

## Key elements

- **`AsyncApiChannel` / `AsyncApiMessage` / `AsyncApiServer` / `JsonSchema` / `AsyncApiDocument`** — Narrow structural interfaces describing only the fields this generator reads from the AsyncAPI 3.0 document and its JSON Schema payloads.
- **`toPascalCase`** — Sanitises arbitrary contract names into valid `PascalCase` TS identifiers.
- **`lastRefSegment`** — Extracts the final path segment from a `$ref` string; shared by type-name resolution and server/message lookups.
- **`refToTypeName`** — Resolves a `$ref` to its generated TS type name via `toPascalCase(lastRefSegment(...))`.
- **`resolveMessagePayloadType`** — Given a message key, returns the *payload* type it references (never the message's own alias, which Modelina may dedupe). Guards with `Object.hasOwn` to satisfy `no-unnecessary-condition`.
- **`collectChannelMessageEntries(channels, messages, select)`** — Filters channels by a predicate (transport or server-binding, never name prefix) and returns sorted `{ channelName, messageType }` pairs.
- **`channelProtocols(channel, servers)`** — Resolves a channel's `servers` `$ref` bindings to their declared protocols.
- **`channelPayloadSchemaNames(channel, messages)`** — Collects all payload schema names a channel's messages resolve to.
- **`renderLiteralArray` / `renderPayloadMap`** — Emit TypeScript source for `as const` string arrays and event-name→payload map interfaces respectively.
- **`renderNamespaceConstant`** *(truncated in source)* — Converts dotted channel names under a namespace into `SCREAMING_SNAKE` keys inside a namespace constant.
- **`ROOT` / `INPUT` / `OUTPUT`** — Path constants; `INPUT` is always the repo-root `asyncapi.yaml`, `OUTPUT` comes from the `--out` CLI flag.
- **Main execution** *(truncated)* — Parses the YAML, invokes `@asyncapi/modelina`'s `TypeScriptGenerator` for payload interfaces, assembles the remaining exports, and calls `writeOrCheck`.

## Relationships

- **`scripts/cli.ts`** — Imports `requiredPath` to parse the required `--out` argument and resolve it against the repo root.
- **`scripts/contracts/generated-file.ts`** — Imports `writeOrCheck`, which either writes the generated file or, in `--check` mode, compares content and exits non-zero on mismatch.

## Notes

- **Two-copy invariant.** This backend copy and the frontend copy must stay in step by hand (no shared package yet). A fix to the channel/message-naming machinery in one must be mirrored in the other.
- **Input scope differs by repo.** Backend reads the *whole* contract (hence queue payloads appear); frontend reads only the public subset.
- **`x-openapi-schema: <Name>` marker.** Any schema carrying this vendor extension is expected to be re-exported from the REST models rather than re-declared; the generator respects this and does not emit a duplicate type.
- **ESM script.** Uses `import.meta.url` (not `__dirname`) for path resolution; run with `tsx`.
- **`--check` is a no-write gate.** It exits 1 if the on-disk generated file disagrees with what would be emitted, catching a repo that ships types for a contract it no longer has.
- **`Object.hasOwn` guards are intentional.** `Record<string, T>` signatures make TS treat every index access as always-present, so a plain truthiness check would fail `no-unnecessary-condition`. The guards are load-bearing for lint compliance, not optional safety.
- **Transport identification is data-driven.** Channels are classified by their `x-transport` vendor extension or explicit `servers` bindings—never by a name prefix—so renaming a channel does not silently reclassify it.
