---
source: scripts/contracts/generate-asyncapi-types.ts
generated_at: 2026-11-22T01:56:13.827730+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/generate-asyncapi-types.ts

## Purpose
A CLI script that reads the bundled root `asyncapi.yaml` and generates the TypeScript realtime contract types into the file given by `--out`. It uses Modelina to build the payload interfaces and also emits message aliases, channel constants and unions, SSE event maps, and, in the backend copy only, domain-event lists, payload maps and Zod validators. The file exists so the repo cannot ship types for a contract it no longer has: `--check` writes nothing and exits 1 on a mismatch.

## Key elements
- **Imports from `@asyncapi/modelina`**: `TypeScriptGenerator`, `TS_DESCRIPTION_PRESET`, `typeScriptDefaultModelNameConstraints` and `OutputModel`. The visible code imports these for building the TS interfaces.
- **`AsyncApiChannel`, `AsyncApiMessage`, `AsyncApiServer`, `JsonSchema`, `AsyncApiDocument`**: minimal interfaces for the slice of AsyncAPI 3.0 the script reads.
- **`INPUT`**: absolute path to `asyncapi.yaml` under `REPO_ROOT`.
- **`OUTPUT`**: absolute output path, taken from `--out` via `requiredPath`.
- **`toPascalCase`**: sanitizes a source name into a `PascalCase` identifier.
- **`lastRefSegment`**: returns the raw last path segment of a `$ref`.
- **`refToTypeName`**: turns a `$ref` into a generated type name by applying `toPascalCase` to its last segment.
- **`resolveMessagePayloadType`**: returns the payload type name a message resolves to, or `'unknown'` if the message is undeclared or has no payload `$ref`. It is shared by the SSE payload map and the alias declarations so the two cannot disagree.
- **`collectChannelMessageEntries`**: builds sorted `{channelName, messageType}` entries for the channels a caller-supplied `select` predicate picks. The channel name is `channel.address` when set, otherwise the channel key.
- **`channelProtocols`**: returns the protocols of the servers a channel explicitly binds to.
- **`channelPayloadSchemaNames`**: returns every resolved payload schema name for a channel, dropping `'unknown'`.
- **`renderLiteralArray`**: renders a readonly literal string array export. The visible part of the file ends partway through this function.

## Relationships
- `scripts/cli.ts`: supplies `requiredPath`, which parses the `--out` argument into `OUTPUT`.
- `scripts/modules-on-disk.ts`: supplies `REPO_ROOT`, the base for resolving `asyncapi.yaml` and the output path.
- `scripts/contracts/generated-file.ts`: supplies `writeOrCheck`, which handles writing the generated file or, with `--check`, comparing it.

## Notes
- This is a shared script that exists in two differing copies, one in the backend repo and one in the frontend repo. A fix to the shared machinery (input format, channel and message naming) must be applied by hand to both.
- The backend generates from the whole contract, the frontend from the public subset, so only the backend output carries the queue payloads. The frontend copy emits an inlined JSON Schema map for runtime SSE-frame validation instead of Zod validators.
- A schema carrying `x-openapi-schema: <Name>` is imported from the REST models rather than redeclared. Only that marker decides.
- Channel selection is data-driven, never by name prefix. It uses the `x-transport` extension (`sse`, `outbox`, `in-process`) and the server bindings. A channel that omits `servers` is excluded by `channelProtocols`, not guessed at.
- Lookups into `components.messages` and `document.servers` use `Object.hasOwn` instead of nullish checks. `Record<string, T>` types every key as present, so a nullish guard would fail the `no-unnecessary-condition` lint rule.
- Usage: `tsx scripts/contracts/generate-asyncapi-types.ts --out <path> [--check]`.
