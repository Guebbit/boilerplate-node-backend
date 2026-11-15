---
source: scripts/contracts/generate-asyncapi-types.ts
sha256: 5bcdf638ca0102f566a8458b1b4a143e8960ac6b7c7e5d986fc02ab979153151
generated_at: 2026-11-14T17:24:36.354841+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-asyncapi-types.ts

## Purpose

Generates the backend's TypeScript realtime contract types (`src/types/asyncapi.generated.ts`) from `asyncapi.yaml`. It reads the full AsyncAPI 3.0 document and emits payload interfaces, message aliases, per-namespace channel constants/unions, SSE event-name/payload maps, and queue-payload Zod validators. A `--check` flag supports CI gating (writes nothing, exits 1 on drift).

## Key elements

- **`INPUT` / `OUTPUT`** — Resolved paths: `asyncapi.yaml` from repo root, and the generated file from the `--out` CLI arg.
- **`toPascalCase` / `lastRefSegment` / `refToTypeName`** — Naming utilities that convert `$ref` fragments into TS identifiers.
- **`resolveMessagePayloadType`** — Resolves a message key in `components.messages` to its actual payload schema type name (or `'unknown'`). Central to avoiding deduped alias names.
- **`collectChannelMessageEntries`** — Builds sorted `{channelName, messageType}` pairs filtered by a caller-supplied predicate (transport or server binding), not by name prefix.
- **`channelProtocols`** — Resolves the protocols a channel reaches via its explicit `servers` bindings.
- **`channelPayloadSchemaNames`** — Collects the payload schema names behind a channel's messages (used by the Zod validator emitter).
- **`renderLiteralArray` / `renderPayloadMap`** — Emit `as const` string arrays and typed event→payload map interfaces.
- **`toConstantKey`** — Converts a channel name to a `SCREAMING_SNAKE` object key under a namespace prefix.
- **Interfaces** (`AsyncApiDocument`, `AsyncApiChannel`, `AsyncApiMessage`, `AsyncApiServer`, `JsonSchema`) — Narrow structural types the generator reads from the YAML; intentionally omit everything else.
- **CLI contract** — `tsx … --out <path> [--check]`.

## Relationships

- **`scripts/cli.ts`** — Imports `requiredPath` to parse and validate the `--out` argument.
- **`scripts/contracts/generated-file.ts`** — Imports `writeOrCheck`, which handles the write-or-verify output logic (used by `--check`).
- **`scripts/modules-on-disk.ts`** — Imports `REPO_ROOT` to anchor the `INPUT` and `OUTPUT` path resolutions.

## Notes

- **Shared with a frontend copy.** Both repos started byte-identical; they have diverged (backend emits Zod queue validators, frontend emits an inlined JSON-Schema map). Any fix to channel/message-naming logic must be applied to both copies by hand until the generator is extracted to a shared package.
- **Input scope differs.** Backend reads the *whole* contract (includes queue payloads); frontend reads only the public subset.
- **`x-transport` vendor extension** distinguishes SSE channels because AsyncAPI 3.0 channels omitting `servers` bind to *all* servers, making server-binding alone ambiguous.
- **`Object.hasOwn` guards** are used in place of `?.` index access because `Record<string, T>` typing makes a plain index read always-present to TS, and the `no-unnecessary-condition` rule would flag the guard otherwise.
- Schemas carrying an `x-openapi-schema: <Name>` marker are imported from the REST model types rather than redeclared by Modelina.
- Unused exports are harmless: type-only in the backend, tree-shaken in the frontend.
