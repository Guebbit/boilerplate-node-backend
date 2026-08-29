# scripts/generate-asyncapi-types.ts

## Purpose

CLI script (run via `tsx`) that generates the TypeScript realtime contract types from `asyncapi.yaml`. It is a **shared script** kept byte-identical in both repos of the pair; the only difference between the two is the input document (backend: full contract; frontend: public subset). It emits payload interfaces, message aliases, per-namespace channel constants/unions, and SSE event name/payload maps into `src/types/asyncapi.generated.ts`. A `--check` mode compares without writing, gating CI against stale types.

## Key elements

- **`resolveOutputPath()`** – parses the required `--out` flag and resolves it to an absolute path.
- **`toPascalCase` / `toModelName`** – converts AsyncAPI source names into PascalCase TypeScript identifiers.
- **`refToTypeName`** – maps a `#/components/…` `$ref` to its generated type name.
- **`formatPropertyKey`** – emits a valid TS property key (quoted if not a plain identifier).
- **`schemaToType(schema, depth)`** – recursive converter from a JSON Schema fragment to a TypeScript type string; handles `$ref`, `oneOf`/`anyOf`/`allOf`, `enum`, arrays, objects (with `required`, `additionalProperties`), and primitives.
- **`resolveMessagePayloadType(messageName, messages)`** – returns the *payload* type a message resolves to (not the message's own alias), guarding against undeclared messages via `Object.hasOwn`.
- **`collectChannelMessageEntries(channels, messages, prefix, operation)`** – filters channels by prefix and operation (`publish`/`subscribe`), resolves each to its payload type, returns a sorted entry list.
- **`renderLiteralArray(exportName, values)`** – emits a `readonly` `as const` string array.
- **`renderPayloadMap(interfaceName, entries)`** – emits an interface mapping channel names to payload types (used for SSE event maps).
- **`toConstantKey(channelName, prefix)`** – strips the namespace prefix and produces a `SCREAMING_SNAKE` key.
- **`renderChannelNamespace(namespace, channelNames)`** – emits a `NS_CHANNELS` const object and a `NsChannel` union type for one dot-segment namespace.
- **`resolveMessageGroups` / grouping logic** – groups channel names by first dot-segment to drive per-namespace rendering (discovered dynamically from the contract).
- **`@asyncapi/modelina` (`TypeScriptGenerator`)** – used for the model/alias generation portion; the script supplements it with the channel, SSE, and namespace logic above.

## Relationships

- **`scripts/contracts/asyncapi-bundles.ts`** – provides the AsyncAPI bundle/contract definitions that this script's generated types (in `src/types/asyncapi.generated.ts`) type-annotate. The two files sit on opposite sides of the same realtime contract: the bundle file describes the wire format; this script produces the compile-time types consumers import.

## Notes

- **Keep in sync across repos.** The script must remain byte-identical in both the backend and frontend repos. Edit in one, copy to the other, or the generated outputs will drift.
- **`--check` exits 1 on mismatch** without writing; wire it into CI to prevent shipping types for a contract the repo no longer carries.
- **`no-unnecessary-condition` lint:** `resolveMessagePayloadType` intentionally uses `Object.hasOwn` rather than a nullish guard because the `Record<string, AsyncApiMessage>` type signature makes a plain index-access guard look "always present" to the linter.
- **Tree-shaking / unused exports:** an export a given repo doesn't use is harmless (type-only, so erased at compile time).
- **Namespace discovery is dynamic:** a new channel prefix in `asyncapi.yaml` automatically gets its own constant group and union type without modifying this script.
