---
source: scripts/contracts/generate-asyncapi-types.ts
sha256: 2783499774ebe09030ab59b089cda207d112a635b681c7a3847a6230392fd3cc
generated_at: 2026-09-23T17:22:46.643442+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-asyncapi-types.ts

## Purpose

Generates the TypeScript realtime contract types (payload interfaces, message aliases, channel-namespace constants/unions, SSE payload maps, and Zod schema wrappers) from the repository's `asyncapi.yaml`. It exists so that a single contract document is the source of truth for both runtime type-checking and validation, and so that a `--check` mode can gate CI against shipping stale types. The script is intentionally kept **byte-identical** across the paired frontend/backend repos; only the input contract differs (full vs. public subset).

## Key elements

- **`INPUT` / `OUTPUT`** — Resolves `asyncapi.yaml` at the repo root and the `--out <path>` CLI argument (required; exits 1 if missing).
- **`checkOnly`** — When `--check` is present, the script compares generated output against the existing file and exits 1 on mismatch without writing.
- **`resolveMessagePayloadType`** — Resolves a message name to its actual payload type name (never the possibly-deduped message alias). Uses `Object.hasOwn` to guard against undeclared messages.
- **`collectChannelMessageEntries`** — Filters channels by prefix (e.g. `observability.`) and maps each to its payload type, returning a sorted array.
- **`renderChannelNamespace`** — Emits a `SCREAMING_SNAKE` constant object and a union type per channel namespace (discovered dynamically from the contract's first dot-segment).
- **`renderPayloadMap`** — Emits an interface mapping channel names to their payload types (used for SSE event maps).
- **`zodExpression`** — Recursively renders a JSON-Schema node as a Zod expression. Deliberately narrow; **throws** on constructs it does not cover rather than emitting `z.unknown()`.
- **`messageTypeBlocks`** — Generates `export type Alias = PayloadType;` lines, skipping self-referential aliases.
- **`generator`** (`TypeScriptGenerator` from `@asyncapi/modelina`) — Produces the payload interfaces from the spec text with `PascalCase` naming, `interface` model type, and `union` enum type.

## Relationships

- **`scripts/contracts/asyncapi-bundles.ts`** (upstream) — Produces the bundled `asyncapi.yaml` at the repo root that this script reads. The header comment explicitly notes this generator reads "the bundled root contract … never a module fragment," indicating it consumes the output of the bundling step rather than any per-module fragment.

## Notes

- **Shared-script invariant:** The file must remain byte-identical in both repos. Change it in one, copy it to the other, or generated outputs drift. The only intentional difference between repos is the _input_ contract (full vs. public subset).
- **ESM context:** Uses `import.meta.url` (not `__dirname`) to resolve the repo root; the script is a `.ts` file run via `tsx`.
- **`no-unnecessary-condition` guard:** `resolveMessagePayloadType` uses `Object.hasOwn` instead of a nullish check because the `Record<string, AsyncApiMessage>` type assertion makes `?.` redundant to the type checker; without the guard the build fails under `no-unnecessary-condition`.
- **Zod emitter is intentionally incomplete:** It covers only the constructs present in current worker payload schemas and throws on anything else. This is by design — a silent `z.unknown()` would mask a contract that outgrew the emitter.
- **Modelina reads the spec text directly** for interface generation; the `components.schemas` field in `AsyncApiDocument` is read only by the Zod emitter path.
