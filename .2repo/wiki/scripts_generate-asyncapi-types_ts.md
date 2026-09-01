# scripts/generate-asyncapi-types.ts

## Purpose

Generates the TypeScript realtime contract types (payload interfaces, message aliases, per-namespace channel constants and unions, SSE event/payload maps) from `asyncapi.yaml`. It is a **shared script** that must remain byte-identical across two paired repos (backend and frontend); the only difference between them is the input contract subset, so the backend output carries queue payloads while the frontend output does not.

## Key elements

- **`resolveOutputPath()`** – Parses the required `--out` CLI flag; exits 1 if missing.
- **`toPascalCase()` / `refToTypeName()`** – Normalize AsyncAPI names and `#/components/…` refs into PascalCase type identifiers.
- **`resolveMessagePayloadType(messageName, messages)`** – Single source of truth for "what payload type does this message actually carry." Returns `'unknown'` when the message is undeclared or has no `$ref` payload. Used by both the SSE payload map and the alias-dedup loop so neither can reference a type the other drops.
- **`collectChannelMessageEntries(channels, messages, prefix)`** – Collects `{ channelName, messageType }` pairs for channels under a given prefix (only `subscribe` operations).
- **`renderLiteralArray()` / `renderPayloadMap()`** – Emit `as const` readonly arrays and typed event-name → payload map interfaces.
- **`toConstantKey()` / `renderChannelNamespace()`** – Produce a `SCREAMING_SNAKE` key object (e.g. `OBSERVABILITY_CHANNELS`) and a corresponding union type per channel namespace.
- **`groupChannelsByNamespace()`** – Groups channel names by their first dot-segment, preserving contract order.
- **Message-alias dedup block** – Walks `components.messages`, emits one `export type X = Y;` per *distinct* payload target (skips self-referential aliases and repeats), so callers find a single message-level name per shape.
- **`buildOutput(modelBlocks)`** – Assembles the final generated file (truncated in source).
- **`--check` mode** – Compares generated output against the existing file; exits 1 on mismatch without writing. Acts as the CI gate preventing a repo from shipping types for a contract it no longer has.

## Relationships

- **`scripts/contracts/asyncapi-bundles.ts`** – Graph neighbor in the same `scripts/contracts/` area. This script reads `asyncapi.yaml` from the repo root at runtime; the bundles file is the contract-management neighbor that supplies or validates that input. There is no direct `import` between them; their coupling is the shared `asyncapi.yaml` artifact.

## Notes

- **Shared-script invariant:** Any edit must be copied verbatim to the paired repo, or the two generated outputs drift.
- **`Object.hasOwn` guard:** `resolveMessagePayloadType` deliberately uses `Object.hasOwn(messages, name)` instead of a nullish check on the index access. This is required because `Record<string, AsyncApiMessage>` makes TypeScript treat every index as present, so `no-unnecessary-condition` would reject a `?.` guard.
- **Namespace discovery is automatic:** New channel prefixes in the contract automatically get their own constant/union group—no script change needed.
- **Uses `Array.prototype.toSorted`** (ES 2023 / TS 5.7+); the runtime must support it.
- **Modelina is configured** with `interface` model type, `union` enum type, `rawPropertyNames`, and a custom `NAMING_FORMATTER` that routes through `toPascalCase`.
